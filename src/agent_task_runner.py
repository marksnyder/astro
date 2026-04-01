"""Background runner for Agent Tasks: sends markdown instructions to IRC as astro-task-runner."""

import json
import socket
import threading
import time
import uuid
from datetime import datetime, timezone

from croniter import croniter

from src.markdowns import (
    get_agent_task,
    get_markdown,
    get_setting,
    list_agent_tasks,
    mark_agent_task_run,
)

IRC_HOST = "127.0.0.1"
IRC_PORT = 6667
TASK_RUNNER_NICK = "astro-task-runner"
CHECK_INTERVAL = 30
CHANNEL_COOLDOWN = 60


DEFAULT_AGENT_TASK_TEMPLATE = """Follow these instructions from the knowledge base.

**{markdown_title}** (markdown_id: {markdown_id})

Read the full markdown via HTTP GET (include your API key if configured):
{read_url}

You can also use the `read_markdown` MCP tool with markdown_id={markdown_id}.

---
{markdown_body}
"""


class ChannelCooldownError(Exception):
    def __init__(self, channel: str, wait_seconds: float):
        self.channel = channel
        self.wait_seconds = wait_seconds
        super().__init__(f"Channel {channel} on cooldown, {wait_seconds:.0f}s remaining")


def _base_url() -> str:
    u = (get_setting("agent_task_base_url") or "").strip()
    if u:
        return u.rstrip("/")
    return "http://127.0.0.1:8000"


def build_agent_task_message(markdown_id: int, markdown_title: str, markdown_body: str) -> str:
    tpl = (get_setting("agent_task_message_template") or "").strip() or DEFAULT_AGENT_TASK_TEMPLATE
    base = _base_url()
    read_url = f"{base}/api/markdowns/{markdown_id}"
    try:
        return tpl.format(
            markdown_id=markdown_id,
            markdown_title=markdown_title or "Untitled",
            markdown_body=markdown_body or "",
            read_url=read_url,
            markdown_read_url=read_url,
        )
    except KeyError as e:
        raise ValueError(f"Invalid placeholder in agent task template: {e}") from e


def _parse_messages_for_irc(raw: str) -> list[str]:
    """Split into IRC-sized chunks (long lines split at 350 chars)."""
    lines = raw.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    chunks: list[str] = []
    for line in lines:
        line = line.strip()
        if not line:
            chunks.append("")
            continue
        while len(line) > 0:
            if len(line) <= 350:
                chunks.append(line)
                break
            chunks.append(line[:350])
            line = line[350:].lstrip()
    return [c for c in chunks if c or chunks]  # keep structure - actually empty lines as spacing
    # Simpler: flatten to single stream of privmsgs - old code used 350 limit on total message
    # Re-read old scheduler - it split by newlines in _parse_messages for JSON array
    # For plain text, send line by line, chunk long lines
    return chunks if chunks else [""]


def _send_irc_privmsgs(channel: str, parts: list[str]) -> None:
    from src.markdowns import get_setting

    try:
        port = int(get_setting("irc_port") or IRC_PORT)
    except (TypeError, ValueError):
        port = IRC_PORT

    multi = len([p for p in parts if p.strip()]) > 1
    session_id = str(uuid.uuid4()) if multi else None

    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
    sock.settimeout(10)
    try:
        sock.connect((IRC_HOST, port))
        _raw(sock, f"NICK {TASK_RUNNER_NICK}")
        _raw(sock, f"USER {TASK_RUNNER_NICK} 0 * :Astro Agent Task Runner")

        if not _wait_for_registration(sock):
            raise RuntimeError("IRC registration timed out")

        _raw(sock, f"JOIN {channel}")
        time.sleep(0.3)

        if multi:
            intro = (
                f"I am sending multiple messages for an agent task (session {session_id}). "
                f"Process all parts in order."
            )
            _raw(sock, f"PRIVMSG {channel} :{intro}")
            time.sleep(0.15)

        for msg in parts:
            text = msg.replace("\r\n", " ").replace("\n", " ").replace("\r", " ").strip()
            if not text:
                continue
            if multi:
                text = f"[task:{session_id}] {text}"
            while len(text) > 350:
                chunk = text[:350]
                text = text[350:]
                _raw(sock, f"PRIVMSG {channel} :{chunk}")
                time.sleep(0.08)
            if text:
                _raw(sock, f"PRIVMSG {channel} :{text}")
            time.sleep(0.12)

        if multi:
            _raw(sock, f"PRIVMSG {channel} :End of agent task session {session_id}.")
            time.sleep(0.1)

        time.sleep(0.1)
        _raw(sock, f"PART {channel}")
        time.sleep(0.15)
        _raw(sock, "QUIT :done")
    finally:
        try:
            sock.close()
        except Exception:
            pass


def _raw(sock: socket.socket, line: str) -> None:
    sock.sendall((line + "\r\n").encode("utf-8"))


def _wait_for_registration(sock: socket.socket) -> bool:
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
                _raw(sock, f"PONG :{tok}")
            if " 001 " in line or " 376 " in line:
                return True
    return False


class AgentTaskRunner:
    _instance = None
    _lock = threading.Lock()

    def __init__(self):
        self._stopping = False
        self._thread: threading.Thread | None = None
        self._channel_last_send: dict[str, float] = {}
        self._channel_send_lock = threading.Lock()

    @classmethod
    def get(cls) -> "AgentTaskRunner":
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = cls()
                    cls._instance.start()
        return cls._instance

    def start(self) -> None:
        self._stopping = False
        self._thread = threading.Thread(target=self._run, daemon=True, name="agent-task-runner")
        self._thread.start()
        print("[Agent Tasks] Scheduler started")

    def stop(self) -> None:
        self._stopping = True

    def _channel_cooldown_remaining(self, channel: str) -> float:
        with self._channel_send_lock:
            last = self._channel_last_send.get(channel)
        if last is None:
            return 0.0
        elapsed = time.monotonic() - last
        return max(0.0, CHANNEL_COOLDOWN - elapsed)

    def _record_channel_send(self, channel: str) -> None:
        with self._channel_send_lock:
            self._channel_last_send[channel] = time.monotonic()

    def _wait_for_channel(self, channel: str) -> None:
        remaining = self._channel_cooldown_remaining(channel)
        while remaining > 0 and not self._stopping:
            time.sleep(min(remaining, 1.0))
            remaining = self._channel_cooldown_remaining(channel)

    def _run(self) -> None:
        time.sleep(5)
        while not self._stopping:
            try:
                self._tick()
            except Exception as e:
                print(f"[Agent Tasks] Tick error: {e}")
            for _ in range(CHECK_INTERVAL):
                if self._stopping:
                    return
                time.sleep(1)

    def _tick(self) -> None:
        now = datetime.now(timezone.utc)
        tasks = [t for t in list_agent_tasks() if t.enabled]
        for t in tasks:
            if self._stopping:
                return
            if t.schedule_mode == "manual":
                continue
            if t.schedule_mode == "once":
                if not t.run_at:
                    continue
                try:
                    run_dt = datetime.fromisoformat(t.run_at.replace("Z", "+00:00"))
                except (ValueError, TypeError):
                    continue
                if now < run_dt:
                    continue
                if t.last_run_at:
                    try:
                        last = datetime.fromisoformat(t.last_run_at.replace("Z", "+00:00"))
                        if last >= run_dt:
                            continue
                    except (ValueError, TypeError):
                        pass
                self._wait_for_channel(t.channel)
                if self._stopping:
                    return
                try:
                    run_agent_task(t.id)
                except ChannelCooldownError as e:
                    print(f"[Agent Tasks] Cooldown {t.channel}: {e.wait_seconds:.0f}s")
                except Exception as e:
                    print(f"[Agent Tasks] Failed task {t.id}: {e}")
                continue

            if t.schedule_mode == "cron" and t.cron_expr and t.cron_expr.strip():
                if not croniter.is_valid(t.cron_expr.strip()):
                    continue
                cr = croniter(t.cron_expr.strip(), now)
                prev_fire = cr.get_prev(datetime)
                if prev_fire.tzinfo is None:
                    prev_fire = prev_fire.replace(tzinfo=timezone.utc)
                since_fire = (now - prev_fire).total_seconds()
                if since_fire > CHECK_INTERVAL + 5:
                    continue
                if t.last_run_at:
                    try:
                        last_run = datetime.fromisoformat(t.last_run_at.replace("Z", "+00:00"))
                        if (now - last_run).total_seconds() < 50:
                            continue
                    except (ValueError, TypeError):
                        pass
                self._wait_for_channel(t.channel)
                if self._stopping:
                    return
                try:
                    run_agent_task(t.id)
                except ChannelCooldownError as e:
                    print(f"[Agent Tasks] Cooldown {t.channel}: {e.wait_seconds:.0f}s")
                except Exception as e:
                    print(f"[Agent Tasks] Failed task {t.id}: {e}")


def run_agent_task(task_id: int) -> None:
    """Load task + markdown, build message, send via IRC, record run."""
    task = get_agent_task(task_id)
    if not task:
        raise ValueError("Task not found")
    if not task.enabled:
        raise ValueError("Task is disabled")
    md = get_markdown(task.markdown_id)
    if not md:
        raise ValueError("Markdown not found")
    text = build_agent_task_message(md.id or 0, md.title, md.body)
    parts = _lines_for_irc(text)
    runner = AgentTaskRunner.get()
    rem = runner._channel_cooldown_remaining(task.channel)
    if rem > 0:
        raise ChannelCooldownError(task.channel, rem)
    _send_irc_privmsgs(task.channel, parts)
    runner._record_channel_send(task.channel)
    mark_agent_task_run(task_id)


def _lines_for_irc(text: str) -> list[str]:
    """Split body into IRC lines; long lines split at 350 chars."""
    raw = text.replace("\r\n", "\n").replace("\r", "\n")
    out: list[str] = []
    for line in raw.split("\n"):
        line = line.rstrip()
        if not line:
            out.append(" ")
            continue
        while len(line) > 350:
            out.append(line[:350])
            line = line[350:]
        out.append(line)
    return out if out else [" "]


def send_agent_task_message_now(task_id: int) -> None:
    """Public entry used by API (ensures runner singleton)."""
    AgentTaskRunner.get()
    run_agent_task(task_id)
