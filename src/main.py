"""Astro — Lightweight RAG CLI."""

import argparse

from dotenv import load_dotenv

load_dotenv()


# ── Commands ─────────────────────────────────────────────────────────────


def cmd_clear(_args: argparse.Namespace) -> None:
    from src.store import clear

    clear()


def cmd_stats(_args: argparse.Namespace) -> None:
    from src.store import doc_count

    print(f"Chunks in vector store: {doc_count()}")


def cmd_serve(args: argparse.Namespace) -> None:
    import uvicorn

    print(f"Starting Astro web UI on http://localhost:{args.port}")
    uvicorn.run("src.api:app", host="0.0.0.0", port=args.port, reload=args.reload)


# ── CLI ──────────────────────────────────────────────────────────────────


def main() -> None:
    parser = argparse.ArgumentParser(
        prog="astro",
        description="Astro — Lightweight RAG System",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    # clear
    p_clear = sub.add_parser("clear", help="Clear the vector store")
    p_clear.set_defaults(func=cmd_clear)

    # serve
    p_serve = sub.add_parser("serve", help="Start the web UI")
    p_serve.add_argument("--port", type=int, default=8000, help="Port (default: 8000)")
    p_serve.add_argument("--reload", action="store_true", help="Auto-reload on code changes")
    p_serve.set_defaults(func=cmd_serve)

    # stats
    p_stats = sub.add_parser("stats", help="Show vector store statistics")
    p_stats.set_defaults(func=cmd_stats)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
