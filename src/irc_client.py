"""Persistent IRC client for the Astro chat UI.

Maintains a long-lived connection to the local IRC server, buffers
messages, and pushes new messages to WebSocket listeners in real time.
"""

import asyncio
import socket
import threading
import time
import uuid


IRC_HOST = "127.0.0.1"
IRC_PORT = 6667
IRC_CHANNEL = "#astro"
IRC_NICK = "astro"
MAX_MESSAGES = 500
RECONNECT_DELAY = 3


class IRCClient:
    _instance = None
    _lock = threading.Lock()

    def __init__(self):
        self.nick = IRC_NICK
        self.channel = IRC_CHANNEL
        self.host = IRC_HOST
        self.port = IRC_PORT
        self.connected = False
        self.messages: list[dict] = []
        self._msg_id = 0
        self._sock: socket.socket | None = None
        self._thread: threading.Thread | None = None
        self._recv_buf = ""
        self._msg_lock = threading.Lock()
        self._registered = False
        self._joined = False
        self._listeners: list[asyncio.Queue] = []
        self._listeners_lock = threading.Lock()

    @classmethod
    def get(cls) -> "IRCClient":
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = cls()
                    cls._instance.start()
        return cls._instance

    def subscribe(self) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue()
        with self._listeners_lock:
            self._listeners.append(q)
        return q

    def unsubscribe(self, q: asyncio.Queue):
        with self._listeners_lock:
            try:
                self._listeners.remove(q)
            except ValueError:
                pass

    def start(self):
        self._thread = threading.Thread(target=self._run, daemon=True, name="irc-client")
        self._thread.start()

    def _run(self):
        while True:
            try:
                self._connect()
                self._read_loop()
            except Exception as e:
                print(f"[IRC Client] Connection lost: {e}")
            finally:
                self.connected = False
                self._registered = False
                self._joined = False
                if self._sock:
                    try:
                        self._sock.close()
                    except Exception:
                        pass
                    self._sock = None
            time.sleep(RECONNECT_DELAY)

    def _connect(self):
        from src.notes import get_setting
        try:
            self.port = int(get_setting("irc_port") or IRC_PORT)
        except (TypeError, ValueError):
            self.port = IRC_PORT

        self._sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self._sock.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
        self._sock.settimeout(10)
        self._sock.connect((self.host, self.port))

        nick = self.nick
        self._raw_send(f"NICK {nick}")
        self._raw_send(f"USER {nick} 0 * :Astro UI")

        deadline = time.monotonic() + 15
        while time.monotonic() < deadline:
            lines = self._recv_lines(timeout=2.0)
            self._process_lines(lines)
            if self._registered:
                break

        if not self._registered:
            raise RuntimeError("IRC registration timed out")

        self._raw_send(f"JOIN {self.channel}")
        deadline = time.monotonic() + 10
        while time.monotonic() < deadline:
            lines = self._recv_lines(timeout=2.0)
            self._process_lines(lines)
            if self._joined:
                break

        self.connected = True
        self._sock.settimeout(300)
        print(f"[IRC Client] Connected as {nick} to {self.channel}")

    def _read_loop(self):
        while True:
            self._sock.settimeout(300)
            try:
                data = self._sock.recv(8192)
            except socket.timeout:
                self._raw_send(f"PING :{int(time.time())}")
                continue
            if not data:
                break
            self._recv_buf += data.decode("utf-8", errors="replace")
            lines = []
            while "\r\n" in self._recv_buf:
                line, self._recv_buf = self._recv_buf.split("\r\n", 1)
                lines.append(line)
            self._process_lines(lines)

    def _process_lines(self, lines: list[str]):
        for line in lines:
            if line.startswith("PING"):
                tok = line.split(":", 1)[-1] if ":" in line else line[5:]
                self._raw_send(f"PONG :{tok}")
                continue
            if " 001 " in line or " 376 " in line:
                self._registered = True
                continue
            if " 366 " in line:
                self._joined = True
                continue
            if " PRIVMSG " in line:
                self._handle_privmsg(line)
            elif " JOIN " in line:
                self._handle_join(line)
            elif " PART " in line or " QUIT " in line:
                self._handle_part(line)

    def _handle_privmsg(self, line: str):
        sender = line.split("!", 1)[0].lstrip(":")
        after = line.split(" PRIVMSG ", 1)[1]
        if " :" in after:
            text = after.split(" :", 1)[1]
        else:
            text = after.split(" ", 1)[1] if " " in after else ""
        self._add_message(sender, text, "message")

    def _handle_join(self, line: str):
        sender = line.split("!", 1)[0].lstrip(":")
        if sender.lower() == self.nick.lower():
            return
        self._add_message(sender, "joined the channel", "join")

    def _handle_part(self, line: str):
        sender = line.split("!", 1)[0].lstrip(":")
        if sender.lower() == self.nick.lower():
            return
        kind = "quit" if " QUIT " in line else "part"
        self._add_message(sender, "left the channel", kind)

    def _add_message(self, sender: str, text: str, kind: str = "message"):
        with self._msg_lock:
            self._msg_id += 1
            msg = {
                "id": self._msg_id,
                "sender": sender,
                "text": text,
                "kind": kind,
                "timestamp": time.time(),
                "self": sender.lower() == self.nick.lower(),
            }
            self.messages.append(msg)
            if len(self.messages) > MAX_MESSAGES:
                self.messages = self.messages[-MAX_MESSAGES:]

        with self._listeners_lock:
            dead = []
            for q in self._listeners:
                try:
                    q.put_nowait(msg)
                except Exception:
                    dead.append(q)
            for q in dead:
                try:
                    self._listeners.remove(q)
                except ValueError:
                    pass

    def send_message(self, text: str):
        if not self.connected or not self._sock:
            raise RuntimeError("Not connected to IRC server")
        for line in text.split("\n"):
            line = line.rstrip()
            if not line:
                continue
            while len(line) > 400:
                chunk = line[:400]
                line = line[400:]
                self._raw_send(f"PRIVMSG {self.channel} :{chunk}")
                self._add_message(self.nick, chunk)
            self._raw_send(f"PRIVMSG {self.channel} :{line}")
            self._add_message(self.nick, line)

    def get_messages(self, after_id: int = 0) -> list[dict]:
        with self._msg_lock:
            return [m for m in self.messages if m["id"] > after_id]

    def get_status(self) -> dict:
        return {
            "connected": self.connected,
            "nick": self.nick,
            "channel": self.channel,
        }

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
