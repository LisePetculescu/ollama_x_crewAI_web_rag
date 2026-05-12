import os
from typing import Any, Dict, List

from crewai import Agent, Crew, LLM, Process, Task
from crewai.tools import tool

from rag_helpers import CHAT_MODEL, OLLAMA_HOST, answer_question


TOP_K = int(os.getenv("TOP_K", "4"))
MAX_ITER = int(os.getenv("MAX_ITER", "3"))

# Store citations across tool calls within a crew execution
_crew_citations: List[Dict[str, Any]] = []


llm = LLM(
    model=f"ollama/{CHAT_MODEL}",
    base_url=OLLAMA_HOST,
    temperature=0.3,
)


@tool("Copenhagen RAG Search")
def copenhagen_rag_search(query: str) -> str:
    """
    Search the local Copenhagen tourism knowledge base using ChromaDB and Ollama.
    Use this tool for factual Copenhagen information.
    """
    result: Dict[str, Any] = answer_question(query, top_k=TOP_K, model=CHAT_MODEL)

    answer = result.get("answer", "")
    citations = result.get("citations", [])

    # Collect citations for later retrieval by the endpoint
    global _crew_citations
    _crew_citations.extend(citations)

    citation_text = ""
    if citations:
        citation_text = "\n\nRetrieved sources:\n"
        for item in citations:
            citation_text += (
                f"- [{item['index']}] {item['source']} "
                f"(chunk {item.get('chunk_index', '?')})\n"
            )

    return answer + citation_text


def run_crew(question: str) -> tuple[str, List[Dict[str, Any]]]:
    global _crew_citations
    _crew_citations = []  # Reset citations for this crew run

    local_expert = Agent(
        role="Copenhagen Local Expert",
        goal=(
            "Find accurate Copenhagen tourism information using the local "
            "RAG knowledge base."
        ),
        backstory=(
            "You are Magnus, a friendly Copenhagen local. You know the city well, "
            "but you are careful with facts. When you need factual information, "
            "you use the Copenhagen RAG Search tool."
        ),
        tools=[copenhagen_rag_search],
        llm=llm,
        max_iter=MAX_ITER,
        verbose=True,
    )

    trip_planner = Agent(
        role="Copenhagen Trip Planner",
        goal="Create useful, realistic Copenhagen travel plans for tourists or just give facts if the user do not ask for an itenerary or planned trip",
        backstory=(
            "You are an experienced travel planner who creates practical, "
            "well-paced itineraries for visitors to Copenhagen or just facts about copehagen, if the user do not ask for an itenerary."
            "you use the Copenhagen RAG Search tool."
        ),
        tools=[copenhagen_rag_search],
        llm=llm,
        max_iter=MAX_ITER,
        verbose=True,
    )

    reviewer = Agent(
        role="Tourist Experience Reviewer",
        goal="Polish the final response so it works well as a chat answer.",
        backstory=(
            "You're Maja, a 40 year old woman, born and raised in vesterbro copenhagen."
            "You review travel advice to make sure it is clear, friendly, "
            "realistic, and easy for tourists to follow."
            "you use the Copenhagen RAG Search tool."
            "Your target is people from all over the world, who's interested in visiting,"
            "or learning more about copenhagen."
        ),
        tools=[copenhagen_rag_search],
        llm=llm,
        max_iter=MAX_ITER,
        verbose=True,
    )

    research_task = Task(
        description=f"""
        Research this tourist request:

        {question}

        You MUST use the Copenhagen RAG Search tool at least once.

        Focus on factual Copenhagen information from the local knowledge base.
        Include useful details about attractions, castles, museums, transport,
        neighborhoods, food, or practical tourist advice when relevant.
        """,
        expected_output=(
            "Grounded research notes based on the Copenhagen RAG knowledge base."
        ),
        agent=local_expert,
    )

    planning_task = Task(
        description=f"""
        Create a helpful tourist response for this request:

        {question}

        Use the research notes from the Copenhagen Local Expert.

        If the user asks for a trip plan, create a clear day-by-day itinerary.
        If the user asks a general question, give a structured helpful answer.
        """,
        expected_output=(
            "A clear markdown response for a tourist visiting Copenhagen."
        ),
        agent=trip_planner,
    )

    review_task = Task(
        description="""
        Review and polish the answer.

        The final answer must:
        - sound like a friendly chatbot response
        - be practical for tourists
        - avoid mentioning internal agents or tasks
        - use markdown formatting
        - keep the answer grounded in the local Copenhagen knowledge base
        """,
        expected_output="A polished final chatbot response in markdown.",
        agent=reviewer,
    )

    crew = Crew(
        agents=[local_expert, trip_planner, reviewer],
        tasks=[research_task, planning_task, review_task],
        process=Process.sequential,
        verbose=True,
    )

    result = crew.kickoff()
    citations_copy = _crew_citations.copy()
    return str(result), citations_copy