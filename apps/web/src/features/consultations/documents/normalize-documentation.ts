import type { Consultation } from '../types';
import { toClinicalScreeningPhrase } from '@safescript/shared';
import type {
  DocumentationPackage,
  DocumentContents,
  DocumentationRevision,
  DocumentTypeId,
  PatientDocumentInfo,
} from './types';
import { patientInfoFingerprint } from './document-dependencies';
import { finalizePatientDocumentInfo } from './patient-address';
import { generateAllDocumentFields } from './generators';
import {
  formatPrescriptionRxTitle,
  prescriptionMedicationsLookLegacy,
  upsertPrescriptionPatientHtml,
  upsertPrescriptionRxTitlesHtml,
  upsertPrescriptionRxTitlesPlain,
} from './generators/prescription-generator';
import { mergePatientHandoutFields, upgradePatientHandoutFields, ensureHandoutHtmlHasCounsellingCards, ensureHandoutHtmlHasPharmacyContact } from './handout-format';
import {
  mergePcpCommunicationFields,
  patchHtmlDataField,
  ensurePcpHtmlSignature,
  upgradePcpCommunicationFields,
} from './pcp-format';
import { mergeDapNoteFields, upgradeDapNoteFields, applyDapClinicalReferencesSentence, applyClinicalReferencesToDapFields, applyDapAttestationToFields, clinicalReferencesFromDocumentation } from './dap-note-format';
import { formatPrescribeDocumentChrome } from './pathway-document-citations';

/** Keys that must always follow the Patient Information form (not stale AI/manual headers). */
const PATIENT_DEPENDENT_PCP_KEYS = [
  'headerBlock',
  'patientName',
  'patientDob',
  'patientPhn',
] as const;
/** Keys that must always follow the confirmed treatment selection (not stale AI text). */
const TREATMENT_DEPENDENT_HANDOUT_KEYS = [
  'treatment',
  'documentTitle',
] as const;
const COUNSELLING_HANDOUT_KEYS = [
  'expectedResponse',
  'selfCare',
  'seekCare',
  'followUp',
] as const;

function clinicalImpression(pathwayName?: string, diagnosis?: string): string {
  const label = diagnosis?.trim() || pathwayName?.trim();
  if (!label) return 'Clinical presentation is consistent with the selected minor ailment pathway.';
  return `Clinical presentation is most consistent with ${label}.`;
}

function formatMedicationLines(
  treatments: Array<{
    medicationName: string;
    dose?: string;
    frequency?: string;
    duration?: string;
    route?: string;
    instructions?: string;
  }>,
): string {
  return treatments
    .map((t) => {
      const regimen = [t.dose, t.frequency, t.duration, t.route].filter(Boolean).join(' ');
      const head = regimen ? `${t.medicationName}\n${regimen}` : t.medicationName;
      return t.instructions ? `${head}\n${t.instructions}` : head;
    })
    .join('\n\n');
}

function responseValue(r: { answer: string | boolean | number | null; answerText?: string }): string {
  if (r.answerText?.trim()) return r.answerText.trim();
  if (typeof r.answer === 'boolean') return r.answer ? 'yes' : 'no';
  return String(r.answer ?? '').trim();
}

function assessmentBullets(consultation: Consultation): string {
  const bullets: string[] = [];
  if (consultation.chiefComplaint?.trim()) {
    bullets.push(`Presenting complaint: ${consultation.chiefComplaint.trim()}`);
  }
  const responses = consultation.questionResponses;
  if (responses) {
    const positive = Object.values(responses)
      .filter((r) => {
        const v = responseValue(r).toLowerCase();
        return v === 'yes' || v === 'present' || v === 'true';
      })
      .slice(0, 6);
    for (const r of positive) {
      if (r.question) bullets.push(r.question);
    }
  }
  if (consultation.redFlags && !consultation.redFlags.hasRedFlags) {
    bullets.push('No pathway exclusion criteria identified.');
    bullets.push('No red-flag referral criteria triggered.');
  }
  return bullets.join('\n');
}

function pickFields(
  ...sources: Array<Record<string, string> | undefined>
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const src of sources) {
    if (!src) continue;
    for (const [k, v] of Object.entries(src)) {
      if (typeof v === 'string' && v.trim() && !out[k]) out[k] = v;
    }
  }
  return out;
}

/** Migrate legacy camelCase document keys → canonical snake_case. */
export function canonicalizeDocuments(raw?: DocumentContents | null): DocumentContents {
  if (!raw) return {};
  return {
    consultation_note: upgradeDapNoteFields(
      pickFields(raw.consultation_note, raw.dapNote),
    ),
    prescription: raw.prescription,
    prescriber_communication: upgradePcpCommunicationFields(
      pickFields(raw.prescriber_communication, raw.physicianLetter),
    ),
    patient_care_summary: upgradePatientHandoutFields(
      pickFields(raw.patient_care_summary, raw.patientHandout),
    ),
  };
}

/** Prefer pharmacist/AI text when present; fill missing keys from deterministic generator. */
function mergeDocFields(
  existing?: Record<string, string>,
  generated?: Record<string, string>,
): Record<string, string> {
  const base = { ...(generated ?? {}) };
  if (!existing) return base;
  for (const [key, value] of Object.entries(existing)) {
    if (typeof value === 'string' && value.trim()) {
      base[key] = value;
    }
  }
  return base;
}

/** Drop Notion canvas HTML so the next open rebuilds from regenerated fields. */
export function clearDocumentHtml(
  pkg: DocumentationPackage,
  typeIds?: DocumentTypeId[],
): DocumentationPackage {
  const docs = { ...(pkg.documents ?? {}) };
  const ids =
    typeIds ??
    (Object.keys(docs) as Array<keyof NonNullable<DocumentationPackage['documents']>>);
  for (const id of ids) {
    const current = docs[id as DocumentTypeId];
    if (!current || typeof current !== 'object') continue;
    if (id === 'prescription') {
      const rx = { ...current } as Record<string, unknown>;
      delete rx.documentHtml;
      docs.prescription = rx as typeof docs.prescription;
      continue;
    }
    const fields = { ...(current as Record<string, string>) };
    delete fields.documentHtml;
    docs[id as 'consultation_note'] = fields;
  }
  return { ...pkg, documents: docs };
}

function legacyToDocuments(doc: DocumentationPackage, pathwayLabel?: string): DocumentContents {
  const impression = clinicalImpression(pathwayLabel, doc.primaryDiagnosis);

  return {
    consultation_note: upgradeDapNoteFields({
      assessment: impression,
      plan: [doc.prescriptionDetails, doc.managementPlan, doc.followUpPlan]
        .filter((p) => p?.trim())
        .join('\n\n'),
      data: [doc.presentingComplaint, doc.relevantHistory, doc.consultationSummary]
        .filter((p) => p?.trim())
        .join('\n\n'),
    }),
    prescriber_communication: upgradePcpCommunicationFields({
      assessment: impression,
      treatment: doc.prescriptionDetails ?? '',
      followUp: doc.followUpPlan ?? '',
    }),
    patient_care_summary: upgradePatientHandoutFields({
      diagnosis: pathwayLabel || doc.primaryDiagnosis || '',
      treatment: doc.prescriptionDetails || doc.managementPlan || '',
      selfCare: doc.patientCounselling ?? '',
      followUp: doc.followUpPlan ?? '',
    }),
  };
}

function hasCanonicalDocuments(doc: DocumentationPackage): boolean {
  const d = doc.documents;
  if (!d) return false;
  return Boolean(
    d.consultation_note ||
      d.prescription ||
      d.prescriber_communication ||
      d.patient_care_summary ||
      d.dapNote ||
      d.physicianLetter ||
      d.patientHandout,
  );
}

function mergePrescription(
  existing?: DocumentContents['prescription'],
  generated?: DocumentContents['prescription'],
): DocumentContents['prescription'] {
  if (!existing && !generated) return undefined;
  if (!existing) return generated;
  if (!generated) return existing;
  const rxTitles = (generated.medications ?? []).map((m) =>
    formatPrescriptionRxTitle(m),
  );
  const upgradeLegacy =
    prescriptionMedicationsLookLegacy(existing.medications) ||
    !existing.medicationBlock?.trim();
  return {
    diagnosis: existing.diagnosis?.trim() || generated.diagnosis,
    specialInstructions:
      existing.specialInstructions?.trim() || generated.specialInstructions,
    notes: existing.notes?.trim() || generated.notes,
    // Patient identity always comes from the Patient Information form
    patientBlock: generated.patientBlock?.trim() || existing.patientBlock,
    medicationBlock: upgradeLegacy
      ? generated.medicationBlock || existing.medicationBlock
      : upsertPrescriptionRxTitlesPlain(
          existing.medicationBlock?.trim() || generated.medicationBlock || '',
          rxTitles,
        ),
    sigBlock: upgradeLegacy
      ? generated.sigBlock || existing.sigBlock
      : existing.sigBlock?.trim() || generated.sigBlock,
    medications: upgradeLegacy
      ? generated.medications?.length
        ? generated.medications
        : existing.medications
      : existing.medications?.length
        ? existing.medications.map((med, i) => {
            const next = generated.medications?.[i];
            if (med.strength?.trim() || !next?.strength?.trim()) return med;
            return { ...med, strength: next.strength };
          })
        : generated.medications,
  };
}

/**
 * Overlay patient-identity fields from deterministic generators onto an
 * existing package. Preserves pharmacist/AI clinical body content.
 */
export function refreshPatientDependentDocuments(
  pkg: DocumentationPackage,
  consultation: Consultation,
  patientInfo: PatientDocumentInfo,
): DocumentationPackage {
  const finalized = finalizePatientDocumentInfo(patientInfo);
  const generated = generateAllDocumentFields(consultation, finalized);
  const docs: DocumentContents = { ...(pkg.documents ?? {}) };

  if (docs.prescriber_communication || generated.prescriber_communication) {
    const next = { ...(docs.prescriber_communication ?? {}) };
    const pharmacistEdited = Boolean(next.documentHtml?.trim());
    if (!pharmacistEdited) {
      for (const key of PATIENT_DEPENDENT_PCP_KEYS) {
        const value = generated.prescriber_communication?.[key];
        if (typeof value === 'string') next[key] = value;
      }
    } else if (generated.prescriber_communication?.headerBlock) {
      next.headerBlock = generated.prescriber_communication.headerBlock;
      if (next.documentHtml) {
        next.documentHtml = patchHtmlDataField(
          next.documentHtml,
          'headerBlock',
          generated.prescriber_communication.headerBlock,
        );
      }
    }
    const signature = generated.prescriber_communication?.signatureBlock;
    if (typeof signature === 'string' && signature.trim()) {
      next.signatureBlock = signature;
      if (next.documentHtml) {
        next.documentHtml = ensurePcpHtmlSignature(next.documentHtml, signature);
      }
    }
    docs.prescriber_communication = next;
  }

  if (docs.prescription || generated.prescription) {
    const existingRx = docs.prescription ?? {};
    const generatedRx = generated.prescription ?? {};
    const reviewed =
      pkg.documentReviews?.prescription?.status === 'REVIEWED';
    const looksLegacyMeds = prescriptionMedicationsLookLegacy(existingRx.medications);
    const nextPatientBlock =
      generatedRx.patientBlock?.trim() || existingRx.patientBlock;
    const upgradeMeds =
      !reviewed && looksLegacyMeds && Boolean(generatedRx.medications?.length);

    const next = {
      ...existingRx,
      // Identity always follows Patient Information.
      patientBlock: nextPatientBlock,
      diagnosis: existingRx.diagnosis?.trim() || generatedRx.diagnosis,
      notes: existingRx.notes?.trim() || generatedRx.notes,
      specialInstructions:
        existingRx.specialInstructions?.trim() || generatedRx.specialInstructions,
      medicationBlock: upgradeMeds
        ? generatedRx.medicationBlock || existingRx.medicationBlock
        : existingRx.medicationBlock?.trim() || generatedRx.medicationBlock,
      sigBlock: upgradeMeds
        ? generatedRx.sigBlock || existingRx.sigBlock
        : existingRx.sigBlock?.trim() || generatedRx.sigBlock,
      medications: upgradeMeds
        ? generatedRx.medications
        : existingRx.medications?.length
          ? existingRx.medications.map((med, i) => {
              const fresh = generatedRx.medications?.[i];
              if (!fresh) return med;
              return {
                ...med,
                strength: med.strength?.trim() || fresh.strength,
                quantity:
                  med.quantity?.trim() &&
                  med.quantity.trim().toLowerCase() !== 'as directed'
                    ? med.quantity
                    : fresh.quantity || med.quantity,
                dosage:
                  /^\d+(\.\d+)?$/.test(String(med.dosage ?? '').trim()) && fresh.dosage
                    ? fresh.dosage
                    : med.dosage,
              };
            })
          : generatedRx.medications,
    } as DocumentContents['prescription'] & { documentHtml?: string };

    if (upgradeMeds) {
      // Force TipTap to rebuild from upgraded fields on next open.
      delete next.documentHtml;
    } else if (next.documentHtml && nextPatientBlock) {
      next.documentHtml = upsertPrescriptionPatientHtml(
        String(next.documentHtml),
        nextPatientBlock,
      );
    }
    const titles = (next.medications ?? generatedRx.medications ?? []).map((m) =>
      formatPrescriptionRxTitle(m),
    );
    if (next.documentHtml && titles.length) {
      next.documentHtml = upsertPrescriptionRxTitlesHtml(
        String(next.documentHtml),
        titles,
      );
    }
    docs.prescription = next;
  }

  if (docs.patient_care_summary || generated.patient_care_summary) {
    const next = { ...(docs.patient_care_summary ?? {}) };
    const generatedHandout = generated.patient_care_summary ?? {};
    const pharmacistEdited = Boolean(next.documentHtml?.trim());
    if (!pharmacistEdited) {
      for (const key of TREATMENT_DEPENDENT_HANDOUT_KEYS) {
        const value = generatedHandout[key];
        if (typeof value === 'string') next[key] = value;
      }
    }
    for (const key of COUNSELLING_HANDOUT_KEYS) {
      if (!String(next[key] ?? '').trim() && String(generatedHandout[key] ?? '').trim()) {
        next[key] = generatedHandout[key];
      }
    }
    if (typeof generatedHandout.questionsContact === 'string' && generatedHandout.questionsContact.trim()) {
      next.questionsContact = generatedHandout.questionsContact;
    }
    if (next.documentHtml?.trim()) {
      next.documentHtml = ensureHandoutHtmlHasPharmacyContact(
        ensureHandoutHtmlHasCounsellingCards(next.documentHtml, next),
        next.questionsContact ?? '',
        next.handoutLanguage,
      );
    }
    docs.patient_care_summary = next;
  }

  if (docs.prescriber_communication && generated.prescriber_communication) {
    const next = { ...(docs.prescriber_communication ?? {}) };
    const pharmacistEdited = Boolean(next.documentHtml?.trim());
    if (!pharmacistEdited) {
      const treatment = generated.prescriber_communication.treatment;
      const assessment = generated.prescriber_communication.assessment;
      const followUp = generated.prescriber_communication.followUp;
      const opening = generated.prescriber_communication.openingSentence;
      if (typeof treatment === 'string') next.treatment = treatment;
      if (typeof assessment === 'string') next.assessment = assessment;
      if (typeof followUp === 'string') next.followUp = followUp;
      if (typeof opening === 'string') next.openingSentence = opening;
    }
    if (typeof generated.prescriber_communication.followUp === 'string') {
      next.followUp = generated.prescriber_communication.followUp;
    }
    if (typeof generated.prescriber_communication.treatment === 'string') {
      next.treatment = generated.prescriber_communication.treatment;
    }
    docs.prescriber_communication = next;
  }

  return {
    ...pkg,
    version: 3,
    patientInfo: finalized,
    patientSourceFingerprint: patientInfoFingerprint(finalized),
    documents: docs,
  };
}

export function normalizeDocumentation(
  raw: DocumentationPackage | Record<string, string> | undefined,
  consultation: Consultation,
  patientInfo?: PatientDocumentInfo,
): DocumentationPackage {
  const doc = (raw ?? {}) as DocumentationPackage;
  const resolvedPatient = patientInfo ?? doc.patientInfo;

  if (hasCanonicalDocuments(doc) || doc.version === 2 || doc.version === 3) {
    const documents = canonicalizeDocuments(doc.documents);
    const existingLang = documents.patient_care_summary?.handoutLanguage;
    const generated = generateAllDocumentFields(consultation, resolvedPatient, {
      handoutLanguage: existingLang,
    });
    const merged: DocumentationPackage = {
      ...doc,
      version: 3,
      revision: doc.revision ?? 1,
      patientInfo: resolvedPatient,
      documents: {
        consultation_note: applyDapAttestationToFields(
          applyPathwayOrPickerReferences(
            mergeDapNoteFields(
              documents.consultation_note,
              generated.consultation_note ?? {},
            ),
            consultation,
            doc.clinicalReferences ??
              clinicalReferencesFromDocumentation(consultation.documentation),
          ),
          consultation,
        ),
        prescription: mergePrescription(
          documents.prescription,
          generated.prescription,
        ),
        prescriber_communication: mergePcpCommunicationFields(
          documents.prescriber_communication,
          generated.prescriber_communication ?? {},
        ),
        patient_care_summary: mergePatientHandoutFields(
          documents.patient_care_summary,
          generated.patient_care_summary ?? {},
        ),
      },
    };
    return refreshPatientDependentDocuments(
      merged,
      consultation,
      resolvedPatient ?? {},
    );
  }

  const fallback = buildFromConsultation(consultation, resolvedPatient);
  if (Object.keys(doc).length > 0) {
    const pathwayLabel = consultation.pathway?.condition ?? consultation.pathway?.name;
    const legacy: DocumentationPackage = {
      version: 3,
      revision: 1,
      generatedAt: new Date().toISOString(),
      patientInfo: resolvedPatient,
      documents: legacyToDocuments(doc, pathwayLabel),
      disclaimer: doc.disclaimer,
      revisions: [
        {
          revision: 1,
          generatedAt: new Date().toISOString(),
          source: 'fallback',
        },
      ],
    };
    return refreshPatientDependentDocuments(
      legacy,
      consultation,
      resolvedPatient ?? {},
    );
  }

  return refreshPatientDependentDocuments(
    fallback,
    consultation,
    resolvedPatient ?? {},
  );
}

export function buildFromConsultation(
  consultation: Consultation,
  patientInfo?: PatientDocumentInfo,
): DocumentationPackage {
  // Spec-aligned deterministic generators (consultation note, PCP communication, handout)
  const documents = generateAllDocumentFields(consultation, patientInfo);
  const generatedAt = new Date().toISOString();
  const finalized = patientInfo
    ? finalizePatientDocumentInfo(patientInfo)
    : patientInfo;
  return {
    version: 3,
    revision: 1,
    generatedAt,
    patientInfo: finalized,
    patientSourceFingerprint: finalized
      ? patientInfoFingerprint(finalized)
      : undefined,
    documents,
    clinicalReferences:
      clinicalReferencesFromDocumentation(consultation.documentation) ??
      undefined,
    disclaimer:
      'Generated from confirmed consultation data. Must be reviewed and approved by a licensed pharmacist before use.',
    revisions: [{ revision: 1, generatedAt, source: 'fallback' }],
  };
}

export function bumpDocumentationRevision(
  pkg: DocumentationPackage,
  source: DocumentationRevision['source'],
): DocumentationPackage {
  const revision = (pkg.revision ?? 1) + 1;
  const generatedAt = new Date().toISOString();
  const entry: DocumentationRevision = { revision, generatedAt, source };
  return {
    ...pkg,
    version: 3,
    revision,
    generatedAt: source === 'manual_edit' ? pkg.generatedAt : generatedAt,
    lastEditedAt: generatedAt,
    revisions: [...(pkg.revisions ?? []), entry].slice(-20),
  };
}

function formatDemographics(consultation: Consultation): string {
  const d = consultation.demographics;
  if (!d) return '';
  return Object.entries(d)
    .filter(([, v]) => v && typeof v !== 'object')
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');
}

function formatPositiveFindings(consultation: Consultation): string {
  const responses = consultation.questionResponses;
  if (!responses) return '';
  const lines: string[] = [];
  for (const r of Object.values(responses)) {
    const v = responseValue(r).toLowerCase();
    if (v === 'yes' || v === 'present' || v === 'true') {
      if (r.question) lines.push(`• ${r.question}`);
    }
  }
  return lines.slice(0, 8).join('\n');
}

/** Format red-flag screening + clinical judgment overrides for documents / audit */
function formatSafetyReview(consultation: Consultation): string {
  const rf = consultation.redFlags;
  if (!rf?.acknowledgments?.length) {
    if (rf && !rf.hasRedFlags) return 'Clinical safety review: no referral criteria triggered.';
    return '';
  }

  const lines: string[] = ['Clinical Safety Review'];
  for (const ack of rf.acknowledgments) {
    const answer = ack.answer ?? (ack.action === 'clear' || ack.action === 'ignore' ? 'no' : 'yes');
    lines.push(`• ${toClinicalScreeningPhrase(ack.flag) ?? 'Safety criterion'} — ${answer.toUpperCase()}`);
    if (ack.action === 'refer') {
      lines.push('  Decision: Refer patient for medical assessment');
    }
    if (ack.action === 'override' && ack.override) {
      lines.push('  Decision: Clinical judgment override');
      lines.push(`  Reason: ${ack.override.reason}`);
      if (ack.override.comments) lines.push(`  Comments: ${ack.override.comments}`);
      if (ack.override.acknowledgedResponsibility) {
        lines.push('  Responsibility acknowledged by pharmacist');
      }
    }
  }
  if (rf.referralSelected) {
    lines.push('Outcome: Referral selected — pathway not continued.');
  } else if (rf.acknowledgments.some((a) => a.action === 'override')) {
    lines.push(
      'Outcome: Proceeded with clinical judgment. Overrides documented for audit trail.',
    );
  }

  const outcome = consultation.referralOutcome;
  if (outcome?.documentationText) {
    lines.push('', 'Referral outcome', outcome.documentationText);
  }

  return lines.join('\n');
}

export function mergePatientInfo(
  pkg: DocumentationPackage,
  patientInfo: PatientDocumentInfo,
): DocumentationPackage {
  const finalized = finalizePatientDocumentInfo(patientInfo);
  return {
    ...pkg,
    patientInfo: finalized,
    patientSourceFingerprint: patientInfoFingerprint(finalized),
  };
}

function applyPathwayOrPickerReferences(
  fields: Record<string, string>,
  consultation: Consultation,
  picker: ReturnType<typeof clinicalReferencesFromDocumentation>,
): Record<string, string> {
  const pathwayChrome = formatPrescribeDocumentChrome(consultation);
  if (pathwayChrome) return applyDapClinicalReferencesSentence(fields, pathwayChrome);
  return applyClinicalReferencesToDapFields(fields, picker);
}
