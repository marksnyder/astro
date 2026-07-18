"""Execute Python task source in a subprocess with timeout and captured output."""

from __future__ import annotations

import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from src.markdowns import get_setting

PROJECT_ROOT = Path(__file__).resolve().parent.parent

# VS Code / debugpy injects these into child processes when the server runs under the debugger.
_DEBUGGER_ENV_PREFIXES = ("DEBUGPY_", "PYDEVD_", "VSCODE_PYDEVD_", "BUNDLED_DEBUGPY_")
_DEBUGGER_ENV_KEYS = frozenset(
    {
        "PYTHONSTARTUP",
        "PYTHONINSPECT",
        "PYCHARM_HOSTED",
        "IDE_PROJECT_ROOTS",
    }
)


def _base_url() -> str:
    u = (get_setting("agent_task_base_url") or "").strip()
    if u:
        return u.rstrip("/")
    return "http://127.0.0.1:8000"


def _resolve_python_executable() -> str:
    """Use a plain Python binary, not the debugpy launcher when debugging Astro."""
    exe = sys.executable.replace("\\", "/")
    if "debugpy" not in exe.lower():
        base = getattr(sys, "_base_executable", None)
        if base and "debugpy" not in base.replace("\\", "/").lower():
            return base
        return sys.executable

    base = getattr(sys, "_base_executable", None)
    if base and "debugpy" not in base.replace("\\", "/").lower():
        return base

    for name in ("python3", "python"):
        found = shutil.which(name)
        if found and "debugpy" not in found.replace("\\", "/").lower():
            return found

    return sys.executable


def _filter_pythonpath(pythonpath: str) -> str:
    parts = [
        p
        for p in pythonpath.split(os.pathsep)
        if p and "debugpy" not in p.replace("\\", "/").lower()
    ]
    return os.pathsep.join(parts)


def _clean_subprocess_env(env: dict[str, str]) -> dict[str, str]:
    cleaned: dict[str, str] = {}
    for key, value in env.items():
        if key in _DEBUGGER_ENV_KEYS:
            continue
        if key.startswith(_DEBUGGER_ENV_PREFIXES):
            continue
        if key == "PYTHONPATH":
            value = _filter_pythonpath(value)
        cleaned[key] = value
    return cleaned


def _sanitize_source(source: str) -> str:
    """Normalize invisible Unicode whitespace that breaks Python parsing."""
    text = source.replace("\r\n", "\n").replace("\r", "\n")
    text = text.replace("\u00a0", " ")  # no-break space
    text = text.replace("\u2007", " ")  # figure space
    text = text.replace("\u202f", " ")  # narrow no-break space
    text = re.sub(r"[\u200b-\u200d\ufeff]", "", text)  # zero-width chars
    return text


def _task_env(universe_id: int) -> dict[str, str]:
    env = _clean_subprocess_env(os.environ.copy())
    env["ASTRO_UNIVERSE_ID"] = str(universe_id)
    env["ASTRO_BASE_URL"] = _base_url()
    api_key = (get_setting("api_key") or "").strip()
    if api_key:
        env["ASTRO_API_KEY"] = api_key
    existing = _filter_pythonpath(env.get("PYTHONPATH", ""))
    root = str(PROJECT_ROOT)
    env["PYTHONPATH"] = root if not existing else f"{root}{os.pathsep}{existing}"
    return env


def execute_python_source(
    source: str,
    timeout_seconds: int,
    universe_id: int,
) -> dict:
    """Run Python source and return {status, output, exit_code}."""
    env = _task_env(universe_id)
    python_exe = _resolve_python_executable()
    path = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w",
            suffix=".py",
            delete=False,
            encoding="utf-8",
        ) as f:
            f.write(_sanitize_source(source))
            path = f.name
        result = subprocess.run(
            [python_exe, "-u", path],
            capture_output=True,
            text=True,
            timeout=timeout_seconds,
            env=env,
            cwd=str(PROJECT_ROOT),
        )
        output = (result.stdout or "") + (result.stderr or "")
        status = "success" if result.returncode == 0 else "error"
        return {"status": status, "output": output, "exit_code": result.returncode}
    except subprocess.TimeoutExpired as e:
        out = ""
        if e.stdout:
            out += e.stdout if isinstance(e.stdout, str) else e.stdout.decode("utf-8", errors="replace")
        if e.stderr:
            out += e.stderr if isinstance(e.stderr, str) else e.stderr.decode("utf-8", errors="replace")
        out += f"\n[Timed out after {timeout_seconds}s]"
        return {"status": "timeout", "output": out, "exit_code": None}
    finally:
        if path and os.path.exists(path):
            os.unlink(path)
