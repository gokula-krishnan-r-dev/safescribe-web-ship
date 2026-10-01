/**
 * SafeScribe Renew — PCP / Prescriber Notification.
 * Concise pharmacist-to-health-professional communication from confirmed consultation state.
 * Recipient belongs to the communication workflow; the letter says "Dear Colleague."
 * Generate/Copy never means the recipient was notified.
 */

import { displayDob } from './referral-letter-document';
import type { RenewCommunicationPurpose, RenewPayload } from './renew';
import {
  buildRenewDapPayload,
  type RenewDapEncounterContext,
  type RenewDapGenerationPayload,
  type RenewDapPlanRow,
  type RenewDocumentGenerationContext,
} from './renew-dap-note';

export const RENEW_PRESCRIBER_NOTIFICATION_TITLE = 'PHARMACIST RENEWAL NOTIFICATION';
export const RENEW_PRESCRIBER_NOTIFICATION_UI_TITLE = 'Prescriber Communication';
export const RENEW_PRESCRIBER_NOTIFICATION_RE = 'Pharmacist prescription renewal';
export const RENEW_PRESCRIBER_NOTIFICATION_SALUTATION = 'Dear Colleague,';
export const RENEW_PCP_PROMPT_VERSION = 'renew-pcp-provider-v2';

type SenderContact = { phone?: string | null; fax?: string | null; address?: string | null };

const FORBIDDEN_CLAIMS: Array<{ id: string; re: RegExp }> = [
  { id: 'notified', re: /prescriber notified|notified (?:the )?(?:prescriber|physician)|informed the/i },
  { id: 'understands', re: /patient understands|counselled and understands/i },
  { id: 'no_contraindications', re: /no contraindications|renal function acceptable|no renal (?:dosing )?concern/i },
  {
    id: 'internal_terms',
    re: /safety engine|\bstep [1-4]\b|\bllm\b|confidence score|bulk action|reference master/i,
  },
];

const PLACEHOLDER_TEXT: Array<{ id: string; re: RegExp }> = [
  { id: 'recipient_unspecified', re: /recipient not specified(?: in supplied payload)?/i },
  { id: 'recipient_unavailable', re: /recipient unavailable|recipient missing|unknown recipient/i },
  { id: 'payload_leak', re: /\bpayload\b|source data|missing field|not provided in json/i },
];

const ADAPTATION_TERMS = /\badaptation\b|prescription adaptation|renewal\/adaptation|prescribing\s*\/\s*renewal/i;

export function buildPrescriberNotificationNote(
  payload: RenewPayload,
  rows: RenewDapPlanRow[],
  context?: RenewDocumentGenerationContext,
): string {
  const dap = buildRenewDapPayload(payload, rows, context);
  return sanitizeProviderNotificationBody(
    renderPrescriberNotification(dap, payload, rows, context),
  );
}

export function validatePrescriberNotification(body: string): string[] {
  const text = stripMarkup(body);
  const issues = FORBIDDEN_CLAIMS.filter((check) => check.re.test(text)).map(
    (check) => `Unsupported notification claim: ${check.id}`,
  );
  if (/(^|\n)\s*(?:\d+\.\s*)?(?:Patient|To|Re)\s*:/i.test(text) && /^\s*\d+\.\s+(?:Patient|To|Re)\b/im.test(text)) {
    issues.push('Numbered header fields');
  }
  if (/(^|\n)\s*(?:\d+\.\s*)?To\s*:/i.test(text)) {
    issues.push('To line in clinical body');
  }
  if (!/PHARMACIST RENEWAL NOTIFICATION/i.test(text)) {
    issues.push('Missing renew notification title');
  }
  if (/pharmacist prescribing\s*\/\s*renewal/i.test(text)) {
    issues.push('Incorrect mixed prescribing/renewal title');
  }
  if (ADAPTATION_TERMS.test(text)) {
    issues.push('Unsupported renew terminology: adaptation');
  }
  if (!/Dear Colleague/i.test(text)) {
    issues.push('Missing Dear Colleague salutation');
  }
  for (const check of PLACEHOLDER_TEXT) {
    if (check.re.test(text)) issues.push(`Backend placeholder text: ${check.id}`);
  }
  return issues;
}

export function validateGeneratedProviderCommunication(args: {
  generatedText: string;
  patientName?: string | null;
  dateOfBirth?: string | null;
  medicationNames?: string[];
}): string[] {
  const issues = validatePrescriberNotification(args.generatedText);
  const text = stripMarkup(args.generatedText);
  const name = args.patientName?.trim();
  if (name && !text.toLowerCase().includes(name.toLowerCase())) {
    issues.push('Patient name missing from notification');
  }
  const dob = args.dateOfBirth?.trim();
  if (dob) {
    const formatted = displayDob(dob);
    if (!text.includes(dob) && !text.includes(formatted)) {
      issues.push('Patient date of birth missing from notification');
    }
  }
  for (const medication of args.medicationNames ?? []) {
    const token = medication.trim();
    if (token && !text.toLowerCase().includes(token.toLowerCase())) {
      issues.push(`Medication missing from notification: ${token}`);
    }
  }
  return issues;
}

/** Repair numbered headers, To: lines, Adapt titles, and placeholder recipient text. */
export function sanitizeProviderNotificationBody(body: string): string {
  const raw = String(body ?? '').replace(/\r\n/g, '\n').trim();
  if (!raw) return '';

  const lines = looksLikeHtmlMarkup(raw) ? htmlToPlainLines(raw) : raw.split('\n');
  const out: string[] = [];
  let skippingToBlock = false;
  let sawTitle = false;
  let sawDear = false;

  for (const line of lines) {
    const trimmed = line.trim();
    const unnumbered = trimmed.replace(/^\d+\.\s+/, '').replace(/^[-*]\s+/, '');
    if (!trimmed) {
      if (!skippingToBlock) out.push('');
      continue;
    }

    if (isNotificationTitleLine(unnumbered)) {
      if (!sawTitle) {
        out.push(RENEW_PRESCRIBER_NOTIFICATION_TITLE);
        sawTitle = true;
      }
      skippingToBlock = false;
      continue;
    }

    if (/^to\s*:/i.test(unnumbered)) {
      skippingToBlock = true;
      continue;
    }
    if (skippingToBlock) {
      if (
        /^re\s*:/i.test(unnumbered) ||
        /^dear\b/i.test(unnumbered) ||
        /^patient\s*:/i.test(unnumbered) ||
        isSectionHeading(unnumbered)
      ) {
        skippingToBlock = false;
      } else {
        continue;
      }
    }

    if (PLACEHOLDER_TEXT.some((check) => check.re.test(unnumbered))) continue;

    const patientMatch = unnumbered.match(/^patient\s*:\s*(.*)$/i);
    if (patientMatch) {
      out.push(normalizePatientLine(patientMatch[1] ?? ''));
      continue;
    }

    const dobOnly = unnumbered.match(/^dob\s*:\s*(.*)$/i);
    if (dobOnly) {
      const previous = out[out.length - 1] ?? '';
      if (/^patient:/i.test(previous) && !/·\s*DOB:/i.test(previous)) {
        const dob = dobOnly[1]?.trim();
        if (dob) out[out.length - 1] = `${previous.replace(/\s+$/, '')} · DOB: ${dob}`;
        continue;
      }
    }

    if (/^phn\s*:/i.test(unnumbered)) continue;

    const reMatch = unnumbered.match(/^re\s*:/i);
    if (reMatch) {
      out.push(`Re: ${RENEW_PRESCRIBER_NOTIFICATION_RE}`);
      continue;
    }

    if (/^dear colleague\b/i.test(unnumbered)) {
      out.push(RENEW_PRESCRIBER_NOTIFICATION_SALUTATION);
      sawDear = true;
      continue;
    }

    if (ADAPTATION_TERMS.test(unnumbered) && unnumbered.length < 90) continue;

    out.push(unnumbered);
  }

  let text = collapseBlankLines(out.join('\n'));
  if (!sawTitle) {
    text = `${RENEW_PRESCRIBER_NOTIFICATION_TITLE}\n\n${text}`.trim();
  }
  if (!sawDear) text = insertDearColleague(text);
  return collapseBlankLines(text);
}

export function buildRenewPcpPromptPayload(
  dap: RenewDapGenerationPayload,
  payload: RenewPayload,
  rows: RenewDapPlanRow[],
  context?: RenewDocumentGenerationContext,
): Record<string, unknown> {
  const selected = rows.filter((row) => row.selected);
  const notRenewed = rows.filter((row) => !row.selected);
  const recipient = payload.renewalDecision.communication?.recipient ?? null;
  const contact = senderContact(context?.encounter);
  const datePrescribed = formatNotificationDate(dap.encounter.dateTime, dap.encounter.timeZone);
  const nonDrugState = 'MISSING' as const;
  const patientInstructionState = dap.counselling.length ? 'PROVIDED' : 'MISSING';
  const monitoringPlanState =
    dap.followUp.some((row) => row.kind === 'MONITORING' || row.kind === 'SHORTER_RENEWAL') ||
    dap.monitoringCompleted
      ? 'PROVIDED'
      : 'MISSING';

  return {
    outputMode: 'PROVIDER_NOTIFICATION',
    workflow: 'RENEW',
    jurisdiction: dap.encounter.jurisdiction || 'AB',
    language: 'en-CA',
    promptVersion: RENEW_PCP_PROMPT_VERSION,
    letter: {
      title: RENEW_PRESCRIBER_NOTIFICATION_TITLE,
      patientLine: patientLine(dap.encounter),
      re: RENEW_PRESCRIBER_NOTIFICATION_RE,
      salutation: RENEW_PRESCRIBER_NOTIFICATION_SALUTATION,
    },
    prescribingContext: prescribingContextCode(dap.encounter.prescribingBasis),
    prescribingDate: datePrescribed,
    recipient: {
      professionalName: recipient?.name?.trim() || null,
      professionalType: recipient?.profession?.trim() || null,
      clinicName: recipient?.clinicName?.trim() || null,
      contact: {
        phone: recipient?.phone?.trim() || null,
        fax: recipient?.fax?.trim() || null,
        secureMessagingAddress: recipient?.secureMessageAddress?.trim() || null,
      },
      pharmacistConfirmed: Boolean(recipient?.name?.trim()),
      renderInLetterBody: false,
    },
    patientIdentity: {
      fullName: dap.encounter.patientName || null,
      dateOfBirth: dap.encounter.dob ? displayDob(dap.encounter.dob) : null,
      phn: dap.encounter.phn || null,
    },
    medications: rows.map((row) => ({
      medicationId: row.medicationId,
      name: row.displayName,
      finalSig: row.directions,
      quantityLabel: row.quantityLabel,
      durationLabel: row.selected ? formatPlanDuration(row) : null,
      action: row.selected ? 'RENEWED' : 'NOT_RENEWED',
      prescriptionDate: datePrescribed,
      materialToCommunication: row.selected || Boolean(row.safety.note && row.safety.note !== 'No concerns'),
    })),
    rationale: buildRationaleRecords(dap, payload, selected),
    relevantAssessmentSummary: {
      conditions: dap.conditions.map((row) => ({
        displayName: row.displayName,
        medicationNames: row.medicationNames,
        adherenceStatus: row.adherenceStatus,
        effectivenessStatus: row.effectivenessStatus,
        medicationConcernStatus: row.medicationConcernStatus,
        exceptionNotes: row.exceptionNotes,
      })),
      exceptions: dap.conditions.flatMap((row) => row.exceptionNotes),
      limitations: [
        ...dap.monitoringResults
          .filter((row) => row.unavailable)
          .map((row) => ({
            type: 'MONITORING',
            description: `Recent ${row.label} unavailable${row.unavailableReason ? ` — ${row.unavailableReason}` : ''}`,
            materialToCommunication: true,
          })),
        ...dap.dtps.map((row) => ({
          type: 'DTP',
          description: row.description,
          materialToCommunication: true,
        })),
      ],
    },
    clinicallyMaterialFindings: buildMaterialFindings(dap),
    nonDrugRecommendations: [],
    nonDrugRecommendationState: nonDrugState,
    monitoringPlan: dap.followUp
      .filter((row) => row.kind === 'MONITORING' || row.kind === 'SHORTER_RENEWAL')
      .map((row) => ({ text: row.text, kind: row.kind })),
    monitoringPlanState,
    patientInstructions: dap.counselling.map((row) => ({
      description: row.description,
      actuallyProvided: true,
    })),
    patientInstructionState,
    relevantFollowUp: dap.followUp
      .filter((row) => row.kind === 'PRESCRIBER' || row.kind === 'REFERRAL')
      .map((row) => ({ text: row.text, kind: row.kind })),
    notRenewedMaterial: notRenewed
      .filter((row) => row.safety.note && row.safety.note !== 'No concerns')
      .map((row) => ({
        displayName: row.displayName,
        note: row.safety.note,
      })),
    dtpState: dap.dtpState,
    dialysisLabel: dap.dialysisLabel,
    uncoveredMedicationNames: dap.uncoveredMedicationNames,
    pharmacistIdentity: {
      name: dap.encounter.pharmacistName || null,
      role: dap.encounter.pharmacistRole || null,
      registrationNumber: context?.prescriber?.registrationNumber?.trim() || null,
    },
    practiceSite: {
      name: dap.encounter.practiceSite || null,
      phone: contact.phone || null,
      fax: contact.fax || null,
      address: contact.address || null,
    },
  };
}

export function renderPrescriberNotification(
  dap: RenewDapGenerationPayload,
  payload: RenewPayload,
  rows: RenewDapPlanRow[],
  context?: RenewDocumentGenerationContext,
): string {
  const selected = rows.filter((row) => row.selected);
  const notRenewed = rows.filter((row) => !row.selected);
  const encounter = dap.encounter;
  const purpose = derivePurpose(payload);
  const contact = senderContact(context?.encounter);
  const datePrescribed = formatNotificationDate(encounter.dateTime, encounter.timeZone);
  const opening = openingParagraph(dap, payload, selected);
  const rationale = rationaleBlock(opening, buildRationaleRecords(dap, payload, selected));

  const lines = [
    RENEW_PRESCRIBER_NOTIFICATION_TITLE,
    '',
    patientLine(encounter),
    '',
    `Re: ${RENEW_PRESCRIBER_NOTIFICATION_RE}`,
    '',
    RENEW_PRESCRIBER_NOTIFICATION_SALUTATION,
    '',
    opening,
    '',
    medicationBlock(selected, datePrescribed),
    notRenewed.length ? notRenewedBlock(notRenewed) : null,
    '',
    rationale,
    '',
    clinicalInformationBlock(dap, selected),
    '',
    planBlock(dap, purpose, notRenewed),
    counsellingBlock(dap),
    '',
    signatureBlock(dap, contact, context?.prescriber?.registrationNumber),
  ];

  return collapseBlankLines(
    lines.filter((line): line is string => Boolean(line)).join('\n'),
  );
}

function prescribingContextCode(
  basis: RenewDapGenerationPayload['encounter']['prescribingBasis'],
): string {
  if (basis === 'APA_ONGOING_CARE') return 'ONGOING_CARE_PRESCRIBING';
  return 'PRESCRIPTION_RENEWAL';
}

function buildRationaleRecords(
  dap: RenewDapGenerationPayload,
  payload: RenewPayload,
  selected: RenewDapPlanRow[],
): Array<{ category: string; text: string }> {
  const records: Array<{ category: string; text: string }> = [];
  const reasons = dap.renewalRequest.reasons;
  const shorter = selected.some((row) =>
    isShorterThanRequested(row, payload.renewalRequest.requestedDuration),
  );
  if (shorter) {
    records.push({
      category: 'SHORTER_RENEWAL_FOR_REASSESSMENT',
      text: 'A shorter renewal interval was selected to maintain continuity while allowing reassessment.',
    });
  } else if (reasons.some((row) => /no refill/i.test(row))) {
    records.push({
      category: 'NO_REFILLS_BEFORE_FOLLOWUP',
      text: 'Renewed to maintain continuity of established therapy because no refills remained before regular prescriber follow-up.',
    });
  } else if (selected.length) {
    records.push({
      category: 'CONTINUITY_OF_STABLE_THERAPY',
      text: 'Renewed to maintain continuity of established therapy.',
    });
  }
  for (const note of dap.conditions.flatMap((row) => row.exceptionNotes)) {
    records.push({ category: 'CLINICALLY_MATERIAL_EXCEPTION', text: note });
  }
  return records;
}

function buildMaterialFindings(dap: RenewDapGenerationPayload): Array<Record<string, unknown>> {
  const findings: Array<Record<string, unknown>> = [];
  for (const row of dap.patientSpecificScreen.filter((item) => item.positive || item.unable)) {
    findings.push({
      type: 'SAFETY',
      description: `${row.label}${row.detail ? ` (${row.detail})` : ''}`,
      materialToCommunication: true,
    });
  }
  for (const row of dap.monitoringResults) {
    if (row.unavailable) {
      findings.push({
        type: 'MONITORING',
        description: `Recent ${row.label} unavailable${row.unavailableReason ? ` — ${row.unavailableReason}` : ''}`,
        materialToCommunication: true,
      });
      continue;
    }
    if (row.valueText || (row.reviewLabel && row.reviewLabel !== 'Continue and monitor')) {
      findings.push({
        type: 'MONITORING',
        description: [
          row.label,
          row.valueText,
          row.dateText ? `(${row.dateText})` : null,
          row.reviewLabel && row.reviewLabel !== 'Continue and monitor' ? row.reviewLabel : null,
          row.reviewNote,
        ]
          .filter(Boolean)
          .join(' '),
        materialToCommunication: true,
      });
    }
  }
  for (const dtp of dap.dtps) {
    findings.push({
      type: 'DTP',
      description: dtp.description,
      materialToCommunication: true,
    });
  }
  if (dap.dialysisLabel) {
    findings.push({
      type: 'PATIENT_CONTEXT',
      description: `Dialysis-dependent; ${dap.dialysisLabel}`,
      materialToCommunication: true,
    });
  }
  return findings;
}

function patientLine(encounter: RenewDapGenerationPayload['encounter']): string {
  const name = encounter.patientName?.trim();
  const dob = encounter.dob ? displayDob(encounter.dob) : '';
  if (name && dob) return `Patient: ${name} · DOB: ${dob}`;
  if (name) return `Patient: ${name}`;
  if (dob) return `Patient: · DOB: ${dob}`;
  return 'Patient:';
}

function openingParagraph(
  dap: RenewDapGenerationPayload,
  payload: RenewPayload,
  selected: RenewDapPlanRow[],
): string {
  if (!selected.length) {
    return 'The patient was assessed for medication renewal. No medications were renewed at this visit.';
  }
  const duration = compactDurationPhrase(selected, dap.renewalRequest.requestedDuration);
  const reason = compactReason(dap.renewalRequest.reasons);
  const shorter = selected.some((row) =>
    isShorterThanRequested(row, payload.renewalRequest.requestedDuration),
  );
  const subject =
    selected.length === 1 ? selected[0]?.displayName || 'Established therapy' : 'Established therapy';
  if (shorter && duration) {
    return `${subject} was renewed for ${duration} to maintain continuity of established therapy while allowing reassessment.`;
  }
  if (reason && duration) {
    return `${subject} was renewed for ${duration} to maintain continuity of established therapy because ${reason}.`;
  }
  if (reason) {
    return `${subject} was renewed to maintain continuity of established therapy because ${reason}.`;
  }
  if (duration) {
    return `${subject} was renewed for ${duration} to maintain continuity of established therapy.`;
  }
  return `${subject} was renewed to maintain continuity of established therapy.`;
}

function rationaleBlock(
  opening: string,
  records: Array<{ category: string; text: string }>,
): string | null {
  const unique = records
    .map((row) => row.text.trim())
    .filter(Boolean)
    .filter((text) => !containsLoosely(opening, text));
  if (!unique.length) return null;
  return ['Rationale', '', unique.join(' ')].join('\n');
}

function medicationBlock(selected: RenewDapPlanRow[], datePrescribed: string): string | null {
  if (!selected.length) return null;
  const heading = selected.length === 1 ? 'Medication renewed' : 'Medications renewed';
  const blocks = selected.map((row) => {
    const lines = [row.displayName];
    const sig = compactDirections(row.directions);
    if (sig) lines.push(ensureSentence(sig));
    const meta: string[] = [];
    if (row.quantityLabel?.trim()) meta.push(`Quantity: ${row.quantityLabel.trim()}`);
    const duration = formatPlanDuration(row);
    if (duration) meta.push(`Renewal duration: ${duration}`);
    if (datePrescribed) meta.push(`Date prescribed: ${datePrescribed}`);
    if (meta.length) lines.push(meta.join(' · '));
    return lines.join('\n');
  });
  return [heading, '', blocks.join('\n\n')].join('\n');
}

function notRenewedBlock(notRenewed: RenewDapPlanRow[]): string | null {
  const material = notRenewed.filter((row) => row.safety.note && row.safety.note !== 'No concerns');
  if (!material.length) return null;
  return [
    'Not renewed',
    '',
    ...material.map(
      (row) => `${row.displayName}${row.safety.note ? ` — ${row.safety.note}` : ' at this time'}`,
    ),
  ].join('\n');
}

function clinicalInformationBlock(
  dap: RenewDapGenerationPayload,
  selected: RenewDapPlanRow[],
): string | null {
  const sentences: string[] = [];
  const therapy = compactTherapySentence(dap, selected);
  if (therapy) sentences.push(therapy);

  const exceptions = dap.conditions.flatMap((row) => row.exceptionNotes);
  if (exceptions.length) sentences.push(exceptions.join(' '));

  const monitoring = compactMonitoringSentence(dap);
  if (monitoring) sentences.push(monitoring);

  for (const finding of dap.patientSpecificScreen.filter((row) => row.positive || row.unable)) {
    sentences.push(
      `${finding.label}${finding.detail ? ` (${finding.detail})` : ''} was reviewed during the renewal assessment.`,
    );
  }

  if (dap.dtps.length) {
    sentences.push(
      dap.dtps
        .map((dtp) => `${dtp.state === 'ACTUAL' ? 'Actual' : 'Potential'} drug therapy problem: ${dtp.description}`)
        .join(' '),
    );
  }

  if (dap.dialysisLabel) {
    sentences.push(
      `Patient is dialysis-dependent. ${dap.dialysisLabel} Medication-specific renal/dialysis considerations were reviewed.`,
    );
  }

  if (!sentences.length) return null;
  return ['Relevant clinical information', '', sentences.join(' ')].join('\n');
}

function planBlock(
  dap: RenewDapGenerationPayload,
  purpose: RenewCommunicationPurpose,
  notRenewed: RenewDapPlanRow[],
): string | null {
  const followUp = dap.followUp.filter((row) => row.kind === 'MONITORING' || row.kind === 'SHORTER_RENEWAL');
  const action = dap.followUp.filter((row) => row.kind === 'PRESCRIBER' || row.kind === 'REFERRAL');
  const parts: string[] = [];
  if (followUp.length) parts.push(followUp.map((row) => row.text).join(' '));
  if (action.length) parts.push(action.map((row) => row.text).join(' '));
  if (purpose === 'CLARIFICATION_REQUESTED' && dap.uncoveredMedicationNames.length) {
    parts.push(
      `Please confirm the current regimen for ${dap.uncoveredMedicationNames.join(', ')} before further renewal.`,
    );
  } else if (purpose === 'URGENT_CLINICAL_FOLLOW_UP') {
    parts.push('Urgent clinical follow-up was requested.');
  } else if (purpose === 'FOLLOW_UP_REQUESTED') {
    parts.push('Follow-up was requested.');
  }
  const deferred = notRenewed.filter((row) => row.safety.note && row.safety.note !== 'No concerns');
  if (deferred.length && purpose !== 'NOTIFICATION_ONLY') {
    parts.push(
      deferred
        .map((row) => `${row.displayName} was not renewed${row.safety.note ? ` — ${row.safety.note}` : ''}.`)
        .join(' '),
    );
  }
  if (!parts.filter(Boolean).length) return null;
  return ['Monitoring / follow-up', '', parts.filter(Boolean).join(' ')].join('\n');
}

function counsellingBlock(dap: RenewDapGenerationPayload): string | null {
  if (!dap.counselling.length) return null;
  return [
    'Patient instructions',
    '',
    dap.counselling.map((row) => ensureSentence(row.description)).join(' '),
  ].join('\n');
}

function signatureBlock(
  dap: RenewDapGenerationPayload,
  contact: SenderContact,
  registrationNumber?: string | null,
): string {
  return [
    dap.encounter.pharmacistName
      ? `${dap.encounter.pharmacistName}, ${dap.encounter.pharmacistRole || 'Pharmacist'}`
      : null,
    registrationNumber?.trim() ? `ACP Reg. # ${registrationNumber.trim()}` : null,
    dap.encounter.practiceSite,
    contact.address?.trim() || null,
    contact.phone ? `Phone: ${contact.phone}` : null,
    contact.fax ? `Fax: ${contact.fax}` : null,
  ]
    .filter(Boolean)
    .join('\n');
}

function compactTherapySentence(
  dap: RenewDapGenerationPayload,
  selected: RenewDapPlanRow[],
): string | null {
  if (!dap.conditions.length) return null;
  const exceptions = dap.conditions.flatMap((row) => row.exceptionNotes);
  const allAdherent = dap.conditions.every((row) => row.adherenceStatus === 'yes');
  const effective = dap.conditions.every((row) => row.effectivenessStatus === 'yes');
  const unable = dap.conditions.some(
    (row) => row.effectivenessStatus === 'unable_to_assess' || row.effectivenessStatus === 'unsure',
  );
  const noConcern = dap.conditions.every((row) => row.medicationConcernStatus === 'no');
  const med =
    selected.length === 1 ? selected[0]?.displayName?.trim() || 'the medication' : 'the current regimen';

  if (exceptions.length) {
    return allAdherent ? 'Patient reports adherence.' : null;
  }
  if (unable && !effective) {
    const lead = allAdherent
      ? `Patient reports using ${med} as directed. Current symptom control could not be fully assessed during this encounter.`
      : 'Current symptom control could not be fully assessed during this encounter.';
    return noConcern ? `${lead.replace(/\.$/, '')} No medication-related concerns were identified.` : lead;
  }
  if (allAdherent && effective && noConcern) {
    return `Patient reports using ${med} as directed with adequate symptom control and no medication-related concerns identified during the renewal assessment.`;
  }
  const parts: string[] = [];
  if (allAdherent) parts.push(`Patient reports using ${med} as directed`);
  if (effective) parts.push('adequate symptom control');
  if (noConcern) parts.push('no medication-related concerns identified during the renewal assessment');
  return parts.length ? `${parts.join(', with ')}.`.replace(', with ,', ',') : null;
}

function compactMonitoringSentence(dap: RenewDapGenerationPayload): string | null {
  const items = dap.monitoringResults;
  if (!items.length) return null;
  const unavailable = items.filter((row) => row.unavailable);
  const concerning = items.filter(
    (row) => !row.unavailable && row.reviewLabel && row.reviewLabel !== 'Continue and monitor',
  );
  const sentences: string[] = [];
  if (concerning.length) {
    sentences.push(
      concerning
        .map((row) => {
          const value = row.valueText ? `${row.label} ${row.valueText}` : row.label;
          const date = row.dateText ? ` (${row.dateText})` : '';
          const review = [row.reviewLabel, row.reviewNote].filter(Boolean).join('; ');
          return `${value}${date}${review ? `, ${review}` : ''}.`;
        })
        .join(' '),
    );
  }
  if (unavailable.length) {
    sentences.push(
      unavailable
        .map(
          (row) =>
            `Recent ${row.label} result unavailable${
              row.unavailableReason ? ` — ${row.unavailableReason}` : ''
            }.`,
        )
        .join(' '),
    );
  }
  return sentences.join(' ') || null;
}

function compactDurationPhrase(
  selected: RenewDapPlanRow[],
  requested: string | null,
): string | null {
  const durations = [
    ...new Set(selected.map((row) => formatPlanDuration(row)).filter((row): row is string => Boolean(row))),
  ];
  const pick = durations.length === 1 ? durations[0] : null;
  const source =
    pick ||
    (requested && /^\d+\s+days?$/i.test(requested)
      ? requested
      : requested === '30_days'
        ? '30 days'
        : requested === '14_days'
          ? '14 days'
          : requested === '7_days'
            ? '7 days'
            : null);
  return source;
}

function compactReason(reasons: string[]): string | null {
  const joined = reasons.map((row) => row.trim()).filter(Boolean).join(', ').toLowerCase();
  if (!joined) return null;
  if (joined.includes('no refill') && joined.includes('unable to see')) {
    return 'no refills remained before regular prescriber follow-up';
  }
  if (joined.includes('no refill')) return 'no refills remained before regular prescriber follow-up';
  return joined;
}

function compactDirections(directions: string | null): string | null {
  if (!directions?.trim()) return null;
  return directions.replace(/\s+/g, ' ').replace(/\.$/, '').trim() || null;
}

function derivePurpose(payload: RenewPayload): RenewCommunicationPurpose {
  return payload.renewalDecision.communication?.purpose ?? 'NOTIFICATION_ONLY';
}

function senderContact(encounter?: RenewDapEncounterContext): SenderContact {
  return {
    phone: encounter?.phone?.trim() || null,
    fax: encounter?.fax?.trim() || null,
    address: encounter?.address?.trim() || null,
  };
}

function formatPlanDuration(
  row: Pick<RenewDapPlanRow, 'durationId' | 'customDurationDays' | 'customDurationText'>,
): string | null {
  if (!row.durationId) return null;
  if (row.durationId === 'custom') {
    if (row.customDurationDays && row.customDurationDays > 0) return `${row.customDurationDays} days`;
    return row.customDurationText?.trim() || 'Custom';
  }
  if (row.durationId === '7_days') return '7 days';
  if (row.durationId === '14_days') return '14 days';
  if (row.durationId === '30_days') return '30 days';
  if (row.durationId === 'next_blister_cycle') return 'Next blister cycle';
  return null;
}

function isShorterThanRequested(row: RenewDapPlanRow, requestedId: string | null | undefined): boolean {
  const rank: Record<string, number> = { '7_days': 7, '14_days': 14, '30_days': 30 };
  if (!row.durationId || !requestedId) return false;
  const selected = rank[row.durationId];
  const requested = rank[requestedId];
  return selected != null && requested != null && selected < requested;
}

function formatNotificationDate(iso: string, timeZone = 'America/Edmonton'): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone,
    }).formatToParts(date);
    const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
    return `${get('day')}-${get('month')}-${get('year')}`;
  } catch {
    return iso;
  }
}

function normalizePatientLine(raw: string): string {
  const cleaned = raw.replace(/\s+/g, ' ').trim();
  if (!cleaned) return 'Patient:';
  if (/·\s*DOB:/i.test(cleaned) || /\bDOB:/i.test(cleaned)) {
    return `Patient: ${cleaned.replace(/^patient:\s*/i, '')}`;
  }
  return `Patient: ${cleaned}`;
}

function insertDearColleague(text: string): string {
  if (/Dear Colleague/i.test(text)) return text;
  const reLine = /^(Re:\s*.+)$/im;
  if (reLine.test(text)) {
    return text.replace(reLine, `$1\n\n${RENEW_PRESCRIBER_NOTIFICATION_SALUTATION}`);
  }
  const patientLineMatch = /^(Patient:\s*.+)$/im;
  if (patientLineMatch.test(text)) {
    return text.replace(
      patientLineMatch,
      `$1\n\nRe: ${RENEW_PRESCRIBER_NOTIFICATION_RE}\n\n${RENEW_PRESCRIBER_NOTIFICATION_SALUTATION}`,
    );
  }
  return `${text}\n\n${RENEW_PRESCRIBER_NOTIFICATION_SALUTATION}`;
}

function isNotificationTitleLine(value: string): boolean {
  return /pharmacist (?:prescribing\s*\/\s*)?renewal notification|prescriber notification|pharmacist communication to primary care provider/i.test(
    value,
  );
}

function isSectionHeading(value: string): boolean {
  return /^(medication(?:s)? renewed|rationale|relevant clinical information|monitoring\s*\/\s*follow-up|patient instructions|non-pharmacological recommendations|not renewed)\b/i.test(
    value,
  );
}

function containsLoosely(haystack: string, needle: string): boolean {
  const left = haystack.toLowerCase().replace(/[^a-z0-9]+/g, ' ');
  const right = needle.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  if (!right) return true;
  if (left.includes(right)) return true;
  const key = right.replace(/^renewed (?:for \d+ days )?to /, '');
  return key.length > 24 && left.includes(key);
}

function looksLikeHtmlMarkup(value: string): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(value);
}

function htmlToPlainLines(html: string): string[] {
  return html
    .replace(/<\/(p|div|h1|h2|li|tr)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .split('\n');
}

function stripMarkup(value: string): string {
  return value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
}

function collapseBlankLines(value: string): string {
  return value.replace(/\n{3,}/g, '\n\n').trim();
}

function ensureSentence(value: string): string {
  const text = value.replace(/\s+/g, ' ').trim();
  if (!text) return text;
  return /[.!?]$/.test(text) ? text : `${text}.`;
}
