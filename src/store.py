"""ChromaDB vector store management."""

import shutil
import threading
from pathlib import Path

from langchain_chroma import Chroma
from langchain_community.embeddings import FastEmbedEmbeddings
from langchain_core.documents import Document

PERSIST_DIR = Path(__file__).resolve().parent.parent / "data" / "chroma"
COLLECTION = "astro"

_store_lock = threading.Lock()

INDEXED_CONTENT_TYPES = ("markdown", "script", "link", "diagram", "table", "feed")


def _embeddings() -> FastEmbedEmbeddings:
    return FastEmbedEmbeddings(model_name="BAAI/bge-small-en-v1.5")


def get_vectorstore() -> Chroma:
    """Return the persistent Chroma vector store."""
    return Chroma(
        collection_name=COLLECTION,
        embedding_function=_embeddings(),
        persist_directory=str(PERSIST_DIR),
    )


def _item_doc_id(content_type: str, item_id: int) -> str:
    return f"{content_type}-{item_id}"


def add_documents(documents: list[Document], universe_id: int = 1) -> int:
    """Add documents to the store. Returns the number of chunks added."""
    for doc in documents:
        doc.metadata["universe_id"] = universe_id
        doc.metadata.setdefault("content_type", "document")
    with _store_lock:
        store = get_vectorstore()
        store.add_documents(documents)
    return len(documents)


def get_retriever(k: int = 4, universe_id: int | None = None):
    """Return a retriever over the vector store, optionally filtered by universe."""
    kwargs: dict = {"k": k}
    if universe_id is not None:
        kwargs["filter"] = {"universe_id": universe_id}
    return get_vectorstore().as_retriever(search_kwargs=kwargs)


def doc_count(universe_id: int | None = None) -> int:
    """Return the number of chunks in the store, optionally filtered by universe."""
    collection = get_vectorstore()._collection
    if universe_id is not None:
        results = collection.get(where={"universe_id": universe_id}, include=[])
        return len(results["ids"])
    return collection.count()


def upsert_item(
    content_type: str,
    item_id: int,
    content: str,
    title: str,
    universe_id: int = 1,
    extra_metadata: dict | None = None,
) -> None:
    """Add or update a single indexed item in the vector store."""
    with _store_lock:
        store = get_vectorstore()
        doc_id = _item_doc_id(content_type, item_id)
        try:
            store._collection.delete(ids=[doc_id])
        except Exception:
            pass
        metadata: dict = {
            "source": f"{content_type}: {title}",
            "content_type": content_type,
            "item_id": item_id,
            "title": title,
            "universe_id": universe_id,
        }
        if content_type == "markdown":
            metadata["markdown_id"] = item_id
        if extra_metadata:
            for key, val in extra_metadata.items():
                if val is not None:
                    metadata[key] = val
        doc = Document(page_content=content, metadata=metadata)
        store.add_documents([doc], ids=[doc_id])
    print(
        f"[Astro] Upserted {content_type} id={item_id} title={title!r} "
        f"universe={universe_id} len={len(content)}"
    )


def delete_item(content_type: str, item_id: int) -> None:
    """Remove a single indexed item from the vector store."""
    with _store_lock:
        store = get_vectorstore()
        try:
            store._collection.delete(ids=[_item_doc_id(content_type, item_id)])
        except Exception:
            pass


def upsert_markdown(markdown_id: int, content: str, title: str, universe_id: int = 1) -> None:
    """Add or update a markdown in the vector store."""
    upsert_item("markdown", markdown_id, content, title, universe_id)


def delete_markdown_from_store(markdown_id: int) -> None:
    """Remove a markdown from the vector store."""
    delete_item("markdown", markdown_id)


def delete_document_chunks(source_path: str) -> int:
    """Remove all chunks whose source metadata matches the given path.
    Returns the number of chunks deleted."""
    with _store_lock:
        store = get_vectorstore()
        collection = store._collection
        results = collection.get(where={"source": source_path})
        ids = results.get("ids", [])
        if ids:
            collection.delete(ids=ids)
    return len(ids)


def _result_dedupe_key(content_type: str, meta: dict, doc: Document) -> str:
    if content_type == "document":
        return f"document:{meta.get('source', doc.page_content[:40])}"
    item_id = meta.get("item_id") or meta.get("markdown_id")
    if item_id is not None:
        return f"{content_type}:{item_id}"
    return f"{content_type}:{meta.get('source', '')}"


def _infer_content_type(meta: dict) -> str:
    ctype = meta.get("content_type")
    if ctype:
        return str(ctype)
    if meta.get("markdown_id") is not None:
        return "markdown"
    return "document"


def _title_from_metadata(meta: dict) -> str:
    title = meta.get("title")
    if title:
        return str(title)
    source = str(meta.get("source") or "")
    if ":" in source:
        return source.split(":", 1)[1].strip()
    if source:
        return Path(source).name
    return "Untitled"


def search_content(query: str, k: int = 20, universe_id: int | None = None) -> list[dict]:
    """Semantic search with deduplicated, structured results."""
    k = max(1, min(k, 50))
    fetch_k = min(k * 4, 100)
    with _store_lock:
        store = get_vectorstore()
        kwargs: dict = {"k": fetch_k}
        if universe_id is not None:
            kwargs["filter"] = {"universe_id": universe_id}
        pairs = store.similarity_search_with_score(query, **kwargs)

    seen: set[str] = set()
    results: list[dict] = []
    for doc, score in pairs:
        meta = doc.metadata or {}
        content_type = _infer_content_type(meta)
        key = _result_dedupe_key(content_type, meta, doc)
        if key in seen:
            continue
        seen.add(key)

        item_id = meta.get("item_id") or meta.get("markdown_id")
        title = _title_from_metadata(meta)
        snippet = doc.page_content.strip()
        if len(snippet) > 320:
            snippet = snippet[:317] + "..."

        entry: dict = {
            "content_type": content_type,
            "item_id": item_id,
            "title": title,
            "snippet": snippet,
            "universe_id": meta.get("universe_id", 1),
            "score": float(score),
            "source": meta.get("source", ""),
        }
        if content_type == "document":
            entry["document_path"] = meta.get("source", "")
        if content_type == "link" and meta.get("url"):
            entry["url"] = meta["url"]
        if meta.get("category_id") is not None:
            entry["category_id"] = meta["category_id"]
        if meta.get("feed_id") is not None:
            entry["feed_id"] = meta["feed_id"]

        results.append(entry)
        if len(results) >= k:
            break
    return results


def clear() -> None:
    """Delete all data from the vector store collection."""
    with _store_lock:
        store = get_vectorstore()
        collection = store._collection
        while True:
            batch = collection.get(limit=5000, include=[])
            if not batch["ids"]:
                break
            collection.delete(ids=batch["ids"])
    print("Vector store cleared.")
