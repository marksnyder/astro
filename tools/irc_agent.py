"""
IRC Agent — bridges an IRC channel to Claude Code CLI.

Joins an IRC channel as a bot, responds to every message (except its own),
pipes them to `claude --print` (non-interactive mode), and sends the
response back to the channel. Checks Claude login status on startup.

Usage:
    python -m tools.irc_agent --host HOST --port PORT --channel CHANNEL [--nick NICK]
"""

import argparse
import socket
import subprocess
import sys
import threading
import time
import os

NICK_DEFAULT = "astro-agent"
MAX_IRC_LINE = 400
CLAUDE_TIMEOUT = 300


def parse_args():
    p = argparse.ArgumentParser(description="IRC ↔ Claude Code agent")
    p.add_argument("--host", required=True, help="IRC server hostname")
    p.add_argument("--port", required=True, type=int, help="IRC server port")
    p.add_argument("--channel", required=True, help="IRC channel to join (e.g. #astro)")
    p.add_argument("--nick", default=NICK_DEFAULT, help="Bot nickname")
    return p.parse_args()


class IRCAgent:
    def __init__(self, host: str, port: int, channel: str, nick: str):
        self.host = host
        self.port = port
        self.channel = channel if channel.startswith("#") else f"#{channel}"
        self.nick = nick
        self.sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.sock.settimeout(300)
        self.running = True
        self.workdir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

    def connect(self):
        print(f"[agent] Connecting to {self.host}:{self.port} as {self.nick}...")
        self.sock.connect((self.host, self.port))
        self._send(f"NICK {self.nick}")
        self._send(f"USER {self.nick} 0 * :Astro IRC Agent")
        time.sleep(1)
        self._send(f"JOIN {self.channel}")
        print(f"[agent] Joined {self.channel}")

    def _send(self, msg: str):
        self.sock.sendall(f"{msg}\r\n".encode("utf-8"))

    def say(self, target: str, text: str):
        for line in text.split("\n"):
            line = line.strip()
            if not line:
                continue
            for chunk in self._chunk(line, MAX_IRC_LINE):
                self._send(f"PRIVMSG {target} :{chunk}")
                time.sleep(0.3)

    def _chunk(self, text: str, max_len: int):
        while len(text) > max_len:
            split = text.rfind(" ", 0, max_len)
            if split <= 0:
                split = max_len
            yield text[:split]
            text = text[split:].lstrip()
        if text:
            yield text

    def run_claude(self, prompt: str) -> str:
        """Run claude CLI in non-interactive print mode with full tool access."""
        try:
            result = subprocess.run(
                [
                    "npx", "-y", "@anthropic-ai/claude-code",
                    "--print",
                    "--tools", "default",
                    "--allowedTools", "Bash,Edit,Write,Read,Glob,Grep,WebFetch,TodoRead,TodoWrite,MultiEdit",
                    "-p", prompt,
                ],
                capture_output=True,
                text=True,
                timeout=CLAUDE_TIMEOUT,
                cwd=self.workdir,
            )
            output = result.stdout.strip()
            if not output:
                output = result.stderr.strip() or "(no output)"
            return output
        except subprocess.TimeoutExpired:
            return "(timed out after 5 minutes)"
        except Exception as e:
            return f"(error: {e})"

    def handle_privmsg(self, sender: str, target: str, message: str):
        if sender.lower() == self.nick.lower():
            return

        prompt = message.strip()
        if not prompt:
            return

        reply_to = target if target.startswith("#") else sender
        self.say(reply_to, f"{sender}: Working on it...")

        def worker():
            response = self.run_claude(prompt)
            lines = response.split("\n")
            if len(lines) > 30:
                truncated = "\n".join(lines[:30])
                response = f"{truncated}\n... ({len(lines) - 30} more lines truncated)"
            self.say(reply_to, f"{sender}: {response}")

        threading.Thread(target=worker, daemon=True).start()

    def parse_line(self, line: str):
        if line.startswith("PING"):
            self._send(f"PONG {line.split(' ', 1)[1]}")
            return

        if "PRIVMSG" not in line:
            return

        try:
            prefix, rest = line[1:].split(" ", 1)
            sender = prefix.split("!")[0]
            _, target_msg = rest.split("PRIVMSG ", 1)
            target, message = target_msg.split(" :", 1)
            self.handle_privmsg(sender, target.strip(), message.strip())
        except (ValueError, IndexError):
            pass

    def listen(self):
        buf = ""
        while self.running:
            try:
                data = self.sock.recv(4096)
                if not data:
                    print("[agent] Connection closed by server")
                    break
                buf += data.decode("utf-8", errors="replace")
                lines = buf.split("\r\n")
                buf = lines.pop()
                for line in lines:
                    if line.strip():
                        self.parse_line(line)
            except socket.timeout:
                continue
            except Exception as e:
                print(f"[agent] Error: {e}")
                break

    def stop(self):
        self.running = False
        try:
            self._send(f"QUIT :Astro agent shutting down")
        except Exception:
            pass
        try:
            self.sock.close()
        except Exception:
            pass


def ensure_claude_ready():
    """Launch Claude interactively to handle login, terms of service, etc."""
    print("[agent] Checking Claude Code readiness...")
    check = subprocess.run(
        ["npx", "-y", "@anthropic-ai/claude-code", "--print", "-p", "say hello"],
        capture_output=True, text=True, timeout=30,
    )
    if check.returncode != 0:
        output = check.stdout + check.stderr
        print(f"[agent] Claude needs attention: {output.strip()[:200]}")
        print("[agent] Launching Claude interactively — complete any prompts, then type /exit")
        subprocess.run(
            ["npx", "-y", "@anthropic-ai/claude-code"],
            timeout=300,
        )
        print("[agent] Re-checking...")
        verify = subprocess.run(
            ["npx", "-y", "@anthropic-ai/claude-code", "--print", "-p", "say hello"],
            capture_output=True, text=True, timeout=30,
        )
        if verify.returncode != 0:
            print(f"[agent] WARNING: Claude may still not be ready. Continuing anyway.")
        else:
            print("[agent] Claude Code is ready.")
    else:
        print("[agent] Claude Code is ready.")


def main():
    args = parse_args()

    ensure_claude_ready()

    agent = IRCAgent(args.host, args.port, args.channel, args.nick)

    try:
        agent.connect()
        print(f"[agent] Listening in {agent.channel} — responding to all messages")
        print(f"[agent] Working directory: {agent.workdir}")
        print(f"[agent] Press Ctrl+C to stop")
        agent.listen()
    except KeyboardInterrupt:
        print("\n[agent] Shutting down...")
    finally:
        agent.stop()


if __name__ == "__main__":
    main()
