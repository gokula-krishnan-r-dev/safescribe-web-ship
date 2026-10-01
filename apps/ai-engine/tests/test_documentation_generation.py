from app.core.consultation_ai import _format_block, _payload_json
from app.core.documentation_keys import resolve_requested_llm_documents


def test_default_request_is_dap_and_pcp_only():
    assert resolve_requested_llm_documents(None) == [
        "consultation_note",
        "prescriber_communication",
    ]


def test_prescription_and_handout_are_never_llm_keys():
    assert resolve_requested_llm_documents(
        ["prescription", "patient_care_summary", "consultation_note"]
    ) == ["consultation_note"]


def test_empty_requested_list_generates_no_llm_documents():
    assert resolve_requested_llm_documents([]) == []


def test_payload_json_is_compact_and_complete():
    raw = _payload_json({"dap_payload": {"consent_obtained": True, "note": "ok"}})
    assert '"consent_obtained":true' in raw
    assert "\n" not in raw


def test_format_block_omits_competing_writing_prompt_by_default():
    block = _format_block(
        {
            "consultation_note": {
                "name": "Pharmacist Consultation Note",
                "aiPrompt": "KEEP D CONCISE OVERRIDE",
                "styleNotes": "Natural DAP",
                "responseSchema": {
                    "fields": [{"key": "data", "label": "Data", "type": "string"}]
                },
            }
        },
        "consultation_note",
    )
    assert "KEEP D CONCISE OVERRIDE" not in block
    assert "data" in block
    assert "writing authority" in block


def test_format_block_can_include_writing_prompt_for_legacy_bundle():
    block = _format_block(
        {
            "consultation_note": {
                "name": "Note",
                "aiPrompt": "KEEP D CONCISE OVERRIDE",
            }
        },
        "consultation_note",
        include_writing_prompt=True,
    )
    assert "KEEP D CONCISE OVERRIDE" in block
