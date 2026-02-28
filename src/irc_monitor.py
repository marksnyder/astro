"""Background IRC monitor that joins all channels and persists messages to SQLite.

Runs as a daemon thread alongside the main Astro IRC client. Uses a
dedicated nick ('astro-log') to passively observe every channel on the
server. Periodically re-scans the channel list so newly created channels
are picked up automatically.
"""

import socket
import sqlite3
import threading
import time
from pathlib import Path

IRC_HOST = "127.0.0.1"
IRC_PORT = 6667
MONITOR_NICK = "astro-log"
RECONNECT_DELAY = 5
CHANNEL_SCAN_INTERVAL = 10
PAGE_SIZE = 100

DB_PATH = Path(__file__).resolve().parent.parent / "data" / "astro.db"


def _db() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def _persist(channel: str, sender: str, text: str, kind: str, ts: float):
    conn = _db()
    try:
        conn.execute(
            "INSERT INTO irc_history (channel, sender, text, kind, timestamp) VALUES (?, ?, ?, ?, ?)",
            (channel, sender, text, kind, ts),
        )
        conn.commit()
    finally:
        conn.close()


def _save_monitored_channel(channel: str):
    conn = _db()
    try:
        conn.execute(
            "INSERT OR IGNORE INTO irc_monitored_channels (channel) VALUES (?)",
            (channel,),
        )
        conn.commit()
    finally:
        conn.close()


def _load_monitored_channels() -> set[str]:
    conn = _db()
    try:
        rows = conn.execute("SELECT channel FROM irc_monitored_channels").fetchall()
        return {r["channel"] for r in rows}
    finally:
        conn.close()


def get_history(channel: str, before_id: int | None = None, limit: int = PAGE_SIZE) -> list[dict]:
    """Return up to `limit` messages for a channel, ordered newest-first.

    If `before_id` is given, only messages with id < before_id are returned
    (for pagination). Results are returned in chronological order (oldest first)
    so the frontend can append naturally.
    """
    conn = _db()
    try:
        if before_id:
            rows = conn.execute(
                "SELECT id, channel, sender, text, kind, timestamp FROM irc_history "
                "WHERE channel = ? AND id < ? ORDER BY id DESC LIMIT ?",
                (channel, before_id, limit),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT id, channel, sender, text, kind, timestamp FROM irc_history "
                "WHERE channel = ? ORDER BY id DESC LIMIT ?",
                (channel, limit),
            ).fetchall()
        return [
            {
                "id": r["id"],
                "channel": r["channel"],
                "sender": r["sender"],
                "text": r["text"],
                "kind": r["kind"],
                "timestamp": r["timestamp"],
                "self": False,
            }
            for r in reversed(rows)
        ]
    finally:
        conn.close()


def get_unread_counts(since: dict[str, float]) -> dict[str, int]:
    """Return message counts per channel for messages newer than given timestamps.

    `since` maps channel name -> unix timestamp. Only 'message' kind counts.
    """
    conn = _db()
    try:
        counts: dict[str, int] = {}
        for ch, ts in since.items():
            row = conn.execute(
                "SELECT COUNT(*) AS cnt FROM irc_history "
                "WHERE channel = ? AND timestamp > ? AND kind = 'message'",
                (ch, ts),
            ).fetchone()
            counts[ch] = row["cnt"] if row else 0
        return counts
    finally:
        conn.close()


class IRCMonitor:
    """Singleton daemon that silently logs all IRC traffic to the database."""

    _instance = None
    _lock = threading.Lock()

    def __init__(self):
        self._sock: socket.socket | None = None
        self._stopping = False
        self._thread: threading.Thread | None = None
        self._recv_buf = ""
        self._registered = False
        self._joined_channels: set[str] = set()
        self._known_channels: list[dict] = []
        self._scanning = False
        self._scan_channels: list[str] = []
        self._scan_details: dict[str, dict] = {}

    @classmethod
    def get(cls) -> "IRCMonitor":
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = cls()
                    cls._instance.start()
        return cls._instance

    def get_channels(self) -> list[dict]:
        """Return the most recently discovered channel list."""
        with self._lock:
            return list(self._known_channels)

    def start(self):
        self._stopping = False
        self._thread = threading.Thread(target=self._run, daemon=True, name="irc-monitor")
        self._thread.start()

    def stop(self):
        self._stopping = True
        if self._sock:
            try:
                self._sock.close()
            except Exception:
                pass

    def _run(self):
        while not self._stopping:
            try:
                self._connect()
                self._main_loop()
            except Exception as e:
                if self._stopping:
                    break
                print(f"[IRC Monitor] Connection lost: {e}")
            finally:
                self._registered = False
                self._joined_channels.clear()
                if self._sock:
                    try:
                        self._sock.close()
                    except Exception:
                        pass
                    self._sock = None
            if self._stopping:
                break
            time.sleep(RECONNECT_DELAY)

    def _connect(self):
        from src.notes import get_setting
        try:
            port = int(get_setting("irc_port") or IRC_PORT)
        except (TypeError, ValueError):
            port = IRC_PORT

        self._sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self._sock.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
        self._sock.settimeout(10)
        self._sock.connect((IRC_HOST, port))

        self._raw_send(f"NICK {MONITOR_NICK}")
        self._raw_send(f"USER {MONITOR_NICK} 0 * :Astro IRC Monitor")

        deadline = time.monotonic() + 15
        while time.monotonic() < deadline:
            lines = self._recv_lines(timeout=2.0)
            self._process_lines(lines)
            if self._registered:
                break

        if not self._registered:
            raise RuntimeError("IRC monitor registration timed out")

        print(f"[IRC Monitor] Connected as {MONITOR_NICK}")
        self._rejoin_persisted()

    def _main_loop(self):
        self._begin_scan()
        last_scan = time.monotonic()
        while not self._stopping:
            self._sock.settimeout(5)
            try:
                data = self._sock.recv(8192)
            except socket.timeout:
                if self._stopping:
                    break
                if time.monotonic() - last_scan > CHANNEL_SCAN_INTERVAL:
                    self._begin_scan()
                    last_scan = time.monotonic()
                self._raw_send(f"PING :{int(time.time())}")
                continue
            except OSError:
                break
            if not data:
                break
            self._recv_buf += data.decode("utf-8", errors="replace")
            lines = []
            while "\r\n" in self._recv_buf:
                line, self._recv_buf = self._recv_buf.split("\r\n", 1)
                lines.append(line)
            self._process_lines(lines)

            if time.monotonic() - last_scan > CHANNEL_SCAN_INTERVAL:
                self._begin_scan()
                last_scan = time.monotonic()

    def _rejoin_persisted(self):
        """Join all channels saved in the DB (re-creates them on the server if needed)."""
        for ch in _load_monitored_channels():
            if ch not in self._joined_channels:
                self._raw_send(f"JOIN {ch}")
                self._joined_channels.add(ch)
                print(f"[IRC Monitor] Rejoined persisted {ch}")

    def _begin_scan(self):
        """Send LIST to start a non-blocking channel scan."""
        self._scanning = True
        self._scan_channels = []
        self._scan_details = {}
        self._raw_send("LIST")

    def _finish_scan(self):
        """Called when RPL_LISTEND (323) arrives — join new channels and update the known list."""
        self._scanning = False

        # Merge: server-listed channels + all persisted channels
        persisted = _load_monitored_channels()
        all_channels: dict[str, dict] = {}
        for ch, info in self._scan_details.items():
            all_channels[ch] = {"users": info.get("users", 0), "topic": info.get("topic", "")}
        for ch in persisted:
            if ch not in all_channels:
                all_channels[ch] = {"users": 0, "topic": ""}

        with self._lock:
            self._known_channels = [
                {"name": ch, **info}
                for ch, info in sorted(all_channels.items())
            ]

        # Join anything we're not already in (including persisted channels
        # that may have been destroyed — joining re-creates them)
        for ch in all_channels:
            if ch not in self._joined_channels:
                self._raw_send(f"JOIN {ch}")
                self._joined_channels.add(ch)
                _save_monitored_channel(ch)
                print(f"[IRC Monitor] Joined {ch}")

        # Persist any newly discovered channels from the scan
        for ch in self._scan_channels:
            _save_monitored_channel(ch)

    def _process_lines(self, lines: list[str]):
        for line in lines:
            if line.startswith("PING"):
                tok = line.split(":", 1)[-1] if ":" in line else line[5:]
                self._raw_send(f"PONG :{tok}")
                continue
            if " 001 " in line or " 376 " in line:
                self._registered = True
                continue
            if " 322 " in line:
                parts = line.split()
                if len(parts) >= 4:
                    name = parts[3]
                    count = int(parts[4]) if len(parts) >= 5 and parts[4].isdigit() else 0
                    topic = line.split(":", 2)[2] if line.count(":") >= 2 else ""
                    self._scan_channels.append(name)
                    self._scan_details[name] = {"users": count, "topic": topic}
                continue
            if " 323 " in line:
                self._finish_scan()
                continue
            if " 366 " in line:
                continue
            if " PRIVMSG " in line:
                self._handle_privmsg(line)
            elif " JOIN " in line:
                self._handle_join(line)
            elif " PART " in line or " QUIT " in line:
                self._handle_part_quit(line)

    def _handle_privmsg(self, line: str):
        sender = line.split("!", 1)[0].lstrip(":")
        if sender.lower() == MONITOR_NICK.lower():
            return
        after = line.split(" PRIVMSG ", 1)[1]
        channel = after.split(" ", 1)[0]
        text = after.split(" :", 1)[1] if " :" in after else ""
        _persist(channel, sender, text, "message", time.time())

    def _handle_join(self, line: str):
        sender = line.split("!", 1)[0].lstrip(":")
        if sender.lower() == MONITOR_NICK.lower():
            return
        channel_part = line.split(" JOIN ", 1)[1] if " JOIN " in line else ""
        channel = channel_part.strip().lstrip(":")
        if channel:
            _persist(channel, sender, "joined the channel", "join", time.time())

    def _handle_part_quit(self, line: str):
        sender = line.split("!", 1)[0].lstrip(":")
        if sender.lower() == MONITOR_NICK.lower():
            return
        if " PART " in line:
            channel = line.split(" PART ", 1)[1].split(" ", 1)[0].split(":", 1)[0].strip()
            if channel:
                _persist(channel, sender, "left the channel", "part", time.time())
        elif " QUIT " in line:
            for ch in self._joined_channels:
                _persist(ch, sender, "left the channel", "quit", time.time())

    def _raw_send(self, line: str):
        if self._sock:
            self._sock.sendall((line + "\r\n").encode("utf-8"))

    def _recv_lines(self, timeout: float = 10.0) -> list[str]:
        self._sock.settimeout(timeout)
        try:
            data = self._sock.recv(8192)
            if not data:
                return []
            self._recv_buf += data.decode("utf-8", errors="replace")
        except socket.timeout:
            return []
        lines: list[str] = []
        while "\r\n" in self._recv_buf:
            line, self._recv_buf = self._recv_buf.split("\r\n", 1)
            lines.append(line)
        return lines
