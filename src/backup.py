"""Backup and restore for Astro data.

Creates a ZIP archive containing:
- astro.db   (SQLite database)
- images/    (note image files)
- documents/ (uploaded documents)
- chroma/    (ChromaDB vector store — embeddings cost money to regenerate)
"""

import shutil
import tempfile
import zipfile
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
DB_PATH = DATA_DIR / "astro.db"
IMAGES_DIR = DATA_DIR / "images"
DOCUMENTS_DIR = BASE_DIR / "documents"
CHROMA_DIR = DATA_DIR / "chroma"


def create_backup(dest: Path | None = None) -> Path:
    """Create a ZIP backup of all Astro data.

    Returns the path to the created ZIP file.
    """
    if dest is None:
        tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".zip", prefix="astro-backup-")
        dest = Path(tmp.name)
        tmp.close()

    with zipfile.ZipFile(dest, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
        # 1. SQLite database
        if DB_PATH.is_file():
            zf.write(DB_PATH, "astro.db")

        # 2. Note images
        if IMAGES_DIR.is_dir():
            for f in IMAGES_DIR.iterdir():
                if f.is_file():
                    zf.write(f, f"images/{f.name}")

        # 3. Uploaded documents
        if DOCUMENTS_DIR.is_dir():
            for f in DOCUMENTS_DIR.rglob("*"):
                if f.is_file():
                    rel = f.relative_to(DOCUMENTS_DIR)
                    zf.write(f, f"documents/{rel}")

        # 4. ChromaDB vector store
        if CHROMA_DIR.is_dir():
            for f in CHROMA_DIR.rglob("*"):
                if f.is_file():
                    rel = f.relative_to(CHROMA_DIR)
                    zf.write(f, f"chroma/{rel}")

    return dest


def restore_backup(zip_path: Path) -> dict:
    """Restore Astro data from a ZIP backup.

    Replaces the current database, images, documents, and vector store
    with the contents of the archive.

    Returns a summary dict with counts of restored items.
    """
    summary = {"db": False, "images": 0, "documents": 0, "chroma": False}

    with zipfile.ZipFile(zip_path, "r") as zf:
        names = zf.namelist()

        # 1. Restore database
        if "astro.db" in names:
            DB_PATH.parent.mkdir(parents=True, exist_ok=True)
            with zf.open("astro.db") as src, open(DB_PATH, "wb") as dst:
                shutil.copyfileobj(src, dst)
            summary["db"] = True

        # 2. Restore images
        image_entries = [n for n in names if n.startswith("images/") and not n.endswith("/")]
        if image_entries:
            IMAGES_DIR.mkdir(parents=True, exist_ok=True)
            # Clear existing images
            for f in IMAGES_DIR.iterdir():
                if f.is_file():
                    f.unlink()
            for entry in image_entries:
                filename = Path(entry).name
                dest = IMAGES_DIR / filename
                with zf.open(entry) as src, open(dest, "wb") as dst:
                    shutil.copyfileobj(src, dst)
                summary["images"] += 1

        # 3. Restore documents
        doc_entries = [n for n in names if n.startswith("documents/") and not n.endswith("/")]
        if doc_entries:
            # Clear existing documents (remove contents, not the dir itself —
            # the dir may be a Docker volume mount point)
            if DOCUMENTS_DIR.is_dir():
                for child in DOCUMENTS_DIR.iterdir():
                    if child.is_dir():
                        shutil.rmtree(child)
                    else:
                        child.unlink()
            DOCUMENTS_DIR.mkdir(parents=True, exist_ok=True)
            for entry in doc_entries:
                rel = Path(entry).relative_to("documents")
                dest = DOCUMENTS_DIR / rel
                dest.parent.mkdir(parents=True, exist_ok=True)
                with zf.open(entry) as src, open(dest, "wb") as dst:
                    shutil.copyfileobj(src, dst)
                summary["documents"] += 1

        # 4. Restore ChromaDB vector store
        chroma_entries = [n for n in names if n.startswith("chroma/") and not n.endswith("/")]
        if chroma_entries:
            # Clear contents, not the dir itself (may be inside a volume mount)
            if CHROMA_DIR.is_dir():
                for child in CHROMA_DIR.iterdir():
                    if child.is_dir():
                        shutil.rmtree(child)
                    else:
                        child.unlink()
            CHROMA_DIR.mkdir(parents=True, exist_ok=True)
            for entry in chroma_entries:
                rel = Path(entry).relative_to("chroma")
                dest = CHROMA_DIR / rel
                dest.parent.mkdir(parents=True, exist_ok=True)
                with zf.open(entry) as src, open(dest, "wb") as dst:
                    shutil.copyfileobj(src, dst)
            summary["chroma"] = True

    return summary
