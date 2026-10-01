"""Which Prescribe documents may be sent to an LLM."""

DOCUMENTATION_LLM_KEYS = ("consultation_note", "prescriber_communication")
DOCUMENTATION_DETERMINISTIC_KEYS = frozenset({"prescription", "patient_care_summary"})


def resolve_requested_llm_documents(requested: list[str] | None) -> list[str]:
    """Prescription and Patient Care Summary are deterministic — never LLM."""
    allowed = set(DOCUMENTATION_LLM_KEYS)
    if requested is None:
        return list(DOCUMENTATION_LLM_KEYS)
    return [key for key in requested if key in allowed]
