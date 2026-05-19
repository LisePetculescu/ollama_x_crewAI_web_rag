from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List, Optional
import hashlib
import os

import chromadb
import requests
from pypdf import PdfReader

from config import (
    CHAT_MODEL,
    CHROMA_DIR,
    COLLECTION_NAME,
    EMBEDDING_MODEL,
    OLLAMA_HOST,
)


def get_client() -> chromadb.ClientAPI:
    return chromadb.PersistentClient(path=CHROMA_DIR)


def get_or_create_collection():
    client = get_client()
    try:
        return client.get_collection(COLLECTION_NAME)
    except Exception:
        return client.create_collection(COLLECTION_NAME)


def recreate_collection():
    client = get_client()
    try:
        client.delete_collection(COLLECTION_NAME)
    except Exception:
        pass
    return client.create_collection(COLLECTION_NAME)


def read_text_file(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="ignore")


def read_pdf_file(path: Path) -> str:
    reader = PdfReader(str(path))
    pages: List[str] = []
    for index, page in enumerate(reader.pages, start=1):
        try:
            text = page.extract_text() or ""
        except Exception:
            text = ""
        if text.strip():
            pages.append(f"\n\n[Page {index}]\n{text}")
    return "\n".join(pages).strip()


def load_documents(docs_dir: Path) -> List[Dict[str, Any]]:
    items: List[Dict[str, Any]] = []
    for path in sorted(docs_dir.iterdir()):
        if not path.is_file():
            continue

        ext = path.suffix.lower()
        if ext not in {".pdf", ".txt", ".md"}:
            continue

        if ext == ".pdf":
            text = read_pdf_file(path)
        else:
            text = read_text_file(path)

        if text.strip():
            items.append(
                {
                    "name": path.name,
                    "path": str(path),
                    "text": text,
                    "type": ext.lstrip("."),
                }
            )
    return items


def embed_texts(texts: List[str]) -> List[List[float]]:
    url = f"{OLLAMA_HOST}/api/embed"
    response = requests.post(
        url,
        json={"model": EMBEDDING_MODEL, "input": texts},
        timeout=300,
    )
    response.raise_for_status()
    data = response.json()
    return data["embeddings"]


def retrieve_context(question: str, top_k: int = 4) -> List[Dict[str, Any]]:
    collection = get_or_create_collection()
    question_embedding = embed_texts([question])[0]

    result = collection.query(
        query_embeddings=[question_embedding],
        n_results=top_k,
    )

    docs = result.get("documents", [[]])[0]
    metas = result.get("metadatas", [[]])[0]

    context_blocks: List[Dict[str, Any]] = []
    for index, (doc, meta) in enumerate(zip(docs, metas), start=1):
        metadata = meta or {}
        context_blocks.append(
            {
                "index": index,
                "source": metadata.get("source", "unknown"),
                "file_type": metadata.get("file_type", "unknown"),
                "chunk_index": metadata.get("chunk_index"),
                "text": doc,
            }
        )

    return context_blocks


def chat_with_context(
    question: str,
    context_blocks: List[Dict[str, Any]],
    model: Optional[str] = None,
) -> str:
    context_text = "\n\n".join(
        f"[{item['index']}] Source: {item['source']}\n{item['text']}"
        for item in context_blocks
    )

    system = (
        # TRAITS — who the model is
        "You are Magnus, a friendly and passionate Copenhagen local who has lived in the city your whole life. "
        "You love sharing both the famous landmarks and the hidden gems that tourists rarely find on their own. "

        # TASK — what it must do
        "Your job is to answer questions about Copenhagen using only the information provided in the context below. "
        "If the answer is not in the context, say exactly: I don't know based on my sources. "
        "Always cite which chunk numbers you used, like [1] or [2]. "

        # TONE — how it should sound
        "Write in a warm, enthusiastic, and conversational tone — like a knowledgeable friend giving advice over coffee, "
        "not a formal tour guide reading from a script. Keep answers practical and easy to follow. "

        # TARGET — who it's talking to
        "You are talking to tourists visiting Copenhagen, most of whom are unfamiliar with the city. "
        "Assume they want specific, actionable suggestions rather than vague overviews."
    )
    user = (
        f"Question: {question}\n\n"
        f"Context:\n{context_text}\n\n"
        "Answer using only the context above."
    )

    url = f"{OLLAMA_HOST}/api/chat"
    response = requests.post(
        url,
        json={
            "model": model or CHAT_MODEL,
            "stream": False,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
        },
        timeout=300,
    )
    response.raise_for_status()
    data = response.json()
    return data["message"]["content"].strip()


def answer_question(
    question: str,
    top_k: int = 4,
    model: Optional[str] = None,
) -> Dict[str, Any]:
    context_blocks = retrieve_context(question, top_k=top_k)
    if not context_blocks:
        return {
            "question": question,
            "answer": "I don't know.",
            "citations": [],
            "grounded": False,
            "no_answer": True,
        }

    answer = chat_with_context(question, context_blocks, model=model)

    citations = []
    for item in context_blocks:
        preview = item["text"][:220].replace("\n", " ").strip()
        citations.append(
            {
                "index": item["index"],
                "source": item["source"],
                "file_type": item["file_type"],
                "chunk_index": item["chunk_index"],
                "excerpt": preview,
                "text": item["text"],
            }
        )

    normalized = answer.strip()
    no_answer = normalized == "I don't know." or normalized == "I don't know"

    return {
        "question": question,
        "answer": normalized,
        "citations": citations,
        "grounded": not no_answer,
        "no_answer": no_answer,
    }


def make_chunk_id(file_name: str, chunk_index: int, chunk_text: str) -> str:
    digest = hashlib.sha256(chunk_text.encode("utf-8")).hexdigest()[:12]
    return f"{file_name}-{chunk_index}-{digest}"

