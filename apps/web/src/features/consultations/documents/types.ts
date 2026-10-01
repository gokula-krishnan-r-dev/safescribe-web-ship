import type { PdfLayoutConfig } from './pdf-layout-types';
import type { ConsultationClinicalReferences } from '@safescript/shared';

/** Prescribe-module document types */
export type DocumentTypeId =
  | 'consultation_note'
  | 'prescription'
  | 'prescriber_communication'
  | 'patient_care_summary';

/** Generation + clinical review lifecycle (Consultation Documents screen). */
export type DocumentStatus =
  | 'pending'
  | 'preparing'
  | 'ready'
  | 'error'
  | 'GENERATING'
  | 'REVIEW_REQUIRED'
  | 'REVIEWED'
  | 'UPDATED_REVIEW_REQUIRED'
  | 'SOURCE_CHANGED'
  | 'GENERATION_FAILED';

export interface DocumentReviewMeta {
  versionId: string;
  reviewedVersionId?: string;
  reviewedAt?: string;
  status: Extract<
    DocumentStatus,
    | 'REVIEW_REQUIRED'
    | 'REVIEWED'
    | 'UPDATED_REVIEW_REQUIRED'
    | 'SOURCE_CHANGED'
    | 'GENERATION_FAILED'
  >;
}

/** Structured Canadian patient address for prescriptions and document headers. */
export interface PatientAddress {
  street?: string;
  unit?: string;
  city?: string;
  /** Two-letter province / territory code (e.g. AB). */
  province?: string;
  postalCode?: string;
}

export interface PatientDocumentInfo {
  name?: string;
  dateOfBirth?: string;
  patientId?: string;
  /** Structured address from the patient information step. */
  addressLines?: PatientAddress;
  /**
   * Canonical multi-line address string derived from `addressLines`
   * (also accepts legacy free-text address for older packages).
   */
  address?: string;
  phone?: string;
  sex?: string;
  age?: string;
  skipped?: boolean;
  /** True when PHN was confirmed unavailable (referral / PCP identity). */
  phnNotAvailable?: boolean;
}

export interface PrescriptionMedication {
  name: string;
  genericName?: string;
  /** Product strength (e.g. "5 mg") — shown on the Rx headline, not tablet count. */
  strength?: string;
  dosage?: string;
  frequency?: string;
  duration?: string;
  route?: string;
  quantity?: string;
  refills?: string;
  instructions?: string;
  /** Step-1 original prescriber — shown below each Rx only when present. */
  originalPrescriber?: string;
  /** Step-1 original prescription date (paired with originalPrescriber). */
  originalPrescriptionDate?: string;
  drugUse?: string;
  substitutions?: string;
  startDate?: string;
  endDate?: string;
  effectiveDate?: string;
  expiryDate?: string;
  compliancePkg?: string;
  trialDispenses?: string;
}

export interface MedicationInstructionItem {
  name: string;
  howToTake?: string;
  whenToTake?: string;
  sideEffects?: string;
  warnings?: string;
}

/** Canonical document contents for the Prescribe module. */
export interface DocumentContents {
  consultation_note?: Record<string, string>;
  prescription?: {
    diagnosis?: string;
    medications?: PrescriptionMedication[];
    specialInstructions?: string;
    notes?: string;
    patientBlock?: string;
    medicationBlock?: string;
    sigBlock?: string;
  };
  prescriber_communication?: Record<string, string>;
  patient_care_summary?: Record<string, string>;
  /** @deprecated legacy keys — migrated by normalizeDocumentation */
  dapNote?: Record<string, string>;
  physicianLetter?: Record<string, string>;
  patientHandout?: Record<string, string>;
  consultationSummary?: Record<string, string>;
  medicationInstructions?: {
    overview?: string;
    medications?: MedicationInstructionItem[];
    generalAdvice?: string;
  };
  followUpCare?: Record<string, string>;
}

export interface DocumentationRevision {
  revision: number;
  generatedAt: string;
  source: 'ai' | 'fallback' | 'manual_edit' | 'regenerate';
}

export interface DocumentationPackage {
  version?: number;
  /** Monotonic revision; increments on regenerate / deliberate edit save */
  revision?: number;
  generatedAt?: string;
  lastEditedAt?: string;
  revisions?: DocumentationRevision[];
  /** Per-document review attestation tied to versionId */
  documentReviews?: Partial<Record<DocumentTypeId, DocumentReviewMeta>>;
  patientInfo?: PatientDocumentInfo;
  /**
   * Fingerprint of patientInfo used when documents were last generated /
   * patient-dependent fields last refreshed. Used to detect stale docs after
   * the pharmacist edits Patient Information and returns to this step.
   */
  patientSourceFingerprint?: string;
  /** Clinical source hash — skip LLM when this matches stored documentation. */
  sourceHash?: string;
  documents?: DocumentContents;
  disclaimer?: string;
  /** Pharmacist-selected clinical resources for the DAP consultation note. */
  clinicalReferences?: ConsultationClinicalReferences;
  /** Legacy flat clinical notes format */
  presentingComplaint?: string;
  historyOfPresentingComplaint?: string;
  relevantHistory?: string;
  clinicalAssessment?: string;
  primaryDiagnosis?: string;
  managementPlan?: string;
  prescriptionDetails?: string;
  patientCounselling?: string;
  followUpPlan?: string;
  clinicianNotes?: string;
  consultationSummary?: string;
}

export type DocumentAction =
  | 'preview'
  | 'edit'
  | 'reviewEdit'
  | 'download'
  | 'printDownload'
  /** @deprecated — removed from document card actions */
  | 'copy'
  | 'copyKroll'
  | 'copyCommunication'
  | 'print'
  | 'fax';

export interface DocumentMeta {
  id: DocumentTypeId;
  name: string;
  shortName?: string;
  fileName: string;
  order: number;
  category?: 'clinical' | 'communication' | 'patient';
  categoryLabel?: string;
  description?: string;
  bullets?: string[];
  actions?: DocumentAction[];
  /** Live PDF layout from Super Admin Doc Download Format */
  pdfLayout?: PdfLayoutConfig | null;
}

export interface DocumentState {
  id: DocumentTypeId;
  status: DocumentStatus;
  versionId: string;
  reviewedVersionId?: string;
  reviewedAt?: string;
  lastGeneratedAt?: string;
  error?: string;
}

/** True when the current version has been explicitly reviewed. */
export function isDocumentReviewed(state: DocumentState): boolean {
  return (
    state.status === 'REVIEWED' &&
    Boolean(state.reviewedVersionId) &&
    state.reviewedVersionId === state.versionId
  );
}

export function makeDocumentVersionId(
  typeId: DocumentTypeId,
  revision: number,
  stamp?: string,
): string {
  return `${typeId}-r${revision}-${stamp ?? 'v1'}`;
}

export interface PdfContext {
  consultationRef: string;
  consultationDate: string;
  pharmacistName: string;
  pharmacistCredentials?: string;
  pathwayName?: string;
  tenantName?: string;
  pharmacyAddress?: string;
  pharmacyPhone?: string;
  pharmacyEmail?: string;
  pharmacyFax?: string;
  patientInfo: PatientDocumentInfo;
  pharmacistSignatureUrl?: string;
  pharmacyLogoUrl?: string;
  pharmacistSignature?: import('./pdf-branding').PdfBrandingImage;
  pharmacyLogo?: import('./pdf-branding').PdfBrandingImage;
}
