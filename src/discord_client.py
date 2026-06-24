"""Discord REST API client for agent task delivery."""

from __future__ import annotations

import os
import re
import uuid
from typing import Any

import requests

DISCORD_API = "https://discord.com/api/v10"
MAX_MESSAGE_LEN = 2000


def get_bot_token() -> str:
    from src.markdowns import get_setting

    return (os.environ.get("DISCORD_BOT_TOKEN") or get_setting("discord_bot_token") or "").strip()


def get_guild_id() -> str:
    from src.markdowns import get_setting

    return (os.environ.get("DISCORD_GUILD_ID") or get_setting("discord_guild_id") or "").strip()


def get_default_channel_id() -> str:
    from src.markdowns import get_setting

    return (
        os.environ.get("DISCORD_DEFAULT_CHANNEL_ID")
        or get_setting("discord_default_channel_id")
        or ""
    ).strip()


def _headers() -> dict[str, str]:
    token = get_bot_token()
    if not token:
        raise RuntimeError(
            "Discord bot token not configured (set DISCORD_BOT_TOKEN or discord_bot_token setting)"
        )
    return {
        "Authorization": f"Bot {token}",
        "Content-Type": "application/json",
        "User-Agent": "Astro (https://runastro.sh, 1.0)",
    }


def get_status() -> dict[str, Any]:
    token = get_bot_token()
    if not token:
        return {"configured": False, "connected": False, "error": "No bot token"}
    try:
        r = requests.get(f"{DISCORD_API}/users/@me", headers=_headers(), timeout=10)
        if r.status_code == 401:
            return {"configured": True, "connected": False, "error": "Invalid bot token"}
        r.raise_for_status()
        data = r.json()
        return {
            "configured": True,
            "connected": True,
            "username": data.get("username"),
            "id": data.get("id"),
            "guild_id": get_guild_id() or None,
            "default_channel_id": get_default_channel_id() or None,
        }
    except requests.RequestException as e:
        return {"configured": True, "connected": False, "error": str(e)}


def normalize_channel_id(channel: str) -> str:
    """Accept a Discord snowflake ID; map legacy IRC names to the default channel."""
    ch = (channel or "").strip()
    if ch.startswith("#"):
        default = get_default_channel_id()
        if default:
            return default
        raise ValueError(
            f"IRC-style channel {ch!r} is not supported; set discord_default_channel_id "
            "or use a Discord channel ID (Developer Mode → right-click channel → Copy Channel ID)"
        )
    if not re.fullmatch(r"\d{17,20}", ch):
        raise ValueError(
            "channel must be a Discord channel ID (numeric snowflake, 17–20 digits)"
        )
    return ch


def list_channels() -> list[dict[str, str]]:
    guild_id = get_guild_id()
    if not guild_id:
        return []
    r = requests.get(
        f"{DISCORD_API}/guilds/{guild_id}/channels",
        headers=_headers(),
        timeout=15,
    )
    r.raise_for_status()
    out: list[dict[str, str]] = []
    for ch in r.json():
        if ch.get("type") not in (0, 5):
            continue
        cid = str(ch.get("id", ""))
        name = ch.get("name", "")
        out.append({"id": cid, "name": name, "label": f"#{name}"})
    out.sort(key=lambda x: x["name"].lower())
    return out


def _chunk_text(text: str, max_len: int = MAX_MESSAGE_LEN) -> list[str]:
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    if len(text) <= max_len:
        return [text] if text else []
    chunks: list[str] = []
    while text:
        if len(text) <= max_len:
            chunks.append(text)
            break
        split_at = text.rfind("\n", 0, max_len)
        if split_at <= 0:
            split_at = max_len
        chunks.append(text[:split_at].rstrip())
        text = text[split_at:].lstrip()
    return chunks


def send_messages(channel_id: str, parts: list[str]) -> None:
    """Send one or more messages to a Discord channel."""
    channel_id = normalize_channel_id(channel_id)
    non_empty = [p.strip() for p in parts if p and p.strip()]
    if not non_empty:
        non_empty = [" "]

    multi = len(non_empty) > 1
    session_id = str(uuid.uuid4()) if multi else None

    payloads: list[str] = []
    if multi:
        payloads.append(
            f"I am sending multiple messages for an agent task (session {session_id}). "
            "Process all parts in order."
        )
    for part in non_empty:
        body = part
        if multi:
            body = f"[task:{session_id}] {body}"
        payloads.extend(_chunk_text(body))
    if multi:
        payloads.append(f"End of agent task session {session_id}.")

    for content in payloads:
        r = requests.post(
            f"{DISCORD_API}/channels/{channel_id}/messages",
            headers=_headers(),
            json={"content": content},
            timeout=15,
        )
        if r.status_code == 429:
            retry = float(r.json().get("retry_after", 1))
            import time

            time.sleep(min(retry, 10))
            r = requests.post(
                f"{DISCORD_API}/channels/{channel_id}/messages",
                headers=_headers(),
                json={"content": content},
                timeout=15,
            )
        r.raise_for_status()
