# How to Run the Copenhagen RAG Chat Project

## Prerequisites

- A computer __preferably__ with dedicated Graphics card and at least 6 GB of VRAM
- A code editor such as VS Code
- NodeJS installed
- Python installed
- UV installed (mainly for windows)
- Ollama installed
  - Some local models downloaded from ollama such as:
    - llama3.1:8b (6GB VRAM recommended)
    - qwen3:4b (can be used with VRAM <6 GB)
  - Cloud models can also be used:
    - gemma4:31b-cloud (comes with a certain amount of free token. Ollama account needed)
  - Embedding model downloaded:
    - embeddinggemma
- 

## Project setup

### 1. Set Up the Environment

#### Install uv

***Windows powershell***
```bash
powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
```
**Verify**
```bash
uv --version
```

#### Create a fresh venv with uv
```bash
uv venv
```


#### Activate the virtual environment 

*in Windows Powershell*
```bash
.venv\Scripts\activate
```

#### Install requirements
***Windows powershell***
```bash
uv pip install -r requirements.txt
```

### 2. Ingest Documents into Chroma

Before starting the app, build the RAG knowledge base from the docs:

* **OBS. make sure Ollama is running**
* If you've run the project earlier, and you've since changed the files in __docs/__ you might want to delete the **chroma_db/** dir, before running ingest.py


***Windows powershell***
```bash
python ingest.py
```

This reads markdown, text, and PDF files from the `docs/` folder, chunks them, embeds them with Ollama, and stores them in the local Chroma database (`chroma_db/`).

**Output:**
```
Found 4 documents
- copenhagen_attractions_quiz.txt: 2 chunks
- copenhagen_castles_readme_for_rag.md: 18 chunks
- majas_copenhagen_guide.md: 13 chunks
- tourist_info.pdf: 24 chunks
Stored 57 chunks in Chroma
```

### 3. Start the Flask Web Server

***Windows powershell***
```bash
python app.py
```

The server runs on `http://localhost:5000` by default.

### 4. Open the Web UI

Visit `http://localhost:5000` in your browser and ask questions about Copenhagen.

---

## Project Overview

This is a **Retrieval-Augmented Generation (RAG) chat** that uses:
- **ChromaDB** for vector storage
- **Ollama** for embeddings and LLM inference
- **CrewAI** for multi-agent orchestration
- **Flask** for the web backend
- **Vanilla JS** for the frontend

---

## Request Flow: From Browser to Answer

```
User submits a question in the web UI
    ↓
JavaScript sends POST to /api/chat/crew (static/app.js:53)
    ↓
Flask receives the request (app.py:97)
    ↓
Question text is extracted (app.py:90)
    ↓
run_crew(question) is called (crew.py:33)
    ↓
Three CrewAI agents are created and execute tasks sequentially:
    ├─ Local Expert Agent → research_task
    │  └─ Calls copenhagen_rag_search tool
    │     └─ Calls answer_question() from rag_helpers.py
    │        ├─ Embeds the question (via Ollama)
    │        ├─ Retrieves top 4 chunks from Chroma (rag_helpers.py:66)
    │        └─ Sends context to Ollama for final answer (rag_helpers.py:111)
    ├─ Trip Planner Agent → planning_task (uses research notes)
    └─ Reviewer Agent → review_task (polishes the answer)
    ↓
Final polished answer is returned as JSON
    ↓
JavaScript renders the answer and citations in the UI (static/app.js:107)
```

---

## File Structure & Roles

### Core Application
| File | Purpose |
|------|---------|
| **app.py** | Flask server; main entry point. The browser uses the CrewAI route, while `/api/chat` remains as a backend fallback. |
| **crew.py** | CrewAI orchestration. Defines three agents, tasks, and the `copenhagen_rag_search` tool. |
| **rag_helpers.py** | Core RAG logic: document loading, embedding, ChromaDB retrieval, LLM chat. Environment-backed config. |

### Frontend
| File | Purpose |
|------|---------|
| **templates/index.html** | Web UI layout. Chat form, message display, citations panel. |
| **static/app.js** | Frontend logic. Sends questions to `/api/chat/crew`, renders CrewAI responses. |
| **static/style.css** | Styling for the chat interface. |

### Data Pipeline
| File | Purpose |
|------|---------|
| **ingest.py** | Reads docs from `docs/`, chunks them, embeds them, stores in Chroma. Run once before starting the app. |
| **chunking.py** | Text chunking logic (used by ingest.py). |
| **docs/** | Source documents (markdown, text, PDF). Add new docs here and re-run `ingest.py`. |
| **chroma_db/** | Local persistent ChromaDB store. Delete this if you want to rebuild from scratch. |

### Optional
| File | Purpose |
|------|---------|
| **ask.py** | CLI wrapper around `answer_question()`. Run `python ask.py "your question"` for terminal-based RAG queries. |

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

### `/api/chat/crew` (POST)
- Always uses CrewAI multi-agent orchestration
- Used by the web frontend

### `/api/chat` (POST)
- Still available as a backend fallback
- Uses keyword detection to choose between CrewAI and direct RAG
- Not used by the current browser UI

---

### Adding New Documents
```bash
# 1. Add markdown/PDF/text files to docs/
# 2. Re-ingest
python ingest.py

# 3. Restart the server (or it will auto-reload in debug mode)
```

### Debugging
```bash
# Enable verbose Ollama host tracing
export RUST_BACKTRACE=1
export OLLAMA_HOST=http://localhost:11434

# Clear corrupted Chroma DB
rm -rf chroma_db
python ingest.py
```

### Command-Line RAG (no web UI)
```bash
python ask.py "What are the top attractions in Copenhagen?"
```

---

## Notes

- **Ollama must be running** on `http://localhost:11434` before starting the app.
- **Chroma is persistent** — the database survives server restarts. Delete `chroma_db/` to reset.
- **CrewAI agents are capped at 3 iterations** to prevent infinite loops. Adjust `MAX_ITER` if needed.
- The **web UI always uses `/api/chat/crew`**, which routes all questions through the three-agent workflow.
- The **CLI tool (`ask.py`)** uses direct RAG and is typically faster for simple queries.
