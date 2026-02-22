"""RAG query chain using OpenAI with tool calling."""

import json
from dataclasses import dataclass
from datetime import date, datetime

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


def _resolve_category_id(name: str | None, universe_id: int = 1) -> int | None:
    """Match a category name to its ID (case-insensitive), scoped to universe."""
    if not name:
        return None
    cats = list_categories(universe_id=universe_id)
    lower = name.lower().strip()
    for c in cats:
        if c.name.lower() == lower:
            return c.id
    return None


def _execute_tool_call(tool_call, user_timezone: str | None = None, universe_id: int = 1) -> str:
    """Execute a tool call and return a result string."""
    name = tool_call["name"]
    args = tool_call["args"]

    if name == "create_action_item":
        title = args.get("title", "Untitled")
        hot = args.get("hot", False)
        due_date = args.get("due_date")
        category_name = args.get("category_name")
        category_id = _resolve_category_id(category_name, universe_id=universe_id)

        item = create_action_item(title, hot=hot, due_date=due_date, category_id=category_id, universe_id=universe_id)

        cat_label = category_name if category_id else None
        upsert_action_item(
            item.id, item.title,
            completed=item.completed, hot=item.hot,
            due_date=item.due_date, category_name=cat_label,
            universe_id=universe_id,
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

    return json.dumps({"error": f"Unknown tool: {name}"})


def _invoke_with_tools(
    llm, messages, model: str,
    user_timezone: str | None = None,
    universe_id: int = 1,
) -> QueryResult:
    """Invoke LLM with tool support, handling tool calls if any."""
    llm_with_tools = llm.bind_tools(BASE_TOOLS)
    response = llm_with_tools.invoke(messages)

    if not response.tool_calls:
        actual_model = response.response_metadata.get("model_name", model)
        return QueryResult(answer=response.content, model=actual_model)

    messages.append(response)
    for tc in response.tool_calls:
        result = _execute_tool_call(tc, user_timezone=user_timezone, universe_id=universe_id)
        messages.append(ToolMessage(content=result, tool_call_id=tc["id"]))

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
    user_timezone: str | None = None,
    universe_id: int | None = None,
) -> QueryResult:
    """Ask a question with RAG context and optional conversation history."""
    retriever = get_retriever(universe_id=universe_id)
    docs = retriever.invoke(question)
    print(f"[Astro] RAG retrieved {len(docs)} docs for universe={universe_id}:")
    for i, d in enumerate(docs):
        src = d.metadata.get("source", "unknown")
        print(f"  [{i}] source={src!r}, len={len(d.page_content)}, preview={d.page_content[:120]!r}")
    context = _format_docs(docs)

    llm = ChatOpenAI(model=model, api_key=get_openai_api_key())
    system_content = SYSTEM_PROMPT.format(context=context)
    system_content += _today_and_tz_blurb(user_timezone)
    messages = [SystemMessage(content=system_content)]
    if history:
        messages.extend(_build_history(history))
    messages.append(HumanMessage(content=question))

    return _invoke_with_tools(llm, messages, model, user_timezone=user_timezone, universe_id=universe_id or 1)


def ask_direct(
    question: str,
    model: str = "gpt-5-mini",
    history: list[dict] | None = None,
    user_timezone: str | None = None,
    universe_id: int = 1,
) -> QueryResult:
    """Ask a question directly with optional conversation history."""
    llm = ChatOpenAI(model=model, api_key=get_openai_api_key())
    system_content = DIRECT_SYSTEM_PROMPT
    system_content += _today_and_tz_blurb(user_timezone)
    messages = [SystemMessage(content=system_content)]
    if history:
        messages.extend(_build_history(history))
    messages.append(HumanMessage(content=question))

    return _invoke_with_tools(llm, messages, model, user_timezone=user_timezone, universe_id=universe_id)
