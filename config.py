from __future__ import annotations

import os
from pathlib import Path


# ---------------------------------------------------------------------
# Ollama configuration
# ---------------------------------------------------------------------
# Local Ollama default:
#   http://localhost:11434
#
# Remote Ollama example:
#   http://192.168.0.105:11434
#
# You can override this without editing code:
#   PowerShell:
#     $env:OLLAMA_HOST="http://192.168.0.105:11434"
#
#   CMD:
#     set OLLAMA_HOST=http://192.168.0.105:11434
#
#   macOS/Linux:
#     export OLLAMA_HOST=http://192.168.0.105:11434
OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://localhost:11434").rstrip("/")


# ---------------------------------------------------------------------
# Model configuration
# ---------------------------------------------------------------------
# Chat model used to answer questions.
# Examples:
#   qwen3:4b
#   llama3.1:8b
#   gemma4:31b-cloud
#   llama3-groq-tool-use:8b
CHAT_MODEL = os.getenv("CHAT_MODEL", "qwen3:4b")

# Embedding model used when indexing and searching documents.
# Important: if you change this after ingesting documents, you should
# usually rebuild the Chroma database.
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "embeddinggemma")


# ---------------------------------------------------------------------
# Vector database configuration
# ---------------------------------------------------------------------
CHROMA_DIR = os.getenv("CHROMA_DIR", "chroma_db")
COLLECTION_NAME = os.getenv("COLLECTION_NAME", "week8_rag_docs")


# ---------------------------------------------------------------------
# Document configuration
# ---------------------------------------------------------------------
# Keep this as "docs" if your folder is lowercase.
# If your project folder is named "Docs", either rename it to "docs"
# or change this value to "Docs".
DOCS_DIR = Path(os.getenv("DOCS_DIR", "docs"))


# ---------------------------------------------------------------------
# RAG retrieval configuration
# ---------------------------------------------------------------------
# Number of chunks retrieved from Chroma for each user question.
TOP_K = int(os.getenv("TOP_K", "4"))

 
# ---------------------------------------------------------------------
# Generation configuration
# ---------------------------------------------------------------------
TEMPERATURE = float(os.getenv("TEMPERATURE", "0.2"))