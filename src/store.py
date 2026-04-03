"""ChromaDB vector store management."""

import shutil
from pathlib import Path

from langchain_chroma import Chroma
from langchain_community.embeddings import FastEmbedEmbeddings
from langchain_core.documents import Document

PERSIST_DIR = Path(__file__).resolve().parent.parent / "data" / "chroma"
COLLECTION = "astro"


def _embeddings() -> FastEmbedEmbeddings:
    return FastEmbedEmbeddings(model_name="BAAI/bge-small-en-v1.5")


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


def doc_count(universe_id: int | None = None) -> int:
    """Return the number of chunks in the store, optionally filtered by universe."""
    collection = get_vectorstore()._collection
    if universe_id is not None:
        results = collection.get(where={"universe_id": universe_id}, include=[])
        return len(results["ids"])
    return collection.count()


def upsert_markdown(markdown_id: int, content: str, title: str, universe_id: int = 1) -> None:
    """Add or update a markdown in the vector store."""
    store = get_vectorstore()
    doc_id = f"markdown-{markdown_id}"
    try:
        store._collection.delete(ids=[doc_id])
    except Exception:
        pass
    doc = Document(
        page_content=content,
        metadata={"source": f"markdown: {title}", "markdown_id": markdown_id, "universe_id": universe_id},
    )
    store.add_documents([doc], ids=[doc_id])
    print(f"[Astro] Upserted markdown id={markdown_id} title={title!r} universe={universe_id} len={len(content)}")


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


def delete_markdown_from_store(markdown_id: int) -> None:
    """Remove a markdown from the vector store."""
    store = get_vectorstore()
    try:
        store._collection.delete(ids=[f"markdown-{markdown_id}"])
    except Exception:
        pass


def clear() -> None:
    """Delete all data from the vector store collection."""
    store = get_vectorstore()
    collection = store._collection
    # Delete all documents in batches (Chroma requires explicit IDs)
    while True:
        batch = collection.get(limit=5000, include=[])
        if not batch["ids"]:
            break
        collection.delete(ids=batch["ids"])
    print("Vector store cleared.")
