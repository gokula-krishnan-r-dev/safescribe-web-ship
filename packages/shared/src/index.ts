import type { ProfessionalAcknowledgementStatus } from './professional-acknowledgement';
import type { SuperAdminScope } from './super-admin-scope';

export const ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  PHARMACIST_ADMIN: 'PHARMACIST_ADMIN',
  PHARMACIST: 'PHARMACIST',
} as const;

export type RoleName = (typeof ROLES)[keyof typeof ROLES];

export const USER_STATUS = {
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
  PENDING: 'PENDING',
} as const;

export type UserStatus = (typeof USER_STATUS)[keyof typeof USER_STATUS];

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: RoleName;
  tenantId: string | null;
  permissions: string[];
  professionalAcknowledgement?: ProfessionalAcknowledgementStatus;
  /** SUPER_ADMIN platform function. Null/undefined for tenant-scoped users. */
  superAdminScope?: SuperAdminScope | null;
  /** True when credentials are owned by Phix — change password in Phix. */
  phixLinked?: boolean;
  /** True when this pharmacist has uploaded a signature for Step 6 documents. */
  hasSignature?: boolean;
}

export * from './section-visibility';
export * from './medication-safety.types';
export * from './patient-vitals';
export * from './patient-age';
export * from './patient-information';
export * from './optional-dob';
export * from './openai-models';
export * from './intake-fingerprint';
export * from './treatment-plan-confirm';
export * from './counselling-payload';
export * from './pcp-communication';
export * from './patient-care-summary';
export * from './handout-languages';
export * from './handout-translation';
export * from './counselling-compose';
export * from './stt-providers';
export * from './whisper-languages';
export * from './clinical-yes-no';
export * from './referral-pathway.types';
export * from './referral-reason-draft';
export * from './referral-handling';
export * from './referral-letter';
export * from './referral-letter-document';
export * from './clinical-judgment';
export * from './cj-red-flag.types';
export * from './documentation-encounter';
export * from './dap-payload-clinical';
export * from './dap-payload';
export * from './clinical-note-prose';
export * from './active-consultation.types';
export * from './auth-login.types';
export * from './login-ui';
export * from './login-email-2fa';
export * from './demo-login-bypass';
export * from './contact.types';
export * from './access-request.types';
export * from './entitlements';
export * from './usage-period';
export * from './professional-acknowledgement';
export * from './clinical-references';
export * from './safety-alert-ui';
export * from './safety-presentation';
export * from './treatment-safety-sanitize';
export * from './super-admin-scope';
export * from './treatment-duplicate';
export * from './patient-guidance';
export * from './pathway-clinical-judgement';
export * from './pathway-routing';
export * from './treatment-library';
export * from './reference-library';
export * from './renew';
export * from './renew-effectiveness';
export * from './medication-product-prefixes';
export * from './medication-product-resolver';
export * from './renew-therapy';
export * from './medication-indication-resolver';
export * from './renew-monitoring';
export * from './renew-patient-info';
export * from './renew-monitoring-presentation';
export * from './renew-monitoring-units';
export * from './renew-renal-coverage';
export { CLINICAL_REFERENCE_MASTER } from './clinical-reference-master.data';
export * from './clinical-reference-resolver';
export * from './renew-workflow';
export * from './renew-class-aliases';
export * from './renew-decision';
export * from './renew-dap-note';
export * from './renew-communication';
export * from './renew-prescriber-notification';
export * from './renew-patient-handout';
export * from './renew-patient-handout-prompt';
export * from './renew-pharmacist-prescription';
export * from './renew-pharmacist-prescription-prompt';
export * from './renew-documentation-prompts';
export * from './renew-prescribe-documentation';
export * from './renew-duration';
export * from './renew-flag';
export * from './adapt-flag';
export * from './lab-results';
export * from './clinical-extraction';
export * from './clinical-assessment-match';
export * from './presentation-review';
export * from './pathway-evidence-governance';
export * from './clinical-use-tags';
export * from './pathway-document-citations';
export * from './suggested-regimen';
export {
  multiplyStrengthByQuantity,
  decimalMultiply,
  formatDoseNumber,
  formatMassLabel,
  parseProductStrength,
  parseAdministrationQuantity,
} from './administered-dose';
export * from './renal-dosing';
export * from './adjusted-regimen-product';
export * from './adapt';
export * from './adapt-reference-selector';
export * from './adapt-dap-consultation-note-prompt';
export * from './adapt-dap-note';
export * from './adapt-pcp-communication-prompt';
export * from './adapt-pcp-communication';
export * from './adapt-pharmacist-prescription-prompt';
export * from './adapt-pharmacist-prescription';
export * from './adapt-patient-handout-prompt';
export * from './adapt-patient-handout';
export * from './adapt-counselling-prompt';
export * from './adapt-counselling';
export * from './adapt-documentation-prompts';
export * from './clinical-extraction-prompt';


