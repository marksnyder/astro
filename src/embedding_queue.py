"""Background queue for vector embeddings (non-blocking API saves)."""

from __future__ import annotations

import threading

from src.index_content import build_index_payload
from src.store import INDEXED_CONTENT_TYPES, delete_item, upsert_item


class EmbeddingQueue:
    """Single worker thread; coalesces pending upserts by (content_type, item_id)."""

    _instance: EmbeddingQueue | None = None
    _init_lock = threading.Lock()

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._pending_upserts: set[tuple[str, int]] = set()
        self._pending_deletes: set[tuple[str, int]] = set()
        self._wake = threading.Event()
        self._stopping = False
        self._thread = threading.Thread(target=self._worker, daemon=True, name="embedding-queue")
        self._thread.start()
        print("[EmbeddingQueue] Worker started")

    @classmethod
    def get(cls) -> EmbeddingQueue:
        if cls._instance is None:
            with cls._init_lock:
                if cls._instance is None:
                    cls._instance = cls()
        return cls._instance

    def stop(self) -> None:
        self._stopping = True
        self._wake.set()

    def schedule(self, content_type: str, item_id: int) -> None:
        if content_type not in INDEXED_CONTENT_TYPES:
            return
        key = (content_type, item_id)
        with self._lock:
            self._pending_deletes.discard(key)
            self._pending_upserts.add(key)
        self._wake.set()

    def schedule_delete(self, content_type: str, item_id: int) -> None:
        if content_type not in INDEXED_CONTENT_TYPES:
            return
        key = (content_type, item_id)
        with self._lock:
            self._pending_upserts.discard(key)
            self._pending_deletes.add(key)
        self._wake.set()

    def _worker(self) -> None:
        while not self._stopping:
            self._wake.wait(timeout=1.0)
            self._wake.clear()
            self._drain_batch()
        self._drain_batch()

    def _drain_batch(self) -> None:
        while True:
            with self._lock:
                deletes = list(self._pending_deletes)
                self._pending_deletes.clear()
                upserts = list(self._pending_upserts)
                self._pending_upserts.clear()
            if not deletes and not upserts:
                return
            for content_type, item_id in deletes:
                try:
                    delete_item(content_type, item_id)
                except Exception as e:
                    print(f"[EmbeddingQueue] delete failed {content_type} id={item_id}: {e}")
            for content_type, item_id in upserts:
                try:
                    payload = build_index_payload(content_type, item_id)
                    if payload is None:
                        delete_item(content_type, item_id)
                        continue
                    content, title, uid, extra = payload
                    if not content.strip():
                        delete_item(content_type, item_id)
                        continue
                    upsert_item(content_type, item_id, content, title, uid, extra)
                except Exception as e:
                    print(f"[EmbeddingQueue] upsert failed {content_type} id={item_id}: {e}")
            with self._lock:
                if not self._pending_deletes and not self._pending_upserts:
                    return


def schedule_reindex(content_type: str, item_id: int) -> None:
    """Queue vector indexing for an item; returns immediately."""
    EmbeddingQueue.get().schedule(content_type, item_id)


def schedule_delete_index(content_type: str, item_id: int) -> None:
    """Queue vector-store removal for an item; returns immediately."""
    EmbeddingQueue.get().schedule_delete(content_type, item_id)


def schedule_markdown_embed(
    markdown_id: int,
    title: str = "",
    body: str = "",
    universe_id: int = 1,
) -> None:
    """Queue embedding for a markdown; returns immediately."""
    schedule_reindex("markdown", markdown_id)


def schedule_markdown_delete(markdown_id: int) -> None:
    """Queue vector-store removal for a markdown; returns immediately."""
    schedule_delete_index("markdown", markdown_id)
