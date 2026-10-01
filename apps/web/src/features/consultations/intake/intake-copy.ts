export const PRIVACY_POLICY_URL = 'https://safescribe.ca/privacy';

export const INTAKE_COPY = {
  title: 'Patient Complaint',
  subtitle: 'Capture the presenting concern and relevant clinical details.',
  howThisWorks: 'How this works',
  consentLabel: 'Patient consent obtained',
  consentLocked:
    'Patient was informed that SafeScribe may record or transcribe the consultation, extract clinically relevant information for pharmacist review, and temporarily process consultation data.',
  consentConfirmed: 'Consent confirmed. You can capture the presenting concern and consultation notes.',
  explainLink: 'What to explain to the patient',
  consentPopoverTitle: 'Before obtaining consent, explain that:',
  consentBullets: [
    'SafeScribe may record and transcribe the consultation.',
    'Only clinically relevant information is extracted for pharmacist review.',
    'A temporary full transcript may be created when a conversation is recorded.',
    'The temporary full transcript is deleted after the pharmacist approves the consultation note.',
    'The pharmacist reviews and confirms the consultation note before it is used in later clinical steps.',
  ],
  viewPrivacy: 'View full privacy details',
  presentingConcern: 'Presenting concern',
  presentingPlaceholder: 'e.g. Painful blister on upper lip since yesterday',
  noteTitle: 'Consultation note',
  noteSupport: 'Generated from the consultation. Review and edit before continuing.',
  notePlaceholder: 'Click here to start typing. SafeScribe will extract key clinical information to help with later steps.',
  presentingSection: 'Presenting concern',
  relevantSection: 'Relevant clinical information',
  reviewRequired: 'Review required',
  reviewHelper: 'Please review and approve the consultation note to continue.',
  approved: 'Consultation note reviewed and approved',
  transcriptDeleted:
    'Temporary transcript deleted. Only the reviewed consultation note is retained for this consultation.',
  approve: 'Approve & continue',
  continueApproved: 'Continue',
  captureHeading: 'Capture consultation',
  captureHelper: 'Choose how you’d like to capture the consultation.',
  typeTip:
    'Tip: Click in the note above to start typing. SafeScribe will extract key clinical information to help with later steps.',
  dictateHelper: 'Speak your notes. SafeScribe will generate a concise clinical note for review.',
  conversationHelper:
    'Record the pharmacist–patient discussion. SafeScribe will extract a concise clinical note.',
  tempTranscriptNotice:
    'Temporary transcript: The full transcript will be deleted after you approve the consultation note.',
  privacyTitle: 'Your privacy and data',
  privacyBullets: [
    'The consultation may be recorded/transcribed to support clinical note creation.',
    'Only clinically relevant information is intended to move into the pharmacist-facing consultation note.',
    'Non-clinical conversation is not intended to become part of the clinical record.',
    'Temporary transcript/audio is deleted after consultation-note approval where applicable.',
    'The pharmacist reviews and approves the clinical note before it is used in later workflow steps.',
  ],
  transcriptTitle: 'Temporary full transcript',
  transcriptNotice:
    'This full transcript is temporary and will be deleted after you approve the consultation note. Only the reviewed consultation note moves forward.',
  micTitle: 'Connect SafeScribe Mic',
  micBody:
    'Scan this single-use QR code with your SafeScribe Mic device to connect securely. This code expires in 90 seconds.',
  extractionFailed:
    'SafeScribe could not generate the consultation note. You can retry or enter the note manually.',
  micPermission:
    'Microphone access is required to record. Enable microphone access or continue by typing your note.',
  howThisWorksBullets: [
    'Confirm patient consent before capturing the consultation.',
    'Type a note, dictate, or record the pharmacist–patient conversation.',
    'SafeScribe extracts a concise clinically relevant consultation note — it does not diagnose.',
    'Review and edit the note, then approve it before continuing.',
    'Temporary full transcripts are deleted after you approve the note.',
  ],
} as const;
