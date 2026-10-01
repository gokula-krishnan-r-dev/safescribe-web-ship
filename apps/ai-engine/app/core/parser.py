"""
High-performance multi-format document parser.

Supports:
  - PDF  : PyMuPDF (fitz) — handles text PDFs, embedded images, scanned pages
  - DOCX : python-docx
  - DOC  : falls back to python-docx with a warning
  - TXT  : plain UTF-8
  - OCR  : pytesseract on scanned / image-only PDF pages (optional)
"""
from __future__ import annotations

import io
import logging
from typing import Any

logger = logging.getLogger(__name__)


def detect_type(filename: str, content_type: str) -> str:
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    mime = (content_type or "").lower()

    if ext == "pdf" or "pdf" in mime:
        return "PDF"
    if ext in ("docx",) or "wordprocessingml" in mime or "openxmlformats" in mime:
        return "DOCX"
    if ext in ("doc",) or "msword" in mime:
        return "DOC"
    if ext == "txt" or "text/plain" in mime:
        return "TXT"
    # Magic-byte fallback
    return "UNKNOWN"


def parse_document(
    data: bytes,
    filename: str,
    content_type: str,
    ocr_enabled: bool = True,
    ocr_language: str = "eng",
) -> dict[str, Any]:
    """
    Returns:
        {text, page_count, word_count, file_type, metadata}
    """
    doc_type = detect_type(filename, content_type)

    if doc_type == "PDF":
        return _parse_pdf(data, ocr_enabled, ocr_language)
    if doc_type in ("DOCX", "DOC"):
        return _parse_docx(data)
    if doc_type == "TXT":
        return _parse_txt(data)

    raise ValueError(
        f"Unsupported file type '{filename}' ({content_type}). Use PDF, DOCX, DOC, or TXT."
    )


# ─── PDF ──────────────────────────────────────────────────────────────────────

def _parse_pdf(data: bytes, ocr_enabled: bool, ocr_language: str) -> dict[str, Any]:
    import fitz  # PyMuPDF

    pages: list[str] = []
    ocr_pages = 0
    # Must capture page_count before the Document is closed. Calling len(doc)
    # (or doc.page_count) after close() raises ValueError("document closed"),
    # which was previously mis-mapped to HTTP 415 and broke clinical uploads.
    page_count = 0

    with fitz.open(stream=data, filetype="pdf") as doc:
        page_count = int(doc.page_count)

        for page in doc:
            text = page.get_text("text").strip()

            # If page has very little text it might be scanned → try OCR
            if len(text) < 50 and ocr_enabled:
                ocr_text = _ocr_page(page, ocr_language)
                if ocr_text:
                    text = ocr_text
                    ocr_pages += 1

            if text:
                pages.append(text)

    full_text = _clean("\n\n".join(pages))
    words = full_text.split()

    if ocr_pages:
        logger.info("OCR applied to %d page(s)", ocr_pages)

    return {
        "text": full_text,
        "page_count": page_count,
        "word_count": len(words),
        "file_type": "PDF",
        "metadata": {"ocr_pages": ocr_pages},
    }


def _ocr_page(page: Any, language: str) -> str:
    """Render page as image and run Tesseract OCR."""
    try:
        import pytesseract
        from PIL import Image

        mat = page.get_pixmap(dpi=300)
        img = Image.frombytes("RGB", (mat.width, mat.height), mat.samples)
        return pytesseract.image_to_string(img, lang=language).strip()
    except Exception as exc:
        logger.debug("OCR skipped: %s", exc)
        return ""


# ─── DOCX ────────────────────────────────────────────────────────────────────

def _parse_docx(data: bytes) -> dict[str, Any]:
    from docx import Document  # python-docx

    doc = Document(io.BytesIO(data))
    paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]

    # Also pull text from tables
    for table in doc.tables:
        for row in table.rows:
            for cell in row.cells:
                if cell.text.strip():
                    paragraphs.append(cell.text.strip())

    full_text = _clean("\n\n".join(paragraphs))
    words = full_text.split()

    return {
        "text": full_text,
        "page_count": max(1, len(words) // 250),
        "word_count": len(words),
        "file_type": "DOCX",
        "metadata": {"paragraphs": len(paragraphs)},
    }


# ─── TXT ─────────────────────────────────────────────────────────────────────

def _parse_txt(data: bytes) -> dict[str, Any]:
    text = _clean(data.decode("utf-8", errors="replace"))
    words = text.split()
    return {
        "text": text,
        "page_count": 1,
        "word_count": len(words),
        "file_type": "TXT",
        "metadata": {},
    }


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _clean(text: str) -> str:
    import re

    text = text.replace("\r\n", "\n").replace("\r", "\n").replace("\f", "\n")
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = re.sub(r"[ \t]{2,}", " ", text)
    return text.strip()
