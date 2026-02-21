"""Database migration framework for Astro.

Tracks schema versions in a `schema_version` table and runs numbered
migration scripts in order.  Each migration is a Python file in
src/migrations/ named NNN_description.py that exposes an `up(conn)` function.

Usage:
    from src.migrate import run_migrations
    run_migrations(conn)   # called once per process, inside _get_conn()

Design goals:
  - Zero dependencies beyond stdlib + sqlite3.
  - Idempotent: safe to call on every connection (fast no-op when current).
  - Each migration runs inside the same transaction so a failure is atomic.
  - Works across multiple deployed instances sharing the same DB file.
"""

import importlib
import pkgutil
import sqlite3


def _ensure_version_table(conn: sqlite3.Connection) -> None:
    """Create the schema_version bookkeeping table if it doesn't exist."""
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS schema_version (
            version     INTEGER PRIMARY KEY,
            name        TEXT NOT NULL,
            applied_at  TEXT NOT NULL DEFAULT (datetime('now'))
        )
        """
    )


def get_current_version(conn: sqlite3.Connection) -> int:
    """Return the highest migration version that has been applied, or 0."""
    _ensure_version_table(conn)
    row = conn.execute("SELECT MAX(version) AS v FROM schema_version").fetchone()
    return row[0] or 0


def discover_migrations() -> list[tuple[int, str, object]]:
    """Scan src.migrations for numbered migration modules.

    Returns a sorted list of (version, name, module) tuples.
    Module filenames must match the pattern NNN_description.py
    (e.g. 001_baseline.py, 002_add_foo.py).
    """
    import src.migrations as pkg

    migrations: list[tuple[int, str, object]] = []
    for importer, modname, _ispkg in pkgutil.iter_modules(pkg.__path__):
        parts = modname.split("_", 1)
        if not parts[0].isdigit():
            continue
        version = int(parts[0])
        mod = importlib.import_module(f"src.migrations.{modname}")
        if not hasattr(mod, "up"):
            raise RuntimeError(
                f"Migration src/migrations/{modname}.py is missing an up(conn) function"
            )
        migrations.append((version, modname, mod))

    migrations.sort(key=lambda m: m[0])

    # Sanity: no duplicate version numbers
    seen: set[int] = set()
    for ver, name, _ in migrations:
        if ver in seen:
            raise RuntimeError(f"Duplicate migration version {ver}: {name}")
        seen.add(ver)

    return migrations


def run_migrations(conn: sqlite3.Connection) -> int:
    """Apply any pending migrations and return the number applied.

    Acquires an EXCLUSIVE transaction lock so concurrent processes
    don't race.  Migrations that are already applied are skipped.
    """
    _ensure_version_table(conn)

    # Use EXCLUSIVE to serialize concurrent migration attempts
    conn.execute("BEGIN EXCLUSIVE")
    try:
        current = get_current_version(conn)
        migrations = discover_migrations()
        applied = 0

        for version, name, mod in migrations:
            if version <= current:
                continue
            print(f"[migrate] Applying {name} (v{version})...")
            mod.up(conn)
            conn.execute(
                "INSERT INTO schema_version (version, name) VALUES (?, ?)",
                (version, name),
            )
            applied += 1

        conn.commit()

        if applied:
            print(f"[migrate] Done — applied {applied} migration(s), now at v{current + applied}.")
        return applied
    except Exception:
        conn.rollback()
        raise
