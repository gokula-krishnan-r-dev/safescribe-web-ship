"""
Section-aware, overlap-preserving text chunker.

Strategy:
1. Try to split on structural markers (numbered headings, ALL-CAPS headers,
   blank lines following a header-like line) to keep semantic units together.
2. Fall back to sentence-boundary splitting inside oversized paragraphs.
3. Add configurable character overlap between consecutive chunks so context
   is never lost at chunk boundaries.
"""
from __future__ import annotations

import re
import logging

logger = logging.getLogger(__name__)

# Patterns that suggest the start of a new section
_SECTION_BREAK = re.compile(
    r"(?:"
    r"\n(?=\d+[\.\)]\s)"           # "1. " or "1) " numbered item
    r"|(?<=\n\n)(?=[A-Z][A-Z ]{4,})"  # ALL CAPS heading after blank line
    r"|(?<=\n)(?=#{1,3} )"         # Markdown heading
    r"|\n{2,}(?=\d+[\.\)]\s)"      # blank-line + numbered item
    r")"
)


def chunk_text(
    text: str,
    chunk_size: int = 3500,
    overlap: int = 300,
    max_chunks: int = 50,
) -> list[str]:
    """
    Split *text* into chunks of at most *chunk_size* chars with *overlap*
    chars shared between consecutive chunks.  Returns at most *max_chunks*.
    """
    if not text:
        return []

    if len(text) <= chunk_size:
        return [text]

    # Split into structural units first
    units = _section_break_split(text, chunk_size)

    # Pack units into chunks, respecting size limit
    chunks: list[str] = []
    current = ""

    for unit in units:
        if len(unit) > chunk_size:
            # Unit itself is oversized — split at sentence boundary
            for subchunk in _sentence_split(unit, chunk_size, overlap):
                if current and len(current) + len(subchunk) > chunk_size:
                    chunks.append(current.strip())
                    tail = _tail(current, overlap)
                    current = tail + subchunk
                else:
                    current += ("\n" if current else "") + subchunk
        elif current and len(current) + len(unit) + 1 > chunk_size:
            chunks.append(current.strip())
            tail = _tail(current, overlap)
            current = tail + unit
        else:
            current += ("\n" if current else "") + unit

    if current.strip():
        chunks.append(current.strip())

    # Deduplicate and cap
    seen: set[str] = set()
    deduped: list[str] = []
    for c in chunks:
        if c not in seen and len(c) > 40:
            seen.add(c)
            deduped.append(c)

    if len(deduped) > max_chunks:
        logger.warning("Capping %d chunks to %d", len(deduped), max_chunks)
        deduped = deduped[:max_chunks]

    logger.debug("Chunked into %d chunks (avg %.0f chars)", len(deduped),
                 sum(len(c) for c in deduped) / max(1, len(deduped)))
    return deduped


def _section_break_split(text: str, max_unit: int) -> list[str]:
    """Split on section markers; any unit still > max_unit will be sub-split later."""
    parts = _SECTION_BREAK.split(text)
    return [p for p in parts if p.strip()]


def _sentence_split(text: str, max_size: int, overlap: int) -> list[str]:
    """Split oversized text at sentence boundaries."""
    sentences = re.split(r"(?<=[.!?])\s+", text)
    chunks: list[str] = []
    current = ""
    for sent in sentences:
        if len(current) + len(sent) + 1 > max_size and current:
            chunks.append(current.strip())
            current = _tail(current, overlap) + sent
        else:
            current += (" " if current else "") + sent
    if current.strip():
        chunks.append(current.strip())
    return chunks


def _tail(text: str, n: int) -> str:
    """Return last *n* chars of *text* as an overlap prefix."""
    if not text or n <= 0:
        return ""
    tail = text[-n:]
    # Start overlap at a word boundary
    space = tail.find(" ")
    return (tail[space + 1:] if space != -1 else tail) + "\n"
