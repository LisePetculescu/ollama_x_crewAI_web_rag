# How to Run the Copenhagen Tourist RAG Chat Project

## Prerequisites

### 1) Prerequisites
- Operating System: Windows 10+ / macOS 10.15+ / Linux (Ubuntu 20.04+ recommended)
- Python: 3.10 or 3.11 or 3.12 (ensure `python` / `python3` is on PATH)
- pip: included with Python (`pip --version`)
- Node.js: 16+ (optional; needed only if you run or extend frontend build tools)
- Ollama: installed and running locally (see Ollama docs)
- GPU (optional): Recommended for larger local models (8B models: >=6 GB VRAM)
- Git + a code editor (VS Code recommended)

Notes on Ollama:
- Install Ollama from https://ollama.com and follow OS-specific instructions.
- After installing, run Ollama and pull the models you need. 
- You need at least one **Embedding model** & one **Chat model**. Models we've used during development: 
  - `ollama pull llama3-groq-tool-use:8b` - LLM model (optimized --> quantized 8b model)
  - `ollama pull llama3.1:8b` - LLM model
  - `ollama pull qwen3:4b` - LLM model (better on smaller GPU's) 
  - `ollama pull embeddinggemma` - Embedding model

*Note*: You can change which models are used in [Config.py](config.py)


### 2) Installation steps

**PowerShell (Windows):**
```powershell

# Install uv (one-time):
powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"

# verify installation:
uv --version 
# Expected output: uv 0.11.12 (63c5f57d3 2026-05-08 x86_64-pc-windows-msvc)

# Create & activate a virtual environment w. uv
uv venv
.venv\Scripts\activate

# Upgrade pip and install Python deps
uv pip install --upgrade pip
uv pip install -r requirements.txt
```

**Bash (macOS / Linux):**
```bash
# Create & activate a virtual environment
python3 -m venv .venv
source .venv/bin/activate

# Upgrade pip and install Python deps
pip install --upgrade pip
pip install -r requirements.txt
```


### 3) Configuration

The app reads configuration from environment variables. Example variables:
- `OLLAMA_HOST` (default: `http://localhost:11434`)
- `CHAT_MODEL` (e.g. `llama3.1:8b`)
- `EMBEDDING_MODEL` (e.g. `embeddinggemma`)
- `TOP_K` (number of chunks to retrieve)
- `PORT` (Flask port, default `5000`)

Edit them in [Config.py](config.py)


### 4) Provide / load RAG source material

Add your documents (markdown, text, PDF) into the `docs/` folder. To (re)build the Chroma DB run the ingest script which:
- reads files from `docs/`
- chunks them
- creates embeddings via Ollama
- stores vectors in `chroma_db/`

**PowerShell:**
```powershell
# First run:
python ingest.py

# If you've changed docs/ and want a fresh index, delete chroma_db/ first
Remove-Item -Recurse -Force chroma_db\
python ingest.py
```

**Bash:**
```bash
# First run:
python ingest.py

# If you've changed docs/ and want a fresh index, delete chroma_db/ first
rm -rf chroma_db
python3 ingest.py
```

**Ingest output example** (should list found documents and stored chunk count):
```
Found 4 documents
- copenhagen_attractions_quiz.txt: 2 chunks
- copenhagen_castles_readme_for_rag.md: 18 chunks
- majas_copenhagen_guide.md: 13 chunks
- tourist_info.pdf: 24 chunks
Stored 57 chunks in Chroma
```

### 5) Start the system

**PowerShell:**
```powershell
python app.py
```

**Bash:**
```bash
python3 app.py
```

The app listens on `http://localhost:5000` by default. Open that URL in a browser to use the LangGraph-coded web UI.

### 6) How to test the Rag solution in CLI - no CrewAI


CLI test using ask.py:

**PowerShell:**
```powershell
python ask.py "What are the top attractions in Copenhagen?"
```
or

**Bash:**
```bash
python3 ask.py "What are the top attractions in Copenhagen?"
```

**Expected response:** Markdown text containing the final answer from the llm model and which chunks was retrieved (citations), using the custom RAG path without the CrewAI agent flow. See `app.py` for exact response schema.

---

## Project Overview

This is a **Retrieval-Augmented Generation (RAG) chat** that uses:
- **ChromaDB** for vector storage
- **Ollama** for embeddings and LLM chatting
- **CrewAI** for multi-agent orchestration
- **Flask** for the web backend
- **Vanilla JS** for the frontend

---

## Request Flow: From Browser to Answer

### Route 1: CrewAI Multi-Agent Flow (`/api/chat/crew`)
```
User submits a question in the web UI (templates/index.html)
    ↓
JavaScript sends POST to /api/chat/crew (static/app.js)
    ↓
Flask receives the request (app.py:113)
    ↓
Question text is extracted via get_question_from_payload() (app.py:45)
    ↓
run_crew(question) is called (app.py:121, crew.py:49)
    ↓
Three CrewAI agents are created and execute tasks sequentially:
    ├─ Tourist Expert Agent → research_task
    │  └─ Calls copenhagen_rag_search tool
    │     └─ Calls answer_question() from rag_helpers.py
    │        ├─ Embeds the question (via Ollama)
    │        ├─ Retrieves top 4 chunks from Chroma
    │        └─ Sends context to Ollama for final answer
    ├─ Trip Planner Agent → planning_task (uses research notes)
    └─ Reviewer Agent → review_task (polishes the answer)
    ↓
Final polished answer + citations are returned as JSON (app.py:124)
    ↓
JavaScript renders the answer and citations in the UI (static/app.js)
```

### Route 2: Direct RAG Flow (`/api/chat/rag`)
```
User sends POST with question to /api/chat/rag (app.py:97)
    ↓
Question is extracted via get_question_from_payload() (app.py:45)
    ↓
answer_question() is called directly (app.py:102, rag_helpers.py:165)
    ↓
RAG pipeline executes:
    ├─ Embeds the question (Ollama embeddings)
    ├─ Retrieves top K chunks from Chroma
    └─ Sends context to Ollama LLM for final answer
    ↓
Answer + citations returned as JSON (app.py:110)
    ↓
JavaScript renders the response in the UI (static/app.js)
```

---

## File Structure & Roles
### Core RAG Application
| File | Purpose |
|------|---------|
| **app.py***| Flask server and request router. Exposes `/api/chat/rag` (direct RAG), and `/api/chat/crew` (CrewAI multi-agent flow). Uses `run_crew()` and `answer_question()` to produce JSON responses. |
| **crew.py** | CrewAI orchestration. Defines the three agents (Tourist expert, trip planner, reviewer), tasks, and the `copenhagen_rag_search` tool used by the Crew flow. |
| **rag_helpers.py***| RAG utilities: document loader, PDF/text parsing, chunking helper usage, embedding via Ollama, ChromaDB client/retrieval, `chat_with_context()` and `answer_question()` functions. |
| **config.py** | Environment-backed configuration (model names, Chroma dir, chunk sizes, TOP_K, etc.). Edit to change defaults for local runs. |

`* Based upon Steffen Segovia Helbo's week 9 lecture in LLM for Developers (Spring 2026)`

### Frontend
| File | Purpose |
|------|---------|
| **templates/index.html*** | Web UI markup for the chat interface and model selector. |
| **static/app.js*** | Frontend logic. Sends requests to `/api/chat/rag` or `/api/chat/crew` based on user selection and displays responses, citations, mode, and export actions. |
| **static/style.css*** | Styling for the chat interface. |

`* Based upon Steffen Segovia Helbo's week 9 lecture in LLM for Developers (Spring 2026)`

### Data Pipeline & Ingest
| File | Purpose |
|------|---------|
| **ingest.py*** | Build the Chroma vector DB from files in `docs/` (chunk -> embed -> store). Run when docs change. |
| **chunking.py*** | Chunking utilities used by `ingest.py` (text splitting and overlap rules). |
| **docs/** | Source documents (markdown, text, PDF) used to build the RAG knowledge base. |
| **chroma_db/** | Persistent local ChromaDB store created by `ingest.py`. Delete to rebuild. |

`* Based upon Steffen Segovia Helbo's week 9 lecture in LLM for Developers (Spring 2026)`

### Utilities & Optional
| File | Purpose |
|------|---------|
| **ask.py*** | CLI wrapper around `answer_question()` for quick terminal queries (direct RAG, no CrewAI). |

`* Based upon Steffen Segovia Helbo's week 9 lecture in LLM for Developers (Spring 2026)`

---

## Configuration

All settings can be overridden via environment variables:

```bash
# LLM & Embedding Model
export CHAT_MODEL=llama3.1:8b          # Default: llama3.1:8b - Another option: qwen3:4b
export EMBEDDING_MODEL=embeddinggemma  # Default: embeddinggemma
export OLLAMA_HOST=http://localhost:11434

# RAG
export TOP_K=4                 # Number of chunks to retrieve
export CHUNK_SIZE=800          # Characters per chunk
export CHUNK_OVERLAP=120       # Overlap between chunks

# CrewAI
export MAX_ITER=3              # Max iterations per agent (prevents infinite loops)

# Flask
export PORT=5000               # Web server port

# ChromaDB
export CHROMA_DIR=chroma_db    # Local storage directory
export COLLECTION_NAME=week8_rag_docs
```

Then start the app:

```bash
python app.py
```

---

**Credits:**

This project is partly based on Steffen Segovia Helbo's week 8 & 9 lectures on *Ollama RAG - Custom Ollama RAG Path* and *Website chat Local RAG* in LLM for Developers (Spring 2026)

The project's authors:
- Jonas Grønquist
- Katrine Michala Hansen
- Lise Freja Jensen Petculescu

