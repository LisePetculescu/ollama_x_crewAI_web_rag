# Week 8 — Ollama RAG setup guide

## Purpose

This guide shows how to set up and run a **minimal local RAG pipeline** in front of Ollama.

The goal is not to build a website yet.
The goal is to understand the backend flow clearly:

1. read documents
2. extract text
3. split text into chunks
4. create embeddings
5. store those embeddings in a local vector database
6. retrieve relevant chunks for a question
7. ask the chat model to answer only from that retrieved context

This version is designed to be:

- local
- small
- practical
- easy to inspect
- reusable later in an exam project

---

## What RAG is in practice

RAG stands for **retrieval-augmented generation**.

That sounds more exotic than it really is.

A normal chat flow looks like this:

**question -> model -> answer**

A RAG flow looks like this:

**question -> retrieve relevant document chunks -> model -> answer**

So RAG is **not a special model**.
It is a workflow around a model.

The important idea is this:

- the documents are not stuffed into the model permanently
- the relevant parts are retrieved when needed
- those retrieved parts become the context for the answer

That is why RAG is useful when the answer must come from files rather than from the model's general training.

---

## What each tool does

### Ollama

Ollama handles the model side.
In this lesson it does two jobs:

1. **chat model**
   - used to generate the final answer
2. **embedding model**
   - used to turn text into vectors for similarity search

### Chroma

Chroma is the local vector database.
It stores:

- chunk text
- chunk metadata
- chunk embeddings

When a question comes in, Chroma helps find the chunks that are most similar to that question.

### Python

Python is only the glue.
It connects the steps together.

It does not “do the AI” by itself in this lesson.
It simply:

- reads files
- chunks text
- calls Ollama
- stores data in Chroma
- retrieves chunks
- prints answers

### pypdf

`pypdf` is used to extract text from PDFs.

Important limitation:

- this works for **text-based PDFs**
- it does **not** solve OCR for scanned-image PDFs

---

## Supported file types

This starter supports:

- `.pdf`
- `.txt`
- `.md`

Why support all three?

- `txt` and `md` are easy to debug
- `pdf` is realistic for actual documents
- the pipeline stays the same once text has been extracted

---

## Recommended models

Use these defaults for the lesson:

- **chat model:** `qwen3:4b`
- **embedding model:** `embeddinggemma`

Fallback for weaker machines:

- **chat model:** `qwen3:1.7b`

Why two models?

Because the jobs are different.

- the chat model writes the answer
- the embedding model turns text into vectors for retrieval

That separation is important.
It helps explain that retrieval and answer generation are different parts of the system.

---

## Project structure

The starter uses this layout:

```text
week8_ollama_rag_files/
├── README.md
├── requirements.txt
├── chunking.py
├── rag_helpers.py
├── ingest.py
├── ask.py
├── example_questions.md
└── docs/
    ├── course_brief.pdf
    ├── rag_intro.txt
    └── week8_notes.md
```

---

## What each file is for

### `requirements.txt`
Contains the Python packages needed for the lesson.

### `chunking.py`
Contains the function that splits long text into smaller pieces.

Why chunking exists:

- long documents are too large to work with as a single block
- retrieval works better on smaller units of meaning
- the model should receive only the most relevant parts, not the whole archive every time

### `rag_helpers.py`
Contains shared helper functions.

It handles things like:

- reading files
- extracting PDF text
- connecting to Chroma
- calling Ollama for embeddings
- calling Ollama for chat

### `ingest.py`
Builds the searchable document database.

It:

1. reads the files in `docs/`
2. extracts text
3. chunks the text
4. creates embeddings
5. stores chunks and metadata in Chroma

### `ask.py`
Runs the question flow.

It:

1. takes a question
2. embeds the question
3. retrieves top-k relevant chunks
4. sends those chunks to the chat model as context
5. prints the answer and chunk previews

### `example_questions.md`
Contains simple test questions to use during the lesson.

---

## Step-by-step setup

## Step 1 — Make sure Ollama is already running

This lesson assumes Ollama is already installed.

If needed, start it the way you normally do on your machine.

Why this step matters:

The Python scripts do not run a model by themselves.
They call Ollama locally through its API.

---

## Step 2 — Pull the models

Run:

```bash
ollama pull qwen3:4b
ollama pull qwen3:1.7b
ollama pull embeddinggemma
```

Why this step matters:

The scripts refer to these model names directly.
If the model is not available locally, the script cannot complete the request.

---

## Step 3 — Open the starter folder

Work inside the folder that contains these files:

- `requirements.txt`
- `chunking.py`
- `rag_helpers.py`
- `ingest.py`
- `ask.py`
- `docs/`

Why this step matters:

The scripts use relative paths.
If you run them from the wrong location, the `docs/` folder or local database path may not be found.

---

## Step 4 — Create a Python environment

### Windows PowerShell

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

### macOS / Linux

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Why this step matters:

A virtual environment keeps the lesson dependencies isolated.
That avoids package conflicts and makes the setup easier to reproduce.

---

## Step 5 — Check the input files

Place the files you want to index inside `docs/`.

This starter already includes:

- one PDF
- one TXT file
- one MD file

Why this step matters:

RAG cannot retrieve from files that were never ingested.
The `docs/` folder is the source material for the searchable knowledge base.

---

## Step 6 — Run ingestion

```bash
python ingest.py
```

Expected result:

- the script finds the files
- extracts text
- creates chunks
- creates embeddings
- stores the chunks in Chroma

Why this step matters:

This is the step that turns ordinary files into a searchable retrieval layer.

Without ingestion, there is no local knowledge base to retrieve from.

---

## Step 7 — Ask questions

Interactive mode:

```bash
python ask.py
```

Single question mode:

```bash
python ask.py "What is the name of the famous colorful harbor district in Copenhagen?"
```

Expected result:

- the question is embedded
- the most relevant chunks are retrieved
- the answer is generated only from those chunks
- the chunk previews are printed afterward

Why this step matters:

This is the full runtime behavior of the RAG pipeline.
It shows the actual difference between:

- talking directly to a model
- talking to a model with retrieved document context

---

## Step 8 — Swap documents and re-ingest

Replace or add files inside `docs/`, then run:

```bash
python ingest.py
python ask.py
```

Why this step matters:

This proves that the retrieval layer is based on the current document set.
The model is not permanently memorizing the files.
It answers based on what was ingested and retrieved.

---

## Step 9 — Run the web app

start the web app by writing this command in the terminal
```bash
python app.py
```

---

## Theory behind each stage of the pipeline

## 1. Reading files

**What happens**

The scripts scan the `docs/` folder and load supported file types.

**Why it exists**

The pipeline needs a predictable source of input.

**What to notice**

At this stage the system still has raw text, not searchable knowledge.

---

## 2. Text extraction

**What happens**

- `txt` and `md` are read directly as text
- `pdf` is parsed with `pypdf`

**Why it exists**

The model and embedding system work on text.
They cannot retrieve directly from a PDF file format without text extraction first.

**What to notice**

Bad extraction causes downstream problems.
If the extracted text is messy, chunking and retrieval will also be messy.

---

## 3. Chunking

**What happens**

Long text is split into smaller pieces.

**Why it exists**

Retrieval usually works better when the system searches smaller pieces of meaning rather than one huge block.

**What to notice**

Chunking is a tradeoff:

- very small chunks can become too fragmented
- very large chunks can become noisy

This starter uses fixed-size chunking with overlap because it is easy to understand and easy to modify.

---

## 4. Embeddings

**What happens**

Each chunk is sent to the embedding model, which turns it into a vector.
The question is later turned into a vector too.

**Why it exists**

Similarity search needs a numerical representation of meaning.
Embeddings make it possible to compare the question against the stored chunks.

**What to notice**

The embedding model does not answer the question.
It only helps the system find relevant text.

---

## 5. Vector storage

**What happens**

Chroma stores:

- chunk text
- chunk metadata
- chunk embeddings

**Why it exists**

The system needs a place to save embeddings and query them later.

**What to notice**

This is what makes the document set reusable between runs.
Without persistent storage, the whole index would need to be rebuilt each time.

---

## 6. Retrieval

**What happens**

When a question is asked, the question embedding is compared against stored chunk embeddings.
The most similar chunks are returned.

**Why it exists**

The model should not be given every document every time.
It should receive only the most relevant pieces.

**What to notice**

Good retrieval is often more important than fancy wording in the final answer.
If the wrong chunks are retrieved, the answer will often be poor even if the chat model is decent.

---

## 7. Grounded generation

**What happens**

The retrieved chunks are placed into the prompt, and the chat model is told to answer only from that context.

**Why it exists**

This is what makes the response grounded in the documents instead of drifting into unsupported guesses.

**What to notice**

This lesson uses two important rules:

- answer only from context
- say **I don't know** when the answer is missing

That is a better behavior than pretending to know.

---

## Grounding rules used in this starter

The starter prompt is built so that the answer should:

- use only the provided context
- avoid free invention
- return **I don't know** when support is missing
- cite chunk numbers like `[1]` and `[2]`

Why this matters:

A RAG pipeline is not automatically trustworthy just because retrieval exists.
The final prompt still matters.
The system must be guided to behave in a grounded way.

---

## Useful environment variables

You can override the defaults when needed.

- `OLLAMA_HOST` default: `http://localhost:11434`
- `CHAT_MODEL` default: `qwen3:4b`
- `EMBEDDING_MODEL` default: `embeddinggemma`
- `CHUNK_SIZE` default: `800`
- `CHUNK_OVERLAP` default: `120`
- `TOP_K` default: `4`

### Example — use the smaller chat model

### Windows PowerShell

```powershell
$env:CHAT_MODEL="qwen3:1.7b"
python ask.py
```

### macOS / Linux

```bash
export CHAT_MODEL=qwen3:1.7b
python ask.py
```

Why this matters:

It shows that the pipeline is configurable without rewriting the code.
That is useful later in projects where different machines or different model choices are involved.

---

## What to test first

Use these early questions:

1. What is RAG?
2. What does the pipeline do before answering a question?
3. Which file types are supported?
4. What happens if the answer is not found in the documents?
5. Which parts are handled by Ollama?
6. Which parts are handled by Chroma?

Then ask one question that is **not** present in the documents.

The expected result is:

**I don't know**

---

## Troubleshooting

## Problem: `docs/ folder not found`

Cause:
You are running the script from the wrong folder.

Fix:
Run the command from the starter folder.

---

## Problem: no supported documents found

Cause:
The `docs/` folder is empty or contains unsupported files.

Fix:
Use `.pdf`, `.txt`, or `.md` files.

---

## Problem: the answer quality is weak

Possible causes:

- wrong chunks are being retrieved
- the answer is not in the documents
- chunk size is poor for the material
- PDF extraction produced weak text
- the smaller fallback model is too limited

Fixes:

- inspect the retrieved chunk previews
- try TXT or MD first
- adjust chunk size or top-k
- confirm the answer really exists in the files
- switch back to `qwen3:4b`

---

## Problem: scanned PDF gives bad results

Cause:
This version does not include OCR.

Fix:
Use a text-based PDF or convert the content into TXT/MD first.

---

## Why this version is useful even though it is small

This lesson version is deliberately narrow.
It does not try to solve every document problem.

That is a strength, not a weakness.

It teaches the core pipeline clearly:

- documents become chunks
- chunks become embeddings
- embeddings are stored and retrieved
- retrieved chunks become answer context

Once that is understood, it becomes much easier later to:

- put an API in front of it
- connect it to a website
- compare it against the OpenWebUI knowledge path
- decide which approach fits an exam project better

---

## Final mental model

Keep this distinction clear:

### Without RAG

**question -> chat model -> answer**

### With RAG

**question -> retrieval -> chat model with context -> answer**

That is the main idea behind the whole lesson.
