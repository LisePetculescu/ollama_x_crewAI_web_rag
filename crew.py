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

    tourist_expert = Agent(
        role="Tourist Experience Researcher",
        goal=(
            "Research and provide accurate, well-sourced Copenhagen tourism information "
            "by querying the local knowledge base."
        ),
        backstory=(
            # TRAIT — who the agent is
            "You are Magnus, a knowledgeable Copenhagen local with deep expertise about the city. "
            "You are meticulous with facts and always verify information from reliable sources. "
            
            # TASK — what the agent specializes in
            "Your expertise is researching attractions, culture, history in Copenhagen and practical visitor information. "
            
            # TONE — how the agent communicates
            "You communicate in a friendly, precise, and fact-focused manner. "
            
            # TARGET — who the agent serves
            "You serve tourists and visitors seeking accurate, detailed information about Copenhagen."
        ),
        tools=[copenhagen_rag_search],
        llm=llm,
        max_iter=MAX_ITER,
        verbose=True,
    )

    trip_planner = Agent(
        role="Copenhagen Trip Planner",
        goal=(
            "Transform research into clear, practical Copenhagen travel itineraries "
            "or well-structured factual responses."
        ),
        backstory=(
            # TRAIT — who the agent is
            "You are an experienced travel planner with a talent for creating realistic, "
            "memorable travel experiences. You combine practical logistics with local insights. "
            
            # TASK — what the agent specializes in
            "Your expertise is organizing information into day-by-day itineraries, "
            "recommending experiences, and answering structured travel questions. "
            
            # TONE — how the agent communicates
            "You are enthusiastic, organized, and helpful—making travel planning feel exciting yet manageable. "
            
            # TARGET — who the agent serves
            "You serve tourists planning trips to Copenhagen who want clear guidance and practical suggestions."
        ),
        tools=[copenhagen_rag_search],
        llm=llm,
        max_iter=MAX_ITER,
        verbose=True,
    )

    reviewer = Agent(
        role="Copenhagen Local Expert",
        goal=(
            "Polish and finalize responses to ensure they are warm, clear, and "
            "perfectly suited for casual chat interactions."
        ),
        backstory=(
            # TRAIT — who the agent is
            "You are Maja, a 40-year-old natively from Vesterbro, Copenhagen with an education in "
            "hospitality and communication. You care deeply about visitor experiences "
            "and the place you've lived in your entire life. "
            
            # TASK — what the agent specializes in
            "Your expertise is taking complex information and making it approachable, "
            "friendly, and easy to understand. You ensure responses are grounded and authentic. "
            
            # TONE — how the agent communicates
            "You communicate in a warm, conversational, and welcoming tone — like a friend sharing advice. "
            
            # TARGET — who the agent serves
            "You serve international tourists and Copenhagen enthusiasts from all over the world "
            "who want genuine, accessible guidance."
        ),
        tools=[copenhagen_rag_search],
        llm=llm,
        max_iter=MAX_ITER,
        verbose=True,
    )

    research_task = Task(
        description=f"""
        Research and gather factual information to answer this tourist request:

        {question}

        You MUST use the Copenhagen RAG Search tool to find accurate information.
        Focus on attractions, castles, museums, transport, neighborhoods, food, 
        or practical tourist advice as relevant to the question.
        """,
        expected_output=(
            "Detailed research notes with facts and sources from the Copenhagen knowledge base."
        ),
        agent=tourist_expert,
    )

    planning_task = Task(
        description=f"""
        Transform the research into a helpful response for this tourist request:

        {question}

        Use the research notes from the Copenhagen Local Expert.
        If the question asks for a trip plan, create a clear day-by-day itinerary.
        If it's a general question, provide a well-organized, structured answer.
        Base everything on the research findings.
        """,
        expected_output=(
            "A clear, structured response in markdown format suitable for tourists."
        ),
        agent=trip_planner,
    )

    review_task = Task(
        description="""
        Review and finalize the response for a chat interface.

        Make sure the answer:
        - Sounds like a friendly, helpful chatbot response
        - Is practical and actionable for tourists
        - Avoids mentioning internal processes or agent names
        - Uses clear markdown formatting
        - Stays grounded in the Copenhagen knowledge base
        - Feels warm and welcoming
        """,
        expected_output="A polished, final chatbot response ready for chat display.",
        agent=reviewer,
    )

    crew = Crew(
        agents=[tourist_expert, trip_planner, reviewer],
        tasks=[research_task, planning_task, review_task],
        process=Process.sequential,
        verbose=True,
    )

    result = crew.kickoff()
    citations_copy = _crew_citations.copy()
    return str(result), citations_copy