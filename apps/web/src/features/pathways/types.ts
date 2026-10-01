export type PathwayStatus =
  | 'DRAFT'
  | 'AI_PROCESSING'
  | 'AI_GENERATED'
  | 'UNPUBLISHED'
  | 'PUBLISHED'
  | 'ARCHIVED';

export type PathwayPipelineStage =
  | 'IDLE'
  | 'CLASSIFYING'
  | 'DOCUMENT_REVIEW'
  | 'EXTRACTING_CONCEPTS'
  | 'CONCEPTS_READY'
  | 'GENERATING'
  | 'CLINICAL_REVIEW'
  | 'COMPLETE';

export type DocumentRole = 'PRIMARY' | 'SUPPORTING' | 'REFERENCE_ONLY';

export type ClinicalDocumentType =
  | 'CLINICAL_GUIDELINE'
  | 'NATIONAL_GUIDELINE'
  | 'PROVINCIAL_GUIDELINE'
  | 'CLINICAL_ALGORITHM'
  | 'ASSESSMENT_FORM'
  | 'DRUG_MONOGRAPH'
  | 'REVIEW_ARTICLE'
  | 'PATIENT_HANDOUT'
  | 'LOCAL_POLICY'
  | 'EDUCATIONAL_MATERIAL'
  | 'RESEARCH_ARTICLE'
  | 'OTHER';

export type ClinicalConceptCategory =
  | 'DIAGNOSIS'
  | 'HISTORY'
  | 'SYMPTOM'
  | 'RED_FLAG'
  | 'DIFFERENTIAL'
  | 'TREATMENT'
  | 'ELIGIBILITY'
  | 'COUNSELLING'
  | 'FOLLOW_UP'
  | 'LAB'
  | 'PHYSICAL_EXAM'
  | 'OTHER';

export type QuestionType =
  | 'TEXT'
  | 'TEXTAREA'
  | 'YES_NO'
  | 'DATE'
  | 'NUMBER'
  | 'SELECT'
  | 'MULTI_SELECT'
  | 'SCALE';

export type QuestionStatus = 'AI_GENERATED' | 'NEEDS_REVIEW' | 'APPROVED' | 'REJECTED';

export type RuleSeverity = 'INFO' | 'WARNING' | 'CRITICAL' | 'STOP';

export type RuleAction =
  | 'URGENT_REFERRAL'
  | 'STOP_PRESCRIBING'
  | 'SHOW_WARNING'
  | 'REQUIRE_DOCUMENTATION'
  | 'ADJUST_DOSE'
  | 'CONTRAINDICATED';

export type RequirementLevel = 'NEVER' | 'OPTIONAL' | 'REQUIRED';

export type TreatmentCategory = 'PRESCRIPTION' | 'OTC' | 'SUPPLEMENT' | 'NON_DRUG';
export type RecommendationLevel =
  | 'FIRST_LINE'
  | 'SECOND_LINE'
  | 'ALTERNATIVE'
  | 'ADJUNCTIVE'
  | 'SUPPORTIVE_CARE'
  | 'SPECIALIST';

export type RedFlagActionType =
  | 'IMMEDIATE_REFERRAL'
  | 'SAME_DAY_PHYSICIAN'
  | 'EMERGENCY'
  | 'PATHWAY_EXCLUDED'
  | 'PHARMACIST_DISCRETION';

export interface AssessmentSectionsEnabled {
  diagnosisConfirmation: boolean;
  additionalAssessment: boolean;
  treatmentEligibility: boolean;
}

import type { SectionVisibility } from '@safescript/shared';

export interface ClinicalSection {
  id: string;
  name: string;
  displayName: string;
  description: string | null;
  displayOrder: number;
  isAiGenerated: boolean;
  visibility?: SectionVisibility | null;
}

export interface ClinicalQuestion {
  id: string;
  pathwayId: string;
  sectionId: string | null;
  section: ClinicalSection | null;
  question: string;
  /** Why it matters */
  description: string | null;
  /** Pharmacist tip */
  helpText: string | null;
  type: QuestionType;
  required: boolean;
  displayOrder: number;
  options: { label: string; value: string }[] | null;
  sourcePage: number | null;
  sourceReference: string | null;
  confidence: number | null;
  status: QuestionStatus;
  createdBy: 'AI' | 'USER';
  approved: boolean;
  approvedAt: string | null;
  rules: ClinicalRule[];
  evidenceRefIds?: string[];
  visibilityRule?: {
    sourceField?: string;
    operator?: string;
    value?: unknown;
    label?: string;
  } | null;
  createdAt: string;
  updatedAt: string;
}

export type RedFlagSeverity = 'WARNING' | 'CRITICAL' | 'EMERGENCY';

export interface RedFlag {
  id: string;
  title: string;
  /** Legacy body text; prefer `question` for the pharmacist-facing Yes/No prompt. */
  description: string | null;
  /** Pharmacist-facing Yes/No screening question. */
  question?: string | null;
  /** Clinical rationale shown in Why? */
  whyItMatters?: string | null;
  /** Short instruction shown with the recommended action. */
  actionNote?: string | null;
  severity: RedFlagSeverity;
  /** Structured action code or legacy free-text */
  action: string | null;
  required?: boolean;
  approved?: boolean;
  source?: 'AI' | 'USER';
  evidenceRefIds?: string[];
}

export type DifferentialLikelihood = 'COMMON' | 'LESS_COMMON' | 'RARE';

export interface DifferentialDiagnosis {
  id: string;
  condition: string;
  question: string | null;
  whyItMatters: string | null;
  suggestedPathway: string | null;
  distinguishingFeatures: string | null;
  keySymptoms: string | null;
  recommendedAction: string | null;
  likelihood: DifferentialLikelihood | null;
  required?: boolean;
  approved?: boolean;
  source?: 'AI' | 'USER';
  evidenceRefIds?: string[];
}

export interface ClinicalRule {
  id: string;
  pathwayId: string;
  questionId: string | null;
  condition: string;
  operator: string;
  value: string;
  action: RuleAction;
  severity: RuleSeverity;
  message: string;
  details: string | null;
  isAiGenerated: boolean;
  approved: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ClinicalTreatment {
  id: string;
  pathwayId: string;
  category: TreatmentCategory;
  recommendationLevel: RecommendationLevel;
  medicationName: string;
  genericName: string | null;
  brandName: string | null;
  strength: string | null;
  dose: string | null;
  route: string | null;
  frequency: string | null;
  duration: string | null;
  quantity: string | null;
  directions: string | null;
  maxDose: string | null;
  eligibility: string | null;
  clinicalIndication: string | null;
  clinicalNotes: string | null;
  guidelineReference: string | null;
  evidenceStrength: string | null;
  renalAdjustment: string | null;
  hepaticAdjustment: string | null;
  pregnancyNotes: string | null;
  breastfeedingNotes: string | null;
  pregnancyReason: string | null;
  renalAdjustmentReason: string | null;
  renalDosingBasis?: string | null;
  renalDosingRules?: unknown;
  hepaticAdjustmentReason: string | null;
  monitoringReason: string | null;
  counsellingNotes: string | null;
  followUpAdvice: string | null;
  ageRestriction: string | null;
  provinceAvailability: string | null;
  warnings: string[];
  interactions: string[];
  monitoring: string | null;
  isAiGenerated: boolean;
  approved: boolean;
  isActive: boolean;
  archivedAt: string | null;
  metadata?: Record<string, unknown> | null;
  displayOrder: number;
  createdAt: string;
  treatmentLibraryItemId?: string | null;
  treatmentLibraryVersionId?: string | null;
  sourceVersionNumber?: number | null;
  sourcePayloadHash?: string | null;
  sourceSnapshot?: Record<string, unknown> | null;
  pathwayOverrides?: Record<string, unknown> | null;
  libraryLinkStatus?: 'LINKED' | 'DETACHED' | 'MANUAL' | null;
  evidenceRefIds?: string[];
  /** Treatment-level override for consultation documentation citation. */
  documentationReferenceId?: string | null;
  treatmentLibraryItem?: {
    id: string;
    displayName: string;
    approvedVersionNumber: number | null;
    currentApprovedVersionId: string | null;
    isRetired: boolean;
    matchStatus?: string;
    productFormDisplay?: string | null;
    routeDisplay?: string | null;
    regimenLabel?: string | null;
  } | null;
}

export interface ClinicalCounselling {
  id: string;
  pathwayId: string;
  category: string;
  point: string;
  detail: string | null;
  outputSection?: string | null;
  guidanceType?: string | null;
  priority?: string | null;
  descriptor?: string | null;
  archivedAt?: string | null;
  itemVersion?: number;
  legacySource?: string | null;
  legacyId?: string | null;
  isAiGenerated: boolean;
  approved: boolean;
  displayOrder: number;
  createdAt: string;
  evidenceRefIds?: string[];
}

export interface ClinicalFollowup {
  id: string;
  pathwayId: string;
  timeframe: string;
  condition: string;
  action: string;
  urgency: 'ROUTINE' | 'URGENT' | 'EMERGENCY';
  isAiGenerated: boolean;
  approved: boolean;
  displayOrder: number;
  createdAt: string;
}

export interface ClinicalDocument {
  id: string;
  fileName: string;
  fileUrl: string;
  fileSize: number;
  mimeType: string;
  processingStatus: string;
  processingError: string | null;
  pageCount: number | null;
  uploadedAt: string;
  processedAt: string | null;
  documentType?: ClinicalDocumentType | null;
  aiSuggestedRole?: DocumentRole | null;
  role?: DocumentRole | null;
  roleConfirmed?: boolean;
  authority?: string | null;
  publicationYear?: number | null;
  evidenceLevel?: string | null;
  documentFamily?: string | null;
  purpose?: string[];
  classificationConfidence?: number | null;
  classificationMeta?: { rationale?: string; condition?: string } | null;
}

export interface ClinicalDocumentOverlap {
  id: string;
  sourceDocumentId: string;
  targetDocumentId: string;
  overlapPercent: number;
  recommendedRole: DocumentRole;
  rationale: string;
  sourceDocument?: { id: string; fileName: string };
  targetDocument?: { id: string; fileName: string };
}

export interface ClinicalConceptSource {
  id: string;
  documentId: string;
  sourceExcerpt: string | null;
  sourcePage: number | null;
  document?: { id: string; fileName: string; role?: DocumentRole | null };
}

export interface ClinicalConcept {
  id: string;
  category: ClinicalConceptCategory;
  label: string;
  description: string | null;
  metadata: Record<string, unknown> | null;
  importance: string | null;
  confidence: number | null;
  aliases: string[];
  isAiGenerated: boolean;
  approved: boolean;
  displayOrder: number;
  sources: ClinicalConceptSource[];
}

export interface PathwayEvidenceLibraryReference {
  id: string;
  pathwayId?: string;
  citationTitle: string;
  organization: string | null;
  edition: string | null;
  publicationYear: number | null;
  url: string | null;
  doi?: string | null;
  documentType: string | null;
  jurisdiction: string | null;
  referenceType: string;
  status?: string;
  verifiedBy?: string | null;
  verificationDate?: string | null;
  importSource?: string | null;
  libraryItemId?: string | null;
  clinicalUseTags?: string[];
  suggestedSections?: string[];
  documentationCandidate?: boolean;
  verificationRequired?: boolean;
  notes?: string | null;
  pathwayIds?: string[];
  createdAt?: string;
  updatedAt?: string;
}

/** Alias used by References & Governance admin UI. */
export type PathwayEvidenceReference = PathwayEvidenceLibraryReference;

export interface PathwayEvidenceMapping {
  id: string;
  pathwayId: string;
  referenceId: string;
  section: string;
  mappingType: string;
  targetId?: string | null;
  suggested?: boolean;
  createdById?: string | null;
  createdAt?: string;
}

export interface PathwayReviewer {
  id: string;
  pathwayId: string;
  libraryReviewerId?: string | null;
  reviewerType: 'internal' | 'external' | string;
  name: string;
  credentials: string;
  organization?: string | null;
  role: string;
  reviewedAreas: string[];
  reviewDate: string;
  notes?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface PathwayGovernance {
  internalReviewStatus: 'not_started' | 'pending' | 'completed' | string;
  externalPeerReviewStatus: 'not_started' | 'pending' | 'completed' | string;
  lastReviewedAt?: string | null;
  nextReviewDueAt?: string | null;
  primaryDocumentationReferenceId?: string | null;
  secondaryDocumentationReferenceId?: string | null;
}

export interface PresentationReviewState {
  sectionEvidenceRefIds: string[];
  duplicateReviewNeeded?: boolean;
}

export interface ClinicalVersion {
  id: string;
  version: number;
  publishedAt: string;
  notes: string | null;
}

export interface ClinicalPathway {
  id: string;
  name: string;
  condition: string;
  province: string;
  category: string;
  status: PathwayStatus;
  pipelineStage: PathwayPipelineStage;
  version: number;
  description: string | null;
  notes: string | null;
  aiSummary: string | null;
  redFlags: RedFlag[] | null;
  differentials: DifferentialDiagnosis[] | null;
  clinicallyReviewedAt: string | null;
  clinicallyReviewedById: string | null;
  // Overview metadata
  provinceAvailability: string | null;
  ageMin: number | null;
  ageMax: number | null;
  pharmacistPrescribingEligible: boolean;
  requiresPhysicalExam: RequirementLevel;
  requiresLabResults: RequirementLevel;
  requiresFollowUp: boolean;
  guidelineSource: string | null;
  lastClinicalReview: string | null;
  assessmentSectionsEnabled: AssessmentSectionsEnabled | null;
  presentationReview?: PresentationReviewState | null;
  libraryReferences?: PathwayEvidenceReference[];
  evidenceMappings?: PathwayEvidenceMapping[];
  reviewers?: PathwayReviewer[];
  governance?: PathwayGovernance | null;
  primaryDocumentationReferenceId?: string | null;
  secondaryDocumentationReferenceId?: string | null;
  // Pathway Matching / Routing
  routingAliases?: string[];
  routingPresentingComplaints?: string[];
  routingContextTerms?: string[];
  routingDescription?: string | null;
  routingMetadataUpdatedAt?: string | null;
  rejectionReason: string | null;
  publishedAt: string | null;
  suspendedAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  documents: ClinicalDocument[];
  documentOverlaps?: ClinicalDocumentOverlap[];
  concepts?: ClinicalConcept[];
  sections: ClinicalSection[];
  questions: ClinicalQuestion[];
  rules: ClinicalRule[];
  treatments: ClinicalTreatment[];
  counsellings: ClinicalCounselling[];
  followups: ClinicalFollowup[];
  versions: ClinicalVersion[];
  _count: {
    questions: number;
    rules: number;
    treatments: number;
    counsellings: number;
    concepts?: number;
  };
}

export interface PathwayListItem {
  id: string;
  name: string;
  condition: string;
  province: string;
  category: string;
  status: PathwayStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
  createdBy: { firstName: string; lastName: string; email: string };
  documents: Pick<ClinicalDocument, 'id' | 'fileName' | 'processingStatus'>[];
  _count: { questions: number; rules: number; treatments: number };
}

export interface PaginatedPathways {
  items: PathwayListItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface PathwayStats {
  total: number;
  byStatus: Record<string, number>;
}
