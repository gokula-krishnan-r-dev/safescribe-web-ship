export const CLINICAL_REFERENCE_IDS = [
  'cps',
  'rxfiles',
  'bugs_and_drugs',
  'medsask',
  'health_canada',
  'provincial_guideline',
  'specialty_guideline',
  'other',
] as const;

export type ClinicalReferenceId = (typeof CLINICAL_REFERENCE_IDS)[number];

export const CLINICAL_REFERENCE_OPTIONS: ReadonlyArray<{
  id: ClinicalReferenceId;
  label: string;
  requiresDetail: boolean;
}> = [
  { id: 'cps', label: 'CPS / eCPS', requiresDetail: false },
  { id: 'rxfiles', label: 'RxFiles', requiresDetail: false },
  { id: 'bugs_and_drugs', label: 'Bugs & Drugs', requiresDetail: false },
  { id: 'medsask', label: 'medSask', requiresDetail: false },
  { id: 'health_canada', label: 'Health Canada product monograph', requiresDetail: false },
  { id: 'provincial_guideline', label: 'Provincial clinical guideline', requiresDetail: true },
  { id: 'specialty_guideline', label: 'Specialty organization guideline', requiresDetail: true },
  { id: 'other', label: 'Other', requiresDetail: true },
];

export const CLINICAL_REFERENCE_UI = {
  label: 'Clinical resources consulted',
  required: 'Required',
  helper:
    'Select any resources that informed this assessment or prescribing decision.',
  tooltip:
    'By selecting a resource, you confirm that it informed this assessment or prescribing decision.',
  placeholder: 'Select resources',
  validation:
    'Select at least one clinical resource before finalizing the consultation note.',
  gate: 'Select clinical resources consulted to continue to documents.',
  gateHelper: 'Continue stays disabled until at least one resource is selected.',
  customDetailLabel: 'Resource name',
  customDetailPlaceholder: 'Enter the resource or organization',
} as const;

export interface ClinicalReferenceSelection {
  referenceId: ClinicalReferenceId;
  displayLabel: string;
  customDetail?: string;
  selectedAt: string;
  selectedByUserId: string;
}

export interface ConsultationClinicalReferences {
  selections: ClinicalReferenceSelection[];
  consultedOn: string;
}

const OPTION_BY_ID = new Map(CLINICAL_REFERENCE_OPTIONS.map((o) => [o.id, o]));

export function isClinicalReferenceId(value: unknown): value is ClinicalReferenceId {
  return (
    typeof value === 'string' &&
    (CLINICAL_REFERENCE_IDS as readonly string[]).includes(value)
  );
}

export function clinicalReferenceRequiresDetail(id: ClinicalReferenceId): boolean {
  return OPTION_BY_ID.get(id)?.requiresDetail === true;
}

export function clinicalReferenceLabel(id: ClinicalReferenceId): string {
  return OPTION_BY_ID.get(id)?.label ?? id;
}

export function formatClinicalReferenceLabel(ref: {
  referenceId?: string;
  displayLabel?: string;
  customDetail?: string;
}): string {
  const option = isClinicalReferenceId(ref.referenceId)
    ? OPTION_BY_ID.get(ref.referenceId)
    : undefined;
  const label = option?.label || ref.displayLabel?.trim() || '';
  const detail = ref.customDetail?.trim();
  if (!label) return detail ?? '';
  return detail ? `${label} (${detail})` : label;
}

export function isValidClinicalReferenceSelection(ref: {
  referenceId?: string;
  customDetail?: string;
}): boolean {
  if (!isClinicalReferenceId(ref.referenceId)) return false;
  if (!clinicalReferenceRequiresDetail(ref.referenceId)) return true;
  return Boolean(ref.customDetail?.trim());
}

export function validClinicalReferenceSelections(
  refs: ClinicalReferenceSelection[] | null | undefined,
): ClinicalReferenceSelection[] {
  const seen = new Set<string>();
  const out: ClinicalReferenceSelection[] = [];
  for (const ref of refs ?? []) {
    if (!isValidClinicalReferenceSelection(ref)) continue;
    const label = formatClinicalReferenceLabel(ref);
    if (!label || seen.has(label)) continue;
    seen.add(label);
    out.push(ref);
  }
  return out;
}

export function hasValidClinicalReferences(
  refs: ConsultationClinicalReferences | null | undefined,
): boolean {
  return validClinicalReferenceSelections(refs?.selections).length > 0;
}

/**
 * Keep pharmacist resource selections across overlapping documentation
 * writes. An empty payload (generate completing from a stale snapshot) must
 * not wipe a selection the pharmacist already made.
 */
export function preferClinicalReferences(
  preferred?: ConsultationClinicalReferences | null,
  fallback?: ConsultationClinicalReferences | null,
): ConsultationClinicalReferences | undefined {
  if ((preferred?.selections?.length ?? 0) > 0) return preferred!;
  if ((fallback?.selections?.length ?? 0) > 0) return fallback!;
  return preferred ?? fallback ?? undefined;
}

/** English three-letter month, e.g. 16-Aug-2026. */
export function formatClinicalReferenceConsultedDate(consultedOn: string): string {
  const iso = consultedOn.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return iso;
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  const month = months[Number(match[2]) - 1];
  if (!month) return iso;
  return `${match[3]}-${month}-${match[1]}`;
}

export function formatClinicalReferences(
  refs: ClinicalReferenceSelection[] | null | undefined,
  consultedOn: string,
): string | null {
  const labels = [
    ...new Set(
      validClinicalReferenceSelections(refs).map((ref) => formatClinicalReferenceLabel(ref)),
    ),
  ];
  if (labels.length === 0) return null;

  let list: string;
  if (labels.length === 1) {
    list = labels[0];
  } else if (labels.length === 2) {
    list = `${labels[0]} and ${labels[1]}`;
  } else {
    list = `${labels.slice(0, -1).join(', ')}, and ${labels[labels.length - 1]}`;
  }

  const formattedDate = formatClinicalReferenceConsultedDate(consultedOn);
  const heading =
    labels.length === 1 ? 'Clinical resource consulted' : 'Clinical resources consulted';
  return `${heading}: ${list} (${formattedDate}).`;
}

const CONSULTED_DATE = '\\d{1,2}-[A-Za-z]{3}-\\d{4}';
const REFERENCES_SENTENCE_RE = new RegExp(
  `Clinical resources? consulted:[\\s\\S]*?(?:Consulted ${CONSULTED_DATE}|\\(${CONSULTED_DATE}\\))\\.\\s*`,
  'gi',
);

export function stripClinicalReferencesProse(text: string): string {
  REFERENCES_SENTENCE_RE.lastIndex = 0;
  return text.replace(REFERENCES_SENTENCE_RE, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function consultationDateYmd(input: Date | string | null | undefined): string {
  const date = input instanceof Date ? input : input ? new Date(input) : new Date();
  if (Number.isNaN(date.getTime())) {
    const now = new Date();
    return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
  }
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function parseConsultationClinicalReferences(
  raw: unknown,
): ConsultationClinicalReferences | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as { selections?: unknown; consultedOn?: unknown };
  if (!Array.isArray(value.selections)) return null;
  const selections: ClinicalReferenceSelection[] = [];
  for (const item of value.selections) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    if (!isClinicalReferenceId(row.referenceId)) continue;
    selections.push({
      referenceId: row.referenceId,
      displayLabel:
        typeof row.displayLabel === 'string' && row.displayLabel.trim()
          ? row.displayLabel
          : clinicalReferenceLabel(row.referenceId),
      customDetail:
        typeof row.customDetail === 'string' ? row.customDetail : undefined,
      selectedAt: typeof row.selectedAt === 'string' ? row.selectedAt : new Date().toISOString(),
      selectedByUserId:
        typeof row.selectedByUserId === 'string' ? row.selectedByUserId : '',
    });
  }
  const consultedOn =
    typeof value.consultedOn === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value.consultedOn)
      ? value.consultedOn.slice(0, 10)
      : '';
  return { selections, consultedOn };
}
