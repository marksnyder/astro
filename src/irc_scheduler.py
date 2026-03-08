"""Background scheduler that sends IRC prompt messages on cron schedules.

Only prompts with a non-empty cron_expr are scheduled; on-demand prompts
are skipped.  Uses a dedicated nick ('astro-schedule') that joins a channel,
sends the message, then parts.
"""

import json
import socket
import threading
import time
import uuid
from datetime import datetime, timezone

from croniter import croniter

from src.markups import list_prompts, mark_prompt_run


def _parse_messages(raw: str) -> list[str]:
    """Parse message field: JSON array or plain string."""
    try:
        parsed = json.loads(raw)
        if isinstance(parsed, list):
            return [str(m) for m in parsed if str(m).strip()]
    except (json.JSONDecodeError, TypeError):
        pass
    return [raw] if raw.strip() else []

IRC_HOST = "127.0.0.1"
IRC_PORT = 6667
SCHEDULER_NICK = "astro-schedule"
CHECK_INTERVAL = 30


CHANNEL_COOLDOWN = 60


class ChannelCooldownError(Exception):
    """Raised when a channel is still within its send cooldown window."""
    def __init__(self, channel: str, wait_seconds: float):
        self.channel = channel
        self.wait_seconds = wait_seconds
        super().__init__(f"Channel {channel} on cooldown, {wait_seconds:.0f}s remaining")


class IRCScheduler:
    _instance = None
    _lock = threading.Lock()

    def __init__(self):
        self._stopping = False
        self._thread: threading.Thread | None = None
        self._channel_last_send: dict[str, float] = {}
        self._channel_send_lock = threading.Lock()

    @classmethod
    def get(cls) -> "IRCScheduler":
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = cls()
                    cls._instance.start()
        return cls._instance

    def start(self):
        self._stopping = False
        self._thread = threading.Thread(target=self._run, daemon=True, name="irc-scheduler")
        self._thread.start()
        print("[IRC Scheduler] Started")

    def stop(self):
        self._stopping = True

    def _run(self):
        time.sleep(5)
        while not self._stopping:
            try:
                self._tick()
            except Exception as e:
                print(f"[IRC Scheduler] Error during tick: {e}")
            for _ in range(CHECK_INTERVAL):
                if self._stopping:
                    return
                time.sleep(1)

    def _channel_cooldown_remaining(self, channel: str) -> float:
        with self._channel_send_lock:
            last = self._channel_last_send.get(channel)
        if last is None:
            return 0.0
        elapsed = time.monotonic() - last
        return max(0.0, CHANNEL_COOLDOWN - elapsed)

    def _record_channel_send(self, channel: str):
        with self._channel_send_lock:
            self._channel_last_send[channel] = time.monotonic()

    def _wait_for_channel(self, channel: str):
        remaining = self._channel_cooldown_remaining(channel)
        if remaining > 0:
            print(f"[IRC Scheduler] Waiting {remaining:.0f}s for {channel} cooldown")
            while remaining > 0 and not self._stopping:
                time.sleep(min(remaining, 1.0))
                remaining = self._channel_cooldown_remaining(channel)

    def _tick(self):
        prompts = list_prompts()
        now = datetime.now(timezone.utc)

        for p in prompts:
            if not p.cron_expr or not p.cron_expr.strip():
                continue
            try:
                if not croniter.is_valid(p.cron_expr):
                    continue
                cron = croniter(p.cron_expr, now)
                prev_fire = cron.get_prev(datetime)
                since_fire = (now - prev_fire).total_seconds()

                if since_fire > CHECK_INTERVAL + 5:
                    continue

                if p.last_run_at:
                    last_run = datetime.fromisoformat(p.last_run_at.replace("Z", "+00:00"))
                    if (now - last_run).total_seconds() < 50:
                        continue

                self._wait_for_channel(p.channel)
                if self._stopping:
                    return

                parts = _parse_messages(p.message)
                self._send_messages(p.channel, parts)
                self._record_channel_send(p.channel)
                mark_prompt_run(p.id)
                print(f"[IRC Scheduler] Sent {len(parts)} message(s) to {p.channel}")
            except Exception as e:
                print(f"[IRC Scheduler] Failed for prompt id={p.id}: {e}")

    def _send_message(self, channel: str, message: str):
        """Public interface used by the run-now API endpoint."""
        remaining = self._channel_cooldown_remaining(channel)
        if remaining > 0:
            raise ChannelCooldownError(channel, remaining)
        parts = _parse_messages(message)
        self._send_messages(channel, parts)
        self._record_channel_send(channel)

    def _send_messages(self, channel: str, messages: list[str]):
        from src.markups import get_setting
        try:
            port = int(get_setting("irc_port") or IRC_PORT)
        except (TypeError, ValueError):
            port = IRC_PORT

        multi = len(messages) > 1
        session_id = str(uuid.uuid4()) if multi else None

        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
        sock.settimeout(10)
        try:
            sock.connect((IRC_HOST, port))
            self._raw(sock, f"NICK {SCHEDULER_NICK}")
            self._raw(sock, f"USER {SCHEDULER_NICK} 0 * :Astro Scheduler")

            if not self._wait_for_registration(sock):
                raise RuntimeError("Registration timed out")

            self._raw(sock, f"JOIN {channel}")
            time.sleep(0.3)

            if multi:
                intro = (
                    f"I am going to send you multiple messages under a session "
                    f"identified by {session_id}. Listen until I tell you that "
                    f"session is complete. Each message will be tagged with this "
                    f"identifier."
                )
                self._raw(sock, f"PRIVMSG {channel} :{intro}")
                time.sleep(0.2)

            for msg in messages:
                text = msg.replace("\r\n", " ").replace("\n", " ").replace("\r", " ").strip()
                if not text:
                    continue
                if multi:
                    text = f"[{session_id}] {text}"
                while len(text) > 350:
                    chunk = text[:350]
                    text = text[350:]
                    self._raw(sock, f"PRIVMSG {channel} :{chunk}")
                    time.sleep(0.1)
                if text:
                    self._raw(sock, f"PRIVMSG {channel} :{text}")
                time.sleep(0.2)

            if multi:
                self._raw(sock, f"PRIVMSG {channel} :Session {session_id} is now complete. Please acknowledge")
                time.sleep(0.2)

            time.sleep(0.1)
            self._raw(sock, f"PART {channel}")
            time.sleep(0.2)
            self._raw(sock, "QUIT :done")
        finally:
            try:
                sock.close()
            except Exception:
                pass

    def _wait_for_registration(self, sock: socket.socket) -> bool:
        buf = ""
        deadline = time.monotonic() + 10
        while time.monotonic() < deadline:
            sock.settimeout(2)
            try:
                data = sock.recv(4096)
                if not data:
                    return False
                buf += data.decode("utf-8", errors="replace")
            except socket.timeout:
                continue
            while "\r\n" in buf:
                line, buf = buf.split("\r\n", 1)
                if line.startswith("PING"):
                    tok = line.split(":", 1)[-1] if ":" in line else line[5:]
                    self._raw(sock, f"PONG :{tok}")
                if " 001 " in line or " 376 " in line:
                    return True
        return False

    def _raw(self, sock: socket.socket, line: str):
        sock.sendall((line + "\r\n").encode("utf-8"))
