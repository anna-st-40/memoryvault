import logging
import os

from sqlalchemy.orm import Session

from app import schemas
from app.services.llm_client import OLLAMA_MODEL, chat
from app.services.rag_retriever import EMBEDDING_MODEL, RagChunk, retrieve

logger = logging.getLogger(__name__)

_SYSTEM_PROMPT = """You are a personal memory assistant for a private video diary archive.
Answer the user's question using ONLY the provided transcript excerpts.
Do not use any outside knowledge.
Always respond in second person — refer to the user as "you" (e.g. "you said", "you were feeling"), never in third person (e.g. "the speaker", "they").
If the context does not contain enough information to answer the question confidently, respond with exactly:
"I don't have enough information in your memories to answer that."
Be concise. Do not repeat the context verbatim."""

_NO_CONTEXT_ANSWER = "I don't have enough information in your memories to answer that."


def _ms_to_hms(ms: int) -> str:
    s = ms // 1000
    h, rem = divmod(s, 3600)
    m, sec = divmod(rem, 60)
    if h:
        return f"{h}:{m:02d}:{sec:02d}"
    return f"{m}:{sec:02d}"


def _build_user_prompt(query: str, chunks: list[RagChunk]) -> str:
    blocks = []
    for i, chunk in enumerate(chunks, start=1):
        date_str = chunk.recorded_at or "Unknown date"
        start_t = _ms_to_hms(chunk.start_ms)
        end_t = _ms_to_hms(chunk.end_ms)
        blocks.append(
            f"[Memory {i}]\n"
            f"Video: {chunk.video_title}\n"
            f"Date: {date_str}\n"
            f"Timestamp: {start_t} – {end_t}\n"
            f"Excerpt: {chunk.text}"
        )
    context = "\n\n".join(blocks)
    return f"Context from your memories:\n\n{context}\n\nQuestion: {query}"


def _chunk_to_citation(chunk: RagChunk) -> schemas.RagCitation:
    return schemas.RagCitation(
        chunk_id=chunk.chunk_id,
        video_id=chunk.video_id,
        video_title=chunk.video_title,
        recorded_at=chunk.recorded_at,
        start_ms=chunk.start_ms,
        end_ms=chunk.end_ms,
        snippet=chunk.text[:300] + ("..." if len(chunk.text) > 300 else ""),
        score=round(chunk.score, 4),
        thumbnail_url=chunk.thumbnail_url,
        video_url=f"/videos/{chunk.video_id}?t={chunk.start_ms}",
        collection=chunk.collection,
        duration_sec=chunk.duration_sec,
    )


def ask(
    query: str,
    db: Session,
    top_k: int = 5,
    collections: list[str] | None = None,
) -> schemas.RagAnswer:
    """
    Full RAG pipeline: retrieve → prompt → LLM → structured answer with citations.
    collections defaults to ["transcript_chunks"].
    """
    if collections is None:
        collections = ["transcript_chunks"]

    all_chunks: list[RagChunk] = []
    for collection in collections:
        all_chunks.extend(retrieve(query=query, db=db, top_k=top_k, collection=collection))

    # Re-sort and re-slice if multiple collections
    if len(collections) > 1:
        all_chunks.sort(key=lambda c: c.score, reverse=True)
        all_chunks = all_chunks[:top_k]

    model_name = os.getenv("OLLAMA_MODEL", OLLAMA_MODEL)

    if not all_chunks:
        return schemas.RagAnswer(
            answer=_NO_CONTEXT_ANSWER,
            citations=[],
            retrieved_chunk_count=0,
            model=model_name,
            embedding_model=EMBEDDING_MODEL,
        )

    user_prompt = _build_user_prompt(query, all_chunks)
    answer_text = chat(
        system_prompt=_SYSTEM_PROMPT,
        user_prompt=user_prompt,
        model=model_name,
    )

    citations = [_chunk_to_citation(c) for c in all_chunks]

    return schemas.RagAnswer(
        answer=answer_text.strip(),
        citations=citations,
        retrieved_chunk_count=len(all_chunks),
        model=model_name,
        embedding_model=EMBEDDING_MODEL,
    )
