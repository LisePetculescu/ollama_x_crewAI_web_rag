import os
from typing import Any, Dict, List, Optional

from flask import Flask, jsonify, render_template, request

from rag_helpers import CHAT_MODEL, answer_question
from crew import run_crew

TOP_K = int(os.getenv("TOP_K", "4"))
PORT = int(os.getenv("PORT", "5000"))

app = Flask(__name__)

@app.get("/")
def index():
    return render_template("index.html", default_model=CHAT_MODEL)


@app.get("/health")
def health() -> Any:
    return jsonify({"status": "ok"})


def get_last_user_message(messages: List[Dict[str, Any]]) -> Optional[str]:
    for message in reversed(messages):
        if message.get("role") == "user":
            content = str(message.get("content", "")).strip()
            if content:
                return content
    return None


def get_question_from_payload(payload: Dict[str, Any]) -> Optional[str]:
    messages = payload.get("messages") or []
    question = (
        str(payload.get("message", "")).strip()
        or str(payload.get("question", "")).strip()
        or get_last_user_message(messages)
    )
    return question or None


@app.post("/api/chat/rag")
def api_chat_rag() -> Any:
    payload = request.get_json(silent=True) or {}
    question = get_question_from_payload(payload)
    model = str(payload.get("model", "")).strip() or CHAT_MODEL

    if not question:
        return jsonify({"error": "Missing question or user message."}), 400

    result = answer_question(question, top_k=TOP_K, model=model)
    
    return jsonify(
        {
            "model": model,
            "message": {
                "role": "assistant",
                "content": result["answer"],
            },
            "done": True,
            "citations": result["citations"],
            "grounded": result["grounded"],
            "no_answer": result["no_answer"],
            "mode": "rag"
        }
    )


@app.post("/api/chat/crew")
def api_chat_crew() -> Any:
    payload = request.get_json(silent=True) or {}
    question = get_question_from_payload(payload)
    model = str(payload.get("model", "")).strip() or CHAT_MODEL

    if not question:
        return jsonify({"error": "Missing question or user message."}), 400

    answer, citations = run_crew(question)
    
    return jsonify(
        {
            "model": model,
            "message": {
                "role": "assistant",
                "content": answer,
            },
            "done": True,
            "citations": citations,
            "grounded": True,
            "no_answer": False,
            "mode": "crew"
        }
    )


@app.post("/api/chat")
def api_chat() -> Any:
    """Backward compatible route with automatic routing logic."""
    payload = request.get_json(silent=True) or {}
    question = get_question_from_payload(payload)
    
    # Simple heuristic: if it looks like a plan/itinerary, use crew
    q_lower = (question or "").lower()
    if any(word in q_lower for word in ["plan", "itinerary", "schedule", "budget", "trip"]):
        return api_chat_crew()
    return api_chat_rag()


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=PORT, debug=False)
