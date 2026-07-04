"""Slack Web API client for agent task delivery."""

from __future__ import annotations

import os
import re
import time
import uuid
from typing import Any

import requests

SLACK_API = "https://slack.com/api"
MAX_MESSAGE_LEN = 4000


def get_bot_token() -> str:
    from src.markdowns import get_setting

    return (os.environ.get("SLACK_BOT_TOKEN") or get_setting("slack_bot_token") or "").strip()


def get_default_channel_id() -> str:
    from src.markdowns import get_setting

    return (
        os.environ.get("SLACK_DEFAULT_CHANNEL_ID")
        or get_setting("slack_default_channel_id")
        or ""
    ).strip()


def _headers() -> dict[str, str]:
    token = get_bot_token()
    if not token:
        raise RuntimeError(
            "Slack bot token not configured (Settings → Agent tasks, or set SLACK_BOT_TOKEN)"
        )
    return {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json; charset=utf-8",
    }


def _api(method: str, *, json: dict | None = None, params: dict | None = None) -> dict:
    r = requests.post(
        f"{SLACK_API}/{method}",
        headers=_headers(),
        json=json,
        params=params,
        timeout=15,
    )
    r.raise_for_status()
    data = r.json()
    if not data.get("ok"):
        err = data.get("error") or "unknown_error"
        if err == "ratelimited":
            retry = float(data.get("retry_after", 1))
            time.sleep(min(retry, 10))
            r = requests.post(
                f"{SLACK_API}/{method}",
                headers=_headers(),
                json=json,
                params=params,
                timeout=15,
            )
            r.raise_for_status()
            data = r.json()
            if not data.get("ok"):
                raise RuntimeError(data.get("error") or "Slack API error")
            return data
        raise RuntimeError(err)
    return data


def get_status() -> dict[str, Any]:
    token = get_bot_token()
    if not token:
        return {"configured": False, "connected": False, "error": "No bot token"}
    try:
        data = _api("auth.test")
        return {
            "configured": True,
            "connected": True,
            "username": data.get("user") or data.get("user_id"),
            "team": data.get("team"),
            "id": data.get("user_id"),
            "default_channel_id": get_default_channel_id() or None,
        }
    except requests.RequestException as e:
        return {"configured": True, "connected": False, "error": str(e)}
    except RuntimeError as e:
        msg = str(e)
        if msg in ("invalid_auth", "token_revoked", "not_authed"):
            return {"configured": True, "connected": False, "error": "Invalid bot token"}
        return {"configured": True, "connected": False, "error": msg}


def normalize_channel_id(channel: str) -> str:
    """Accept a Slack channel ID; map legacy # names to the default channel."""
    ch = (channel or "").strip()
    if ch.startswith("#"):
        default = get_default_channel_id()
        if default:
            return default
        raise ValueError(
            f"Channel name {ch!r} is not supported; set slack_default_channel_id "
            "or use a Slack channel ID (open channel details → copy channel ID)"
        )
    if not re.fullmatch(r"[CDG][A-Z0-9]{8,}", ch, re.IGNORECASE):
        raise ValueError(
            "channel must be a Slack channel ID (starts with C, G, or D, followed by alphanumeric characters)"
        )
    return ch.upper()


def list_channels() -> list[dict[str, str]]:
    out: list[dict[str, str]] = []
    cursor: str | None = None
    while True:
        params: dict[str, str | int] = {
            "types": "public_channel,private_channel",
            "exclude_archived": "true",
            "limit": 200,
        }
        if cursor:
            params["cursor"] = cursor
        data = _api("conversations.list", params=params)
        for ch in data.get("channels") or []:
            if ch.get("is_archived"):
                continue
            cid = str(ch.get("id", ""))
            name = ch.get("name", "")
            prefix = "🔒" if ch.get("is_private") else "#"
            out.append({"id": cid, "name": name, "label": f"{prefix}{name}"})
        cursor = (data.get("response_metadata") or {}).get("next_cursor") or ""
        if not cursor:
            break
    out.sort(key=lambda x: x["name"].lower())
    return out


def normalize_user_id(user_id: str) -> str:
    """Accept a Slack member ID (U… or W…)."""
    uid = (user_id or "").strip().upper()
    if not re.fullmatch(r"[UW][A-Z0-9]{8,}", uid):
        raise ValueError(
            "slack_user_id must be a Slack user ID (starts with U or W, followed by alphanumeric characters)"
        )
    return uid


def format_user_mention(user_id: str) -> str:
    return f"<@{normalize_user_id(user_id)}>"


def list_users() -> list[dict[str, str]]:
    out: list[dict[str, str]] = []
    cursor: str | None = None
    while True:
        params: dict[str, str | int] = {"limit": 200}
        if cursor:
            params["cursor"] = cursor
        data = _api("users.list", params=params)
        for member in data.get("members") or []:
            if member.get("deleted") or member.get("id") == "USLACKBOT":
                continue
            uid = str(member.get("id", ""))
            profile = member.get("profile") or {}
            name = (
                profile.get("display_name")
                or profile.get("real_name")
                or member.get("name")
                or uid
            )
            if member.get("is_bot"):
                name = f"{name} (bot)"
            out.append({"id": uid, "name": name, "label": name})
        cursor = (data.get("response_metadata") or {}).get("next_cursor") or ""
        if not cursor:
            break
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


def send_messages(channel_id: str, parts: list[str], *, mention_user_id: str | None = None) -> None:
    """Send one or more messages to a Slack channel, optionally mentioning a user."""
    channel_id = normalize_channel_id(channel_id)
    mention = format_user_mention(mention_user_id) if mention_user_id else ""
    non_empty = [p.strip() for p in parts if p and p.strip()]
    if not non_empty:
        non_empty = [" "]

    multi = len(non_empty) > 1
    session_id = str(uuid.uuid4()) if multi else None

    payloads: list[str] = []
    if multi:
        payloads.append(
            f"{mention + ' ' if mention else ''}"
            f"I am sending multiple messages for an agent task (session {session_id}). "
            "Process all parts in order."
        )
    else:
        first = non_empty[0]
        non_empty = non_empty[1:]
        payloads.append(f"{mention + ' ' if mention else ''}{first}")
        mention = ""
    for part in non_empty:
        body = part
        if multi:
            body = f"[task:{session_id}] {body}"
        payloads.extend(_chunk_text(body))
    if multi:
        payloads.append(f"End of agent task session {session_id}.")

    for content in payloads:
        _api("chat.postMessage", json={"channel": channel_id, "text": content})
