"""Background scheduler that sends IRC messages on cron schedules.

Uses a dedicated nick ('astro-schedule') that joins a channel, sends the
message, then parts — keeping the channel clean between scheduled posts.
"""

import json
import socket
import threading
import time
from datetime import datetime, timezone

from croniter import croniter

from src.notes import list_scheduled_messages, mark_scheduled_message_run


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


class IRCScheduler:
    _instance = None
    _lock = threading.Lock()

    def __init__(self):
        self._stopping = False
        self._thread: threading.Thread | None = None

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

    def _tick(self):
        messages = list_scheduled_messages()
        now = datetime.now(timezone.utc)

        for msg in messages:
            if not msg.enabled:
                continue
            try:
                if not croniter.is_valid(msg.cron_expr):
                    continue
                cron = croniter(msg.cron_expr, now)
                prev_fire = cron.get_prev(datetime)
                since_fire = (now - prev_fire).total_seconds()

                if since_fire > CHECK_INTERVAL + 5:
                    continue

                if msg.last_run_at:
                    last_run = datetime.fromisoformat(msg.last_run_at.replace("Z", "+00:00"))
                    if (now - last_run).total_seconds() < 50:
                        continue

                parts = _parse_messages(msg.message)
                self._send_messages(msg.channel, parts)
                mark_scheduled_message_run(msg.id)
                print(f"[IRC Scheduler] Sent {len(parts)} message(s) to {msg.channel}")
            except Exception as e:
                print(f"[IRC Scheduler] Failed for schedule id={msg.id}: {e}")

    def _send_message(self, channel: str, message: str):
        """Public interface used by the run-now API endpoint."""
        parts = _parse_messages(message)
        self._send_messages(channel, parts)

    def _send_messages(self, channel: str, messages: list[str]):
        from src.notes import get_setting
        try:
            port = int(get_setting("irc_port") or IRC_PORT)
        except (TypeError, ValueError):
            port = IRC_PORT

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

            for msg in messages:
                for line in msg.split("\n"):
                    line = line.rstrip()
                    if not line:
                        continue
                    while len(line) > 400:
                        chunk = line[:400]
                        line = line[400:]
                        self._raw(sock, f"PRIVMSG {channel} :{chunk}")
                    self._raw(sock, f"PRIVMSG {channel} :{line}")
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
