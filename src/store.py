"""ChromaDB vector store management."""

import shutil
from pathlib import Path

from langchain_chroma import Chroma
from langchain_core.documents import Document
from langchain_openai import OpenAIEmbeddings

from src.notes import get_openai_api_key

PERSIST_DIR = Path(__file__).resolve().parent.parent / "data" / "chroma"
COLLECTION = "astro"


def _embeddings() -> OpenAIEmbeddings:
    return OpenAIEmbeddings(model="text-embedding-3-small", api_key=get_openai_api_key())


def get_vectorstore() -> Chroma:
    """Return the persistent Chroma vector store."""
    return Chroma(
        collection_name=COLLECTION,
        embedding_function=_embeddings(),
        persist_directory=str(PERSIST_DIR),
    )


def add_documents(documents: list[Document], universe_id: int = 1) -> int:
    """Add documents to the store. Returns the number of chunks added."""
    for doc in documents:
        doc.metadata["universe_id"] = universe_id
    store = get_vectorstore()
    store.add_documents(documents)
    return len(documents)


def get_retriever(k: int = 4, universe_id: int | None = None):
    """Return a retriever over the vector store, optionally filtered by universe."""
    kwargs: dict = {"k": k}
    if universe_id is not None:
        kwargs["filter"] = {"universe_id": universe_id}
    return get_vectorstore().as_retriever(search_kwargs=kwargs)


def doc_count() -> int:
    """Return the total number of chunks in the store."""
    return get_vectorstore()._collection.count()


def upsert_note(note_id: int, content: str, title: str, universe_id: int = 1) -> None:
    """Add or update a note in the vector store."""
    store = get_vectorstore()
    doc_id = f"note-{note_id}"
    try:
        store._collection.delete(ids=[doc_id])
    except Exception:
        pass
    doc = Document(
        page_content=content,
        metadata={"source": f"note: {title}", "note_id": note_id, "universe_id": universe_id},
    )
    store.add_documents([doc], ids=[doc_id])


def delete_document_chunks(source_path: str) -> int:
    """Remove all chunks whose source metadata matches the given path.
    Returns the number of chunks deleted."""
    store = get_vectorstore()
    collection = store._collection
    # Fetch all entries whose source matches
    results = collection.get(where={"source": source_path})
    ids = results.get("ids", [])
    if ids:
        collection.delete(ids=ids)
    return len(ids)


def delete_note_from_store(note_id: int) -> None:
    """Remove a note from the vector store."""
    store = get_vectorstore()
    try:
        store._collection.delete(ids=[f"note-{note_id}"])
    except Exception:
        pass


def upsert_action_item(
    item_id: int,
    title: str,
    completed: bool = False,
    hot: bool = False,
    due_date: str | None = None,
    category_name: str | None = None,
    universe_id: int = 1,
) -> None:
    """Add or update an action item in the vector store with rich context."""
    store = get_vectorstore()
    doc_id = f"action-item-{item_id}"
    try:
        store._collection.delete(ids=[doc_id])
    except Exception:
        pass

    status = "COMPLETED" if completed else "OPEN"
    parts = [f"ACTION ITEM ({status}): {title}"]
    if hot:
        parts.append("Priority: HOT / urgent")
    if due_date:
        parts.append(f"Due date: {due_date}")
    if category_name:
        parts.append(f"Category: {category_name}")
    content = "\n".join(parts)

    doc = Document(
        page_content=content,
        metadata={
            "source": f"action-item: {title}",
            "action_item_id": item_id,
            "completed": completed,
            "universe_id": universe_id,
        },
    )
    store.add_documents([doc], ids=[doc_id])


def delete_action_item_from_store(item_id: int) -> None:
    """Remove an action item from the vector store."""
    store = get_vectorstore()
    try:
        store._collection.delete(ids=[f"action-item-{item_id}"])
    except Exception:
        pass


def clear() -> None:
    """Delete all persisted data."""
    if PERSIST_DIR.exists():
        shutil.rmtree(PERSIST_DIR)
    print("Vector store cleared.")
