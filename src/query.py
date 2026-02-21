"""RAG query chain using OpenAI with tool calling."""

import json
from dataclasses import dataclass
from datetime import date, datetime, timezone

import requests as http_requests
from zoneinfo import ZoneInfo

from ddgs import DDGS
from langchain_core.documents import Document
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage
from langchain_openai import ChatOpenAI

from src.notes import create_action_item, get_openai_api_key, list_categories
from src.store import get_retriever, upsert_action_item

SYSTEM_PROMPT = """\
You are a helpful assistant. Answer the user's question based only on the
provided context. If the context doesn't contain enough information to fully
answer the question, say so clearly.

The context may include different types of items:
- Documents: uploaded files and their content
- Notes: user-created notes
- Action items: tasks/to-dos that may be OPEN or COMPLETED, optionally marked
  as HOT (urgent), with due dates and categories. When the user asks about
  "action items", "tasks", or "to-dos", refer to these.

You can create new action items when the user asks. Use the create_action_item
tool for this. If the user mentions urgency or priority, set hot=true. If they
mention a deadline or due date, include it as due_date in YYYY-MM-DD format.
If the user specifies a category, try to match it to an available category name.

You can also search the web using the web_search tool when the user asks about
current events, facts you don't know, or anything that would benefit from live
web results. Summarize the results clearly and cite sources when possible.

Context:
{context}"""

DIRECT_SYSTEM_PROMPT = """\
You are a helpful assistant. You can create action items when the user asks.
Use the create_action_item tool for this. If the user mentions urgency or
priority, set hot=true. If they mention a deadline or due date, include it
as due_date in YYYY-MM-DD format.

You can also search the web using the web_search tool when the user asks about
current events, facts you don't know, or anything that would benefit from live
web results. Summarize the results clearly and cite sources when possible."""

EMAIL_PROMPT_ADDON = """

You can search the user's Outlook email using the email_search tool when they
ask about their emails, messages, inbox, or specific correspondence. Search
results include the full body text of each email, so you usually do NOT need
to call email_read afterwards — only use email_read if the body was truncated.

IMPORTANT: When the user asks for emails by date (today, yesterday, this week,
last 3 days, etc.), you MUST use the received_after and/or received_before
parameters to filter by date. Do NOT rely on the query text alone for date
filtering — it will not work. Convert relative dates to ISO 8601 (YYYY-MM-DD)
using today's date. Examples:
- "emails from today" → received_after = today's date
- "emails from yesterday" → received_after = yesterday, received_before = today
- "emails this week" → received_after = Monday of this week

You can read the full content of a specific email using the email_read tool
with the email's id (returned by email_search). Use this when the user wants
to see the full text of an email, not just the preview.

When presenting email results, always include the message id, sender, subject,
and date. Include links to individual emails when available."""

BASE_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "create_action_item",
            "description": "Create a new action item / task / to-do. Use this when the user asks to add, create, or make a new action item, task, or to-do.",
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {
                        "type": "string",
                        "description": "The title/description of the action item",
                    },
                    "hot": {
                        "type": "boolean",
                        "description": "Whether this is urgent/high priority. Default false.",
                    },
                    "due_date": {
                        "type": "string",
                        "description": "Optional due date in YYYY-MM-DD format",
                    },
                    "category_name": {
                        "type": "string",
                        "description": "Optional category name to assign",
                    },
                },
                "required": ["title"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "web_search",
            "description": "Search the web for current information. Use this when the user asks about current events, recent news, facts you're unsure about, or anything that would benefit from live web results.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "The search query",
                    },
                    "max_results": {
                        "type": "integer",
                        "description": "Maximum number of results to return (default 5, max 10)",
                    },
                },
                "required": ["query"],
            },
        },
    },
]

EMAIL_SEARCH_TOOL = {
    "type": "function",
    "function": {
        "name": "email_search",
        "description": (
            "Search the user's Outlook email. Use this when the user asks about "
            "their emails, messages, inbox, or specific correspondence. Returns "
            "matching emails with id, subject, sender, date, full body text, and link. "
            "For date-based queries (today, yesterday, this week, etc.), always "
            "use received_after and/or received_before to filter reliably."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": (
                        "The search query. Supports keywords and KQL syntax "
                        "like from:name, subject:topic, hasAttachment:true. "
                        "Can be empty string when using only date filters."
                    ),
                },
                "max_results": {
                    "type": "integer",
                    "description": "Maximum number of emails to return (default 10, max 20)",
                },
                "received_after": {
                    "type": "string",
                    "description": (
                        "Filter emails received on or after this date/datetime. "
                        "Use ISO 8601 format: YYYY-MM-DD or YYYY-MM-DDTHH:MM:SSZ. "
                        "Example: for today's emails use today's date."
                    ),
                },
                "received_before": {
                    "type": "string",
                    "description": (
                        "Filter emails received before this date/datetime. "
                        "Use ISO 8601 format: YYYY-MM-DD or YYYY-MM-DDTHH:MM:SSZ. "
                        "Example: for yesterday only, set received_after to yesterday "
                        "and received_before to today."
                    ),
                },
            },
            "required": ["query"],
        },
    },
}

EMAIL_READ_TOOL = {
    "type": "function",
    "function": {
        "name": "email_read",
        "description": (
            "Read the full content of a specific email by its id. Use this when "
            "the user wants to see the complete body of an email, not just the "
            "preview from search results. Requires the message id from email_search."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "message_id": {
                    "type": "string",
                    "description": "The email message id (from email_search results)",
                },
            },
            "required": ["message_id"],
        },
    },
}


def _get_tools(graph_token: str | None = None) -> list:
    """Return available tools, including email tools only when Outlook is connected."""
    tools = list(BASE_TOOLS)
    if graph_token:
        tools.append(EMAIL_SEARCH_TOOL)
        tools.append(EMAIL_READ_TOOL)
    return tools


@dataclass
class QueryResult:
    answer: str
    model: str


def _format_docs(docs: list[Document]) -> str:
    return "\n\n---\n\n".join(
        f"[Source: {d.metadata.get('source', 'unknown')}]\n{d.page_content}"
        for d in docs
    )


def _build_history(history: list[dict]) -> list:
    """Convert list of {role, content} dicts to LangChain message objects."""
    msgs = []
    for m in history:
        if m["role"] == "user":
            msgs.append(HumanMessage(content=m["content"]))
        elif m["role"] == "assistant":
            msgs.append(AIMessage(content=m["content"]))
    return msgs


def _resolve_category_id(name: str | None) -> int | None:
    """Match a category name to its ID (case-insensitive)."""
    if not name:
        return None
    cats = list_categories()
    lower = name.lower().strip()
    for c in cats:
        if c.name.lower() == lower:
            return c.id
    return None


def _local_date_to_utc_iso(date_str: str, tz: ZoneInfo) -> str:
    """Convert a bare YYYY-MM-DD date to midnight in the user's timezone, expressed as UTC ISO."""
    local_dt = datetime.strptime(date_str, "%Y-%m-%d").replace(tzinfo=tz)
    utc_dt = local_dt.astimezone(timezone.utc)
    return utc_dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def _execute_tool_call(
    tool_call, graph_token: str | None = None, user_timezone: str | None = None,
) -> str:
    """Execute a tool call and return a result string."""
    name = tool_call["name"]
    args = tool_call["args"]

    if name == "create_action_item":
        title = args.get("title", "Untitled")
        hot = args.get("hot", False)
        due_date = args.get("due_date")
        category_name = args.get("category_name")
        category_id = _resolve_category_id(category_name)

        item = create_action_item(title, hot=hot, due_date=due_date, category_id=category_id)

        # Vectorize with full context
        cat_label = category_name if category_id else None
        upsert_action_item(
            item.id, item.title,
            completed=item.completed, hot=item.hot,
            due_date=item.due_date, category_name=cat_label,
        )

        result = {"ok": True, "id": item.id, "title": item.title}
        if hot:
            result["hot"] = True
        if due_date:
            result["due_date"] = due_date
        if category_name and category_id:
            result["category"] = category_name
        return json.dumps(result)

    if name == "web_search":
        query = args.get("query", "")
        max_results = min(args.get("max_results", 5), 10)
        try:
            with DDGS() as ddgs:
                results = list(ddgs.text(query, max_results=max_results))
            formatted = []
            for r in results:
                formatted.append({
                    "title": r.get("title", ""),
                    "url": r.get("href", ""),
                    "snippet": r.get("body", ""),
                })
            return json.dumps({"results": formatted})
        except Exception as e:
            return json.dumps({"error": f"Search failed: {str(e)}"})

    if name == "email_search":
        if not graph_token:
            return json.dumps({"error": "Outlook not connected"})
        query = args.get("query", "")
        max_results = min(args.get("max_results", 10), 20)
        received_after = args.get("received_after")
        received_before = args.get("received_before")
        try:
            params: dict = {
                "$top": max_results,
                "$select": "id,subject,from,receivedDateTime,bodyPreview,body,webLink,hasAttachments",
                "$orderby": "receivedDateTime desc",
            }

            # Build $filter for date range on receivedDateTime.
            # Convert bare dates (YYYY-MM-DD) to midnight in the user's
            # local timezone so "today" aligns with their actual day.
            user_tz = None
            if user_timezone:
                try:
                    user_tz = ZoneInfo(user_timezone)
                except Exception:
                    pass

            filters = []
            if received_after:
                dt = received_after
                if len(dt) == 10:  # YYYY-MM-DD
                    dt = _local_date_to_utc_iso(dt, user_tz) if user_tz else dt + "T00:00:00Z"
                filters.append(f"receivedDateTime ge {dt}")
            if received_before:
                dt = received_before
                if len(dt) == 10:
                    dt = _local_date_to_utc_iso(dt, user_tz) if user_tz else dt + "T00:00:00Z"
                filters.append(f"receivedDateTime lt {dt}")
            if filters:
                params["$filter"] = " and ".join(filters)

            # $search and $filter can be combined on the messages endpoint;
            # only add $search when the user provided keywords.
            if query:
                params["$search"] = f'"{query}"'

            graph_headers = {
                "Authorization": f"Bearer {graph_token}",
                "Prefer": 'outlook.body-content-type="text"',
            }

            resp = http_requests.get(
                "https://graph.microsoft.com/v1.0/me/messages",
                headers=graph_headers,
                params=params,
                timeout=15,
            )
            resp.raise_for_status()
            data = resp.json()

            # Graph may ignore $select for body when $search is used,
            # so fetch each message individually to get the full body.
            emails = []
            for msg in data.get("value", []):
                msg_id = msg.get("id", "")
                sender = msg.get("from", {}).get("emailAddress", {})
                body_content = msg.get("body", {}).get("content", "")

                if not body_content and msg_id:
                    try:
                        detail = http_requests.get(
                            f"https://graph.microsoft.com/v1.0/me/messages/{msg_id}",
                            headers=graph_headers,
                            params={"$select": "body"},
                            timeout=10,
                        )
                        detail.raise_for_status()
                        body_content = detail.json().get("body", {}).get("content", "")
                        if not body_content:
                            body_content = msg.get("bodyPreview", "")
                    except Exception:
                        body_content = msg.get("bodyPreview", "")

                if len(body_content) > 8000:
                    body_content = body_content[:8000] + "\n\n[... truncated ...]"
                emails.append({
                    "id": msg_id,
                    "subject": msg.get("subject", ""),
                    "from": sender.get("name", sender.get("address", "")),
                    "date": msg.get("receivedDateTime", ""),
                    "body": body_content,
                    "link": msg.get("webLink", ""),
                })
            return json.dumps({"results": emails})
        except Exception as e:
            return json.dumps({"error": f"Email search failed: {str(e)}"})

    if name == "email_read":
        if not graph_token:
            return json.dumps({"error": "Outlook not connected"})
        message_id = args.get("message_id", "")
        if not message_id:
            return json.dumps({"error": "message_id is required"})
        try:
            resp = http_requests.get(
                f"https://graph.microsoft.com/v1.0/me/messages/{message_id}",
                headers={
                    "Authorization": f"Bearer {graph_token}",
                    "Prefer": 'outlook.body-content-type="text"',
                },
                params={
                    "$select": "subject,from,toRecipients,ccRecipients,"
                               "receivedDateTime,body,hasAttachments,webLink",
                },
                timeout=15,
            )
            resp.raise_for_status()
            msg = resp.json()
            sender = msg.get("from", {}).get("emailAddress", {})
            to_list = [
                r.get("emailAddress", {}).get("name", r.get("emailAddress", {}).get("address", ""))
                for r in msg.get("toRecipients", [])
            ]
            cc_list = [
                r.get("emailAddress", {}).get("name", r.get("emailAddress", {}).get("address", ""))
                for r in msg.get("ccRecipients", [])
            ]
            body_content = msg.get("body", {}).get("content", "")
            # Trim very long emails to stay within LLM context limits
            if len(body_content) > 12000:
                body_content = body_content[:12000] + "\n\n[... email truncated ...]"
            result = {
                "subject": msg.get("subject", ""),
                "from": sender.get("name", sender.get("address", "")),
                "to": to_list,
                "date": msg.get("receivedDateTime", ""),
                "has_attachments": msg.get("hasAttachments", False),
                "link": msg.get("webLink", ""),
                "body": body_content,
            }
            if cc_list:
                result["cc"] = cc_list
            return json.dumps(result)
        except Exception as e:
            return json.dumps({"error": f"Email read failed: {str(e)}"})

    return json.dumps({"error": f"Unknown tool: {name}"})


def _invoke_with_tools(
    llm, messages, model: str,
    graph_token: str | None = None,
    user_timezone: str | None = None,
) -> QueryResult:
    """Invoke LLM with tool support, handling tool calls if any."""
    tools = _get_tools(graph_token)
    llm_with_tools = llm.bind_tools(tools)
    response = llm_with_tools.invoke(messages)

    # If no tool calls, return directly
    if not response.tool_calls:
        actual_model = response.response_metadata.get("model_name", model)
        return QueryResult(answer=response.content, model=actual_model)

    # Process tool calls
    messages.append(response)
    for tc in response.tool_calls:
        result = _execute_tool_call(tc, graph_token=graph_token, user_timezone=user_timezone)
        messages.append(ToolMessage(content=result, tool_call_id=tc["id"]))

    # Get final response after tool execution
    final = llm_with_tools.invoke(messages)
    actual_model = final.response_metadata.get("model_name", model)
    return QueryResult(answer=final.content, model=actual_model)


def _today_and_tz_blurb(user_timezone: str | None) -> str:
    """Return a short system-prompt snippet with today's date in the user's timezone."""
    if user_timezone:
        try:
            tz = ZoneInfo(user_timezone)
            local_today = datetime.now(tz).strftime("%Y-%m-%d")
            return f"\n\nToday's date is {local_today} (user's timezone: {user_timezone})."
        except Exception:
            pass
    return f"\n\nToday's date is {date.today().isoformat()}."


def ask(
    question: str,
    model: str = "gpt-5-mini",
    history: list[dict] | None = None,
    graph_token: str | None = None,
    user_timezone: str | None = None,
) -> QueryResult:
    """Ask a question with RAG context and optional conversation history."""
    retriever = get_retriever()
    docs = retriever.invoke(question)
    context = _format_docs(docs)

    llm = ChatOpenAI(model=model, api_key=get_openai_api_key())
    system_content = SYSTEM_PROMPT.format(context=context)
    system_content += _today_and_tz_blurb(user_timezone)
    if graph_token:
        system_content += EMAIL_PROMPT_ADDON
    messages = [SystemMessage(content=system_content)]
    if history:
        messages.extend(_build_history(history))
    messages.append(HumanMessage(content=question))

    return _invoke_with_tools(llm, messages, model, graph_token=graph_token, user_timezone=user_timezone)


def ask_direct(
    question: str,
    model: str = "gpt-5-mini",
    history: list[dict] | None = None,
    graph_token: str | None = None,
    user_timezone: str | None = None,
) -> QueryResult:
    """Ask a question directly with optional conversation history."""
    llm = ChatOpenAI(model=model, api_key=get_openai_api_key())
    system_content = DIRECT_SYSTEM_PROMPT
    system_content += _today_and_tz_blurb(user_timezone)
    if graph_token:
        system_content += EMAIL_PROMPT_ADDON
    messages = [SystemMessage(content=system_content)]
    if history:
        messages.extend(_build_history(history))
    messages.append(HumanMessage(content=question))

    return _invoke_with_tools(llm, messages, model, graph_token=graph_token, user_timezone=user_timezone)
