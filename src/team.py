"""Team members and activities — CRUD + activity execution engine."""

import json
import random
import sqlite3
import threading
import traceback
import uuid
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path

from src.notes import DB_PATH, get_openai_api_key, get_setting

# ── Random name generation ────────────────────────────────────────────────

MALE_FIRST = [
    "James", "Robert", "Michael", "William", "David", "Richard", "Joseph",
    "Thomas", "Charles", "Daniel", "Matthew", "Anthony", "Mark", "Steven",
    "Andrew", "Paul", "Joshua", "Kenneth", "Kevin", "Brian", "George",
    "Timothy", "Ronald", "Edward", "Jason", "Jeffrey", "Ryan", "Jacob",
    "Nicholas", "Eric", "Jonathan", "Stephen", "Larry", "Justin", "Scott",
    "Brandon", "Benjamin", "Samuel", "Raymond", "Gregory", "Frank", "Patrick",
    "Alexander", "Jack", "Dennis", "Ethan", "Nathan", "Peter", "Zachary",
    "Kyle", "Noah", "Aaron", "Henry", "Adam", "Dylan", "Ian", "Owen",
    "Luke", "Caleb", "Marcus", "Leo", "Hugo", "Felix", "Oscar", "Elijah",
]

FEMALE_FIRST = [
    "Mary", "Patricia", "Jennifer", "Linda", "Barbara", "Elizabeth",
    "Susan", "Jessica", "Sarah", "Karen", "Lisa", "Nancy", "Betty",
    "Margaret", "Sandra", "Ashley", "Dorothy", "Kimberly", "Emily",
    "Donna", "Michelle", "Carol", "Amanda", "Melissa", "Deborah",
    "Stephanie", "Rebecca", "Sharon", "Laura", "Cynthia", "Kathleen",
    "Amy", "Angela", "Shirley", "Anna", "Brenda", "Pamela", "Emma",
    "Nicole", "Helen", "Samantha", "Katherine", "Christine", "Debra",
    "Rachel", "Carolyn", "Janet", "Catherine", "Maria", "Heather",
    "Diane", "Ruth", "Julie", "Olivia", "Joyce", "Virginia", "Victoria",
    "Kelly", "Lauren", "Christina", "Joan", "Evelyn", "Judith", "Andrea",
    "Hannah", "Megan", "Cheryl", "Jacqueline", "Martha", "Gloria", "Teresa",
    "Ann", "Sara", "Madison", "Frances", "Kathryn", "Janice", "Sophia",
    "Abigail", "Alice", "Judy", "Grace", "Amber", "Denise", "Marilyn",
    "Danielle", "Beverly", "Isabella", "Theresa", "Diana", "Natalie",
    "Brittany", "Charlotte", "Marie", "Kayla", "Alexis", "Lori", "Zoe",
    "Claire", "Isla", "Luna", "Aria", "Willow", "Hazel", "Violet",
]

LAST_NAMES = [
    "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller",
    "Davis", "Rodriguez", "Martinez", "Hernandez", "Lopez", "Gonzalez",
    "Wilson", "Anderson", "Thomas", "Taylor", "Moore", "Jackson", "Martin",
    "Lee", "Perez", "Thompson", "White", "Harris", "Sanchez", "Clark",
    "Ramirez", "Lewis", "Robinson", "Walker", "Young", "Allen", "King",
    "Wright", "Scott", "Torres", "Nguyen", "Hill", "Flores", "Green",
    "Adams", "Nelson", "Baker", "Hall", "Rivera", "Campbell", "Mitchell",
    "Carter", "Roberts", "Chen", "Kim", "Patel", "Singh", "Kumar",
    "Nakamura", "Tanaka", "Sato", "Watanabe", "Yamamoto", "Muller",
    "Weber", "Fischer", "Becker", "Rossi", "Russo", "Colombo", "Ferrari",
]


def random_name(gender: str | None = None) -> tuple[str, str]:
    """Return (full_name, gender) with random first/last name."""
    if gender is None:
        gender = random.choice(["male", "female"])
    first = random.choice(MALE_FIRST if gender == "male" else FEMALE_FIRST)
    last = random.choice(LAST_NAMES)
    return f"{first} {last}", gender


# ── Helpers ───────────────────────────────────────────────────────────────


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _get_conn() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


# ── Data classes ──────────────────────────────────────────────────────────


@dataclass
class TeamMember:
    id: int | None
    name: str
    type: str            # 'virtual'
    title: str
    profile: str
    gender: str
    avatar_seed: str
    created_at: str
    agent_name: str = ""  # IRC agent name; if set, routes through IRC bridge


@dataclass
class ActivityTask:
    id: int | None
    activity_id: int
    member_id: int
    instruction: str
    position: int
    member: TeamMember | None = None  # populated on read


@dataclass
class Activity:
    id: int | None
    name: str
    prompt: str           # overall activity context / description
    schedule: str         # 'manual', 'hourly', 'daily', 'weekly'
    created_at: str
    tasks: list[ActivityTask] | None = None


@dataclass
class ActivityRun:
    id: int | None
    activity_id: int
    status: str
    model: str
    started_at: str
    completed_at: str | None


@dataclass
class ActivityResponse:
    id: int | None
    run_id: int
    task_id: int
    member_id: int
    response: str
    created_at: str


# ── Row mappers ───────────────────────────────────────────────────────────


def _row_to_member(row: sqlite3.Row) -> TeamMember:
    keys = row.keys()
    return TeamMember(
        id=row["id"],
        name=row["name"],
        type=row["type"],
        title=row["title"],
        profile=row["profile"],
        gender=row["gender"],
        avatar_seed=row["avatar_seed"],
        created_at=row["created_at"],
        agent_name=row["agent_name"] if "agent_name" in keys else "",
    )


def _row_to_activity(row: sqlite3.Row) -> Activity:
    return Activity(
        id=row["id"],
        name=row["name"],
        prompt=row["prompt"],
        schedule=row["schedule"],
        created_at=row["created_at"],
    )


def _row_to_run(row: sqlite3.Row) -> ActivityRun:
    keys = row.keys()
    return ActivityRun(
        id=row["id"],
        activity_id=row["activity_id"],
        status=row["status"],
        model=row["model"] if "model" in keys else "",
        started_at=row["started_at"],
        completed_at=row["completed_at"],
    )


# ── Team Member CRUD ──────────────────────────────────────────────────────


def list_team_members(**_kwargs) -> list[TeamMember]:
    conn = _get_conn()
    rows = conn.execute(
        "SELECT * FROM team_members WHERE type = 'virtual' ORDER BY name ASC"
    ).fetchall()
    conn.close()
    return [_row_to_member(r) for r in rows]


def get_team_member(member_id: int) -> TeamMember | None:
    conn = _get_conn()
    row = conn.execute("SELECT * FROM team_members WHERE id = ?", (member_id,)).fetchone()
    conn.close()
    return _row_to_member(row) if row else None


def create_team_member(
    name: str | None = None,
    title: str = "",
    profile: str = "",
    gender: str | None = None,
    agent_name: str = "",
    **_kwargs,
) -> TeamMember:
    """Create a new virtual team member. If name/gender not provided, randomize."""
    if not name:
        name, gender = random_name(gender)
    elif not gender:
        gender = random.choice(["male", "female"])

    avatar_seed = uuid.uuid4().hex[:12]
    now = _now()
    conn = _get_conn()
    cur = conn.execute(
        """INSERT INTO team_members (name, type, title, profile, gender, avatar_seed, agent_name, created_at)
           VALUES (?, 'virtual', ?, ?, ?, ?, ?, ?)""",
        (name, title, profile, gender, avatar_seed, agent_name, now),
    )
    conn.commit()
    member_id = cur.lastrowid
    conn.close()

    member = TeamMember(
        id=member_id, name=name, type="virtual", title=title,
        profile=profile, gender=gender, avatar_seed=avatar_seed,
        created_at=now, agent_name=agent_name,
    )

    # Vectorize profile for RAG
    if profile.strip():
        _vectorize_member(member)

    return member


def update_team_member(
    member_id: int,
    name: str | None = None,
    title: str | None = None,
    profile: str | None = None,
    agent_name: str | None = None,
) -> TeamMember | None:
    conn = _get_conn()
    existing = conn.execute("SELECT * FROM team_members WHERE id = ?", (member_id,)).fetchone()
    if not existing:
        conn.close()
        return None

    new_name = name if name is not None else existing["name"]
    new_title = title if title is not None else existing["title"]
    new_profile = profile if profile is not None else existing["profile"]
    new_agent = agent_name if agent_name is not None else (existing["agent_name"] if "agent_name" in existing.keys() else "")

    conn.execute(
        "UPDATE team_members SET name = ?, title = ?, profile = ?, agent_name = ? WHERE id = ?",
        (new_name, new_title, new_profile, new_agent, member_id),
    )
    conn.commit()
    member = _row_to_member(conn.execute("SELECT * FROM team_members WHERE id = ?", (member_id,)).fetchone())
    conn.close()

    # Re-vectorize
    if new_profile.strip():
        _vectorize_member(member)
    else:
        _delete_member_vector(member_id)

    return member


def delete_team_member(member_id: int) -> bool:
    conn = _get_conn()
    cur = conn.execute("DELETE FROM team_members WHERE id = ?", (member_id,))
    conn.commit()
    conn.close()
    if cur.rowcount > 0:
        _delete_member_vector(member_id)
        return True
    return False


# ── Team member vectorization ─────────────────────────────────────────────


def _vectorize_member(member: TeamMember) -> None:
    """Put a team member's profile into the vector store for RAG."""
    try:
        from src.store import get_vectorstore
        from langchain_core.documents import Document

        store = get_vectorstore()
        doc_id = f"team-member-{member.id}"
        try:
            store._collection.delete(ids=[doc_id])
        except Exception:
            pass

        parts = [f"VIRTUAL AGENT: {member.name}"]
        if member.title:
            parts.append(f"Title: {member.title}")
        parts.append(f"Profile: {member.profile}")
        content = "\n".join(parts)

        doc = Document(
            page_content=content,
            metadata={
                "source": f"team-member: {member.name}",
                "team_member_id": member.id,
                "type": member.type,
            },
        )
        store.add_documents([doc], ids=[doc_id])
    except Exception:
        traceback.print_exc()


def _delete_member_vector(member_id: int) -> None:
    try:
        from src.store import get_vectorstore
        store = get_vectorstore()
        store._collection.delete(ids=[f"team-member-{member_id}"])
    except Exception:
        pass


# ── Activity CRUD ─────────────────────────────────────────────────────────


def _load_activity_tasks(conn: sqlite3.Connection, activity_id: int) -> list[ActivityTask]:
    rows = conn.execute(
        """SELECT at.*, tm.id as tm_id, tm.name as tm_name, tm.type as tm_type,
                  tm.title as tm_title, tm.profile as tm_profile,
                  tm.gender as tm_gender, tm.avatar_seed as tm_avatar_seed,
                  tm.created_at as tm_created_at
           FROM activity_tasks at
           JOIN team_members tm ON tm.id = at.member_id
           WHERE at.activity_id = ?
           ORDER BY at.position ASC""",
        (activity_id,),
    ).fetchall()
    tasks = []
    for r in rows:
        t = ActivityTask(
            id=r["id"], activity_id=r["activity_id"],
            member_id=r["member_id"], instruction=r["instruction"],
            position=r["position"],
        )
        t.member = TeamMember(
            id=r["tm_id"], name=r["tm_name"], type=r["tm_type"],
            title=r["tm_title"], profile=r["tm_profile"],
            gender=r["tm_gender"], avatar_seed=r["tm_avatar_seed"],
            created_at=r["tm_created_at"],
        )
        tasks.append(t)
    return tasks


def list_activities() -> list[Activity]:
    conn = _get_conn()
    rows = conn.execute("SELECT * FROM activities ORDER BY name ASC").fetchall()
    activities = []
    for r in rows:
        a = _row_to_activity(r)
        a.tasks = _load_activity_tasks(conn, a.id)
        activities.append(a)
    conn.close()
    return activities


def get_activity(activity_id: int) -> Activity | None:
    conn = _get_conn()
    row = conn.execute("SELECT * FROM activities WHERE id = ?", (activity_id,)).fetchone()
    if not row:
        conn.close()
        return None
    a = _row_to_activity(row)
    a.tasks = _load_activity_tasks(conn, a.id)
    conn.close()
    return a


def create_activity(
    name: str,
    prompt: str = "",
    schedule: str = "manual",
    tasks: list[dict] | None = None,
) -> Activity:
    now = _now()
    conn = _get_conn()
    cur = conn.execute(
        "INSERT INTO activities (name, prompt, schedule, collaboration_rounds, iterations, created_at) VALUES (?, ?, ?, 1, 1, ?)",
        (name, prompt, schedule, now),
    )
    activity_id = cur.lastrowid
    if tasks:
        for pos, t in enumerate(tasks):
            conn.execute(
                "INSERT INTO activity_tasks (activity_id, member_id, instruction, position) VALUES (?, ?, ?, ?)",
                (activity_id, t["member_id"], t.get("instruction", ""), pos),
            )
    conn.commit()
    conn.close()
    return get_activity(activity_id)  # type: ignore[return-value]


def update_activity(
    activity_id: int,
    name: str | None = None,
    prompt: str | None = None,
    schedule: str | None = None,
    tasks: list[dict] | None = None,
) -> Activity | None:
    conn = _get_conn()
    existing = conn.execute("SELECT * FROM activities WHERE id = ?", (activity_id,)).fetchone()
    if not existing:
        conn.close()
        return None

    conn.execute(
        "UPDATE activities SET name = ?, prompt = ?, schedule = ? WHERE id = ?",
        (
            name if name is not None else existing["name"],
            prompt if prompt is not None else existing["prompt"],
            schedule if schedule is not None else existing["schedule"],
            activity_id,
        ),
    )

    if tasks is not None:
        conn.execute("DELETE FROM activity_tasks WHERE activity_id = ?", (activity_id,))
        for pos, t in enumerate(tasks):
            conn.execute(
                "INSERT INTO activity_tasks (activity_id, member_id, instruction, position) VALUES (?, ?, ?, ?)",
                (activity_id, t["member_id"], t.get("instruction", ""), pos),
            )

    conn.commit()
    conn.close()
    return get_activity(activity_id)


def delete_activity(activity_id: int) -> bool:
    conn = _get_conn()
    cur = conn.execute("DELETE FROM activities WHERE id = ?", (activity_id,))
    conn.commit()
    conn.close()
    return cur.rowcount > 0


# ── Activity run history ──────────────────────────────────────────────────


def list_activity_runs(activity_id: int, limit: int = 20) -> list[ActivityRun]:
    conn = _get_conn()
    rows = conn.execute(
        "SELECT * FROM activity_runs WHERE activity_id = ? ORDER BY started_at DESC LIMIT ?",
        (activity_id, limit),
    ).fetchall()
    conn.close()
    return [_row_to_run(r) for r in rows]


def delete_activity_run(run_id: int) -> bool:
    conn = _get_conn()
    conn.execute("DELETE FROM activity_responses WHERE run_id = ?", (run_id,))
    cur = conn.execute("DELETE FROM activity_runs WHERE id = ?", (run_id,))
    conn.commit()
    deleted = cur.rowcount > 0
    conn.close()
    return deleted


def clear_activity_runs(activity_id: int) -> int:
    conn = _get_conn()
    run_ids = [r["id"] for r in conn.execute(
        "SELECT id FROM activity_runs WHERE activity_id = ?", (activity_id,)
    ).fetchall()]
    if run_ids:
        placeholders = ",".join("?" * len(run_ids))
        conn.execute(f"DELETE FROM activity_responses WHERE run_id IN ({placeholders})", run_ids)
        conn.execute(f"DELETE FROM activity_runs WHERE id IN ({placeholders})", run_ids)
        conn.commit()
    conn.close()
    return len(run_ids)


def get_activity_run(run_id: int) -> dict | None:
    """Get a run with its responses in task order."""
    conn = _get_conn()
    run_row = conn.execute("SELECT * FROM activity_runs WHERE id = ?", (run_id,)).fetchone()
    if not run_row:
        conn.close()
        return None
    run = _row_to_run(run_row)
    resp_rows = conn.execute(
        """SELECT ar.*, tm.name as member_name, tm.title as member_title,
                  tm.avatar_seed, tm.type as member_type,
                  at.instruction as task_instruction
           FROM activity_responses ar
           JOIN team_members tm ON tm.id = ar.member_id
           LEFT JOIN activity_tasks at ON at.id = ar.task_id
           WHERE ar.run_id = ?
           ORDER BY ar.id ASC""",
        (run_id,),
    ).fetchall()
    responses = []
    for rr in resp_rows:
        responses.append({
            "id": rr["id"],
            "run_id": rr["run_id"],
            "task_id": rr["task_id"],
            "member_id": rr["member_id"],
            "member_name": rr["member_name"],
            "member_title": rr["member_title"],
            "avatar_seed": rr["avatar_seed"],
            "member_type": rr["member_type"],
            "task_instruction": rr["task_instruction"] or "",
            "response": rr["response"],
            "created_at": rr["created_at"],
        })
    conn.close()
    return {"run": asdict(run), "responses": responses}


# ── Activity execution engine ─────────────────────────────────────────────

_running_activities: set[int] = set()
_activity_lock = threading.Lock()


def run_activity(activity_id: int) -> dict:
    """Execute an activity by running each task sequentially.

    Returns {"run_id": int} on success.
    """
    with _activity_lock:
        if activity_id in _running_activities:
            return {"error": "Activity is already running", "busy": True}
        _running_activities.add(activity_id)

    try:
        return _execute_activity(activity_id)
    except Exception as exc:
        traceback.print_exc()
        return {"error": str(exc)}
    finally:
        with _activity_lock:
            _running_activities.discard(activity_id)


def _execute_activity(activity_id: int) -> dict:
    """Run each task in order.  Each member sees the full progression so far."""
    from openai import OpenAI
    from src.store import get_retriever

    activity = get_activity(activity_id)
    if not activity:
        raise ValueError("Activity not found")
    if not activity.tasks:
        raise ValueError("Activity has no tasks")

    api_key = get_openai_api_key()
    if not api_key:
        raise ValueError("OpenAI API key not configured")

    model = get_setting("selected_model", "gpt-4o-mini").strip() or "gpt-4o-mini"
    client = OpenAI(api_key=api_key)

    # Create run record
    conn = _get_conn()
    now = _now()
    cur = conn.execute(
        "INSERT INTO activity_runs (activity_id, status, model, started_at) VALUES (?, 'running', ?, ?)",
        (activity_id, model, now),
    )
    run_id = cur.lastrowid
    conn.commit()
    conn.close()

    print(f"[Activity] Starting run #{run_id} for '{activity.name}' — {len(activity.tasks)} task(s), model={model}")

    try:
        # Gather RAG context from the activity prompt + all task instructions
        combined_query = activity.prompt + " " + " ".join(t.instruction for t in activity.tasks if t.instruction)
        retriever = get_retriever(k=8)
        rag_docs = retriever.invoke(combined_query)
        rag_context = "\n\n---\n\n".join(
            f"[{d.metadata.get('source', 'unknown')}]\n{d.page_content}"
            for d in rag_docs
        )

        # conversation: ordered list of (task, member, response)
        conversation: list[tuple[ActivityTask, TeamMember, str]] = []

        for i, task in enumerate(activity.tasks):
            member = task.member
            if not member:
                continue

            print(f"[Activity]   Task {i + 1}: {member.name} — {task.instruction[:60]}...")

            if member.agent_name:
                # Route through IRC bridge
                user_msg = _build_task_prompt(activity, task, conversation)
                answer = _invoke_irc(member.agent_name, user_msg)
            else:
                # Route through OpenAI
                system = _build_member_system_prompt(member, rag_context)
                user_msg = _build_task_prompt(activity, task, conversation)
                answer = _invoke_with_tools(client, system_prompt=system, user_prompt=user_msg, model=model)

            conversation.append((task, member, answer))

            # Persist response
            conn = _get_conn()
            conn.execute(
                """INSERT INTO activity_responses (run_id, task_id, member_id, round, response, created_at)
                   VALUES (?, ?, ?, 1, ?, ?)""",
                (run_id, task.id, member.id, answer, _now()),
            )
            conn.commit()
            conn.close()

        # Mark complete
        conn = _get_conn()
        conn.execute(
            "UPDATE activity_runs SET status = 'completed', completed_at = ? WHERE id = ?",
            (_now(), run_id),
        )
        conn.commit()
        conn.close()

        print(f"[Activity] Run #{run_id} completed")
        return {"run_id": run_id}

    except Exception:
        conn = _get_conn()
        conn.execute(
            "UPDATE activity_runs SET status = 'failed', completed_at = ? WHERE id = ?",
            (_now(), run_id),
        )
        conn.commit()
        conn.close()
        raise


# ── Tool calling for virtual team members ─────────────────────────────────

ACTIVITY_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "web_search",
            "description": (
                "Search the web for current information. Use this when you need "
                "up-to-date facts, recent news, market data, or anything that "
                "would benefit from live web results."
            ),
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

MAX_TOOL_ROUNDS = 5  # prevent infinite tool-call loops


def _execute_activity_tool(name: str, args: dict) -> str:
    """Execute a tool call from a virtual team member."""
    if name == "web_search":
        from ddgs import DDGS

        query = args.get("query", "")
        max_results = min(args.get("max_results", 5), 10)
        try:
            with DDGS() as ddgs:
                results = list(ddgs.text(query, max_results=max_results))
            formatted = [
                {
                    "title": r.get("title", ""),
                    "url": r.get("href", ""),
                    "snippet": r.get("body", ""),
                }
                for r in results
            ]
            print(f"[Activity]   web_search({query!r}) → {len(formatted)} results")
            return json.dumps({"results": formatted})
        except Exception as e:
            print(f"[Activity]   web_search failed: {e}")
            return json.dumps({"error": f"Search failed: {str(e)}"})

    return json.dumps({"error": f"Unknown tool: {name}"})


IRC_TIMEOUT = 120  # seconds
IRC_HOST = "127.0.0.1"
IRC_PORT = 6667
IRC_CHANNEL = "#astro"
IRC_IDLE_TIMEOUT = 5  # seconds of silence after last bot message


def _irc_split_message(text: str, channel: str, max_payload: int = 400) -> list[str]:
    """Split a long message into IRC PRIVMSG commands."""
    cmds: list[str] = []
    for line in text.split("\n"):
        if not line:
            cmds.append(f"PRIVMSG {channel} : ")
            continue
        while len(line) > max_payload:
            cmds.append(f"PRIVMSG {channel} :{line[:max_payload]}")
            line = line[max_payload:]
        cmds.append(f"PRIVMSG {channel} :{line}")
    return cmds


def _invoke_irc(channel_or_nick: str, message: str) -> str:
    """Send a message to an IRC channel and wait for a response."""
    import socket
    import time

    port = IRC_PORT
    try:
        port = int(get_setting("irc_port") or IRC_PORT)
    except (TypeError, ValueError):
        pass

    nick = f"astro-{uuid.uuid4().hex[:6]}"
    channel = IRC_CHANNEL
    recv_buf = ""

    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(10)

    try:
        sock.connect((IRC_HOST, port))
    except ConnectionRefusedError:
        raise RuntimeError("IRC server is not running.")
    except OSError as e:
        raise RuntimeError(f"IRC connection failed: {e}")

    def _send(line: str):
        sock.sendall((line + "\r\n").encode("utf-8"))

    def _recv_lines(timeout: float = 10.0) -> list[str]:
        nonlocal recv_buf
        sock.settimeout(timeout)
        try:
            data = sock.recv(8192)
            if not data:
                return []
            recv_buf += data.decode("utf-8", errors="replace")
        except socket.timeout:
            return []
        lines: list[str] = []
        while "\r\n" in recv_buf:
            line, recv_buf = recv_buf.split("\r\n", 1)
            lines.append(line)
        return lines

    def _handle_pings(lines: list[str]):
        for line in lines:
            if line.startswith("PING"):
                tok = line.split(":", 1)[-1] if ":" in line else line[5:]
                _send(f"PONG :{tok}")

    def _wait_for(predicate, timeout: float = 15.0):
        """Read lines until predicate matches one, or timeout."""
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            remaining = max(0.1, deadline - time.monotonic())
            lines = _recv_lines(timeout=min(remaining, 2.0))
            _handle_pings(lines)
            for line in lines:
                if predicate(line):
                    return True
        return False

    try:
        # Register
        _send(f"NICK {nick}")
        _send(f"USER {nick} 0 * :Astro")
        if not _wait_for(lambda l: " 001 " in l or " 376 " in l):
            raise RuntimeError("IRC registration timed out")

        # Join channel
        _send(f"JOIN {channel}")
        if not _wait_for(lambda l: " 366 " in l):
            raise RuntimeError(f"IRC JOIN {channel} timed out")

        # Send message as PRIVMSG lines
        for cmd in _irc_split_message(message, channel):
            _send(cmd)
        print(f"[IRC] Sent to {channel} as {nick} ({len(message)} chars)")

        # Collect response from other users in the channel
        chunks: list[str] = []
        overall_deadline = time.monotonic() + IRC_TIMEOUT
        got_first = False

        while time.monotonic() < overall_deadline:
            wait = IRC_IDLE_TIMEOUT if got_first else min(2.0, overall_deadline - time.monotonic())
            lines = _recv_lines(timeout=wait)
            _handle_pings(lines)

            found_msg = False
            for line in lines:
                if " PRIVMSG " not in line:
                    continue
                sender = line.split("!", 1)[0].lstrip(":")
                if sender.lower() == nick.lower():
                    continue
                after = line.split(" PRIVMSG ", 1)[1]
                if " :" in after:
                    text = after.split(" :", 1)[1]
                else:
                    text = after.split(" ", 1)[1] if " " in after else ""
                chunks.append(text)
                got_first = True
                found_msg = True

            if got_first and not found_msg:
                break

        if not chunks:
            raise RuntimeError(
                f"No response received in {channel} within {IRC_TIMEOUT}s. "
                "Is a bot connected to the IRC channel?"
            )

        result = "\n".join(chunks)
        print(f"[IRC] Response: {len(chunks)} lines, {len(result)} chars")
        return result

    finally:
        try:
            _send("QUIT :done")
            sock.close()
        except Exception:
            pass


def _invoke_with_tools(
    client,
    system_prompt: str,
    user_prompt: str,
    model: str = "gpt-4o-mini",
    max_completion_tokens: int = 4000,
) -> str:
    """Call OpenAI with tool support, handling any tool calls in a loop.
    Falls back to a plain call (no tools) for models that don't support them."""

    # Reasoning models (o-series) use 'developer' role instead of 'system'
    # and may not support tools
    is_reasoning = model.startswith("o1") or model.startswith("o3") or model.startswith("o4")
    sys_role = "developer" if is_reasoning else "system"

    messages = [
        {"role": sys_role, "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]

    # Build common kwargs
    kwargs: dict = {
        "model": model,
        "messages": messages,
        "max_completion_tokens": max_completion_tokens,
    }

    # Only pass tools for models that support them
    if not is_reasoning:
        kwargs["tools"] = ACTIVITY_TOOLS

    for _ in range(MAX_TOOL_ROUNDS):
        try:
            resp = client.chat.completions.create(**kwargs)
        except Exception as e:
            # If tools are rejected, retry without them
            if "tools" in str(e).lower() or "tool" in str(e).lower():
                print(f"[Activity]   Model {model} rejected tools, falling back to plain call")
                kwargs.pop("tools", None)
                resp = client.chat.completions.create(**kwargs)
            else:
                raise

        choice = resp.choices[0]
        content = (choice.message.content or "").strip()

        # If no tool calls, we're done
        if not choice.message.tool_calls:
            print(f"[Activity]   Response length: {len(content)} chars")
            return content

        # Process tool calls
        messages.append(choice.message)
        for tc in choice.message.tool_calls:
            fn_name = tc.function.name
            fn_args = json.loads(tc.function.arguments)
            result = _execute_activity_tool(fn_name, fn_args)
            messages.append({
                "role": "tool",
                "tool_call_id": tc.id,
                "content": result,
            })

    # If we exhausted tool rounds, get a final response without tools
    kwargs.pop("tools", None)
    resp = client.chat.completions.create(**kwargs)
    content = (resp.choices[0].message.content or "").strip()
    print(f"[Activity]   Final response length: {len(content)} chars")
    return content


def _build_member_system_prompt(member: TeamMember, rag_context: str) -> str:
    """Build a system prompt that gives the virtual member its identity + RAG context."""
    parts = [
        f"You are {member.name}, a virtual team member.",
    ]
    if member.title:
        parts.append(f"Your role: {member.title}")
    if member.profile:
        parts.append(f"Your expertise and background:\n{member.profile}")
    parts.append(
        "\nYou have access to the following knowledge base context to help you with your work:"
    )
    parts.append(rag_context)
    parts.append(
        "\nYou can search the web using the web_search tool when you need current information, "
        "recent data, or facts not covered by the knowledge base. Use it proactively when "
        "your task would benefit from up-to-date information."
    )
    parts.append(
        "Provide a thorough, well-reasoned response based on your expertise and the available context. "
        "Be specific and actionable."
    )
    return "\n\n".join(parts)


def _build_task_prompt(
    activity: Activity,
    task: ActivityTask,
    conversation: list[tuple[ActivityTask, TeamMember, str]],
) -> str:
    """Build the user prompt for a task, including the full conversation so far."""
    parts = []

    # Activity context
    if activity.prompt:
        parts.append(f"Activity: {activity.name}\nContext: {activity.prompt}\n")

    # Show full conversation so far
    if conversation:
        parts.append("--- Activity progression so far ---\n")
        for prev_task, prev_member, prev_response in conversation:
            instruction_label = f" — {prev_task.instruction}" if prev_task.instruction else ""
            parts.append(
                f"**{prev_member.name}** ({prev_member.title or 'Team Member'}){instruction_label}:\n"
                f"{prev_response}\n"
            )
        parts.append("---\n")

    # The current task instruction
    parts.append(f"Your task: {task.instruction}")

    return "\n".join(parts)


# ── Serialization helpers ─────────────────────────────────────────────────


def member_to_dict(m: TeamMember) -> dict:
    d = asdict(m)
    d["avatar_url"] = f"https://api.dicebear.com/7.x/adventurer/svg?seed={m.avatar_seed}"
    return d


def task_to_dict(t: ActivityTask) -> dict:
    d = {
        "id": t.id,
        "activity_id": t.activity_id,
        "member_id": t.member_id,
        "instruction": t.instruction,
        "position": t.position,
    }
    if t.member:
        d["member"] = member_to_dict(t.member)
    return d


def activity_to_dict(a: Activity) -> dict:
    d = {
        "id": a.id,
        "name": a.name,
        "prompt": a.prompt,
        "schedule": a.schedule,
        "created_at": a.created_at,
    }
    if a.tasks is not None:
        d["tasks"] = [task_to_dict(t) for t in a.tasks]
    return d


# ── Background scheduler ─────────────────────────────────────────────────

_scheduler_timer: threading.Timer | None = None
SCHEDULER_INTERVAL = 300  # check every 5 minutes


def _scheduler_tick():
    """Check for activities that need to run based on their schedule."""
    global _scheduler_timer
    try:
        activities = list_activities()
        now = datetime.now(timezone.utc)

        for activity in activities:
            if activity.schedule == "manual":
                continue

            if not activity.tasks:
                continue

            # Check last run time
            runs = list_activity_runs(activity.id, limit=1)
            if runs:
                last = datetime.fromisoformat(runs[0].started_at)
                elapsed = (now - last).total_seconds()

                intervals = {
                    "hourly": 3600,
                    "daily": 86400,
                    "weekly": 604800,
                }
                if elapsed < intervals.get(activity.schedule, float("inf")):
                    continue

            # Time to run
            print(f"[Scheduler] Triggering activity '{activity.name}' (schedule: {activity.schedule})")
            threading.Thread(
                target=run_activity, args=(activity.id,), daemon=True
            ).start()

    except Exception:
        traceback.print_exc()

    # Reschedule
    _scheduler_timer = threading.Timer(SCHEDULER_INTERVAL, _scheduler_tick)
    _scheduler_timer.daemon = True
    _scheduler_timer.start()


def start_scheduler():
    """Start the background activity scheduler."""
    global _scheduler_timer
    if _scheduler_timer is not None:
        return
    print(f"[Scheduler] Starting activity scheduler (check every {SCHEDULER_INTERVAL}s)")
    _scheduler_timer = threading.Timer(SCHEDULER_INTERVAL, _scheduler_tick)
    _scheduler_timer.daemon = True
    _scheduler_timer.start()
