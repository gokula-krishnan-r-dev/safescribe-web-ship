import { createHash } from 'crypto';
import * as XLSX from 'xlsx';
import {
  PATHWAY_QA_LAYERS,
  type PathwayQaCase,
  type PathwayQaCoverageRow,
  type PathwayQaLayer,
  type PathwayQaParsedWorkbook,
  type PathwayQaPatientFixture,
  type PathwayQaPermutationRow,
  type PathwayQaUniqueVariant,
  type PathwayQaVariantKey,
} from './pathway-qa.types';

const MAX_BYTES = 10 * 1024 * 1024;
const HEADER_ALIASES: Record<string, keyof PathwayQaCase | 'ignore'> = {
  'case id': 'caseId',
  'pathway #': 'pathwayNumber',
  pathway: 'pathwayNumber',
  condition: 'condition',
  'validation layer': 'layer',
  layer: 'layer',
  priority: 'priority',
  'scenario / objective': 'scenario',
  scenario: 'scenario',
  'patient & preconditions': 'preconditions',
  preconditions: 'preconditions',
  'test data / three variants': 'variantsRaw',
  'test data': 'variantsRaw',
  variants: 'variantsRaw',
  'execution steps': 'executionSteps',
  'expected rules engine': 'expectedRulesEngine',
  'expected treatment result': 'expectedTreatment',
  'expected flow / ui': 'expectedFlow',
  'negative assertions': 'negativeAssertions',
  'audit / evidence assertions': 'auditAssertions',
  'permutation expansion': 'permutationExpansion',
  'expected disposition': 'expectedDisposition',
  'rule / source basis': 'ruleSourceBasis',
  'automation tags': 'automationTags',
  'execution status': 'ignore',
  'defect id / notes': 'ignore',
};

const LAYER_MAP: Record<string, PathwayQaLayer> = {
  se: PATHWAY_QA_LAYERS.SAFETY_ENGINE,
  'safety engine': PATHWAY_QA_LAYERS.SAFETY_ENGINE,
  safety: PATHWAY_QA_LAYERS.SAFETY_ENGINE,
  tv: PATHWAY_QA_LAYERS.TREATMENT,
  'treatment validation': PATHWAY_QA_LAYERS.TREATMENT,
  treatment: PATHWAY_QA_LAYERS.TREATMENT,
  pf: PATHWAY_QA_LAYERS.PATHWAY_FLOW,
  'pathway & flow validation': PATHWAY_QA_LAYERS.PATHWAY_FLOW,
  'pathway/flow': PATHWAY_QA_LAYERS.PATHWAY_FLOW,
  flow: PATHWAY_QA_LAYERS.PATHWAY_FLOW,
};

const VARIANT_KEYS: PathwayQaVariantKey[] = [
  'DX-DRUG',
  'DRUG-DRUG',
  'NEGATIVE',
  'VALID',
  'INVALID',
  'BOUNDARY',
  'HAPPY',
  'RED FLAG',
  'STATE',
];

export class PathwayQaParseError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'PathwayQaParseError';
  }
}

function cell(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return String(value).trim();
}

function normalizeHeader(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[–—]/g, '-')
    .trim();
}

function sheetToAoa(workbook: XLSX.WorkBook, name: string): unknown[][] {
  const sheet = workbook.Sheets[name];
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false }) as unknown[][];
}

function findHeaderRow(rows: unknown[][], required: string): number {
  for (let i = 0; i < Math.min(rows.length, 12); i++) {
    const hit = (rows[i] ?? []).some((c) => normalizeHeader(cell(c)) === required);
    if (hit) return i;
  }
  return -1;
}

function mapLayer(raw: string, caseId: string): PathwayQaLayer {
  const fromId = caseId.split('-').pop()?.toLowerCase() ?? '';
  if (fromId === 'se') return PATHWAY_QA_LAYERS.SAFETY_ENGINE;
  if (fromId === 'tv') return PATHWAY_QA_LAYERS.TREATMENT;
  if (fromId === 'pf') return PATHWAY_QA_LAYERS.PATHWAY_FLOW;
  const key = normalizeHeader(raw);
  return LAYER_MAP[key] ?? PATHWAY_QA_LAYERS.SAFETY_ENGINE;
}

function parseTags(raw: string): string[] {
  return raw
    .split(/[;,]/)
    .map((t) => t.trim())
    .filter(Boolean);
}

function parseKpis(readme: unknown[][]): { title: string; testClock: string | null; kpis: Record<string, string> } {
  const title = cell(readme[0]?.[0]) || 'SafeScribe pathway QA workbook';
  const subtitle = cell(readme[1]?.[0]);
  const clockMatch = subtitle.match(/Test clock:\s*([^|,]+)/i);
  const kpis: Record<string, string> = {};
  for (const row of readme) {
    const label = cell(row?.[0]);
    const value = cell(row?.[1]);
    if (!label || !value) continue;
    if (['pathways', 'primary cases', 'coverage rows passing', 'permutation rows'].includes(label.toLowerCase())) {
      kpis[label] = value;
    }
  }
  return { title, testClock: clockMatch?.[1]?.trim() ?? null, kpis };
}

function parseCases(rows: unknown[][]): { cases: PathwayQaCase[]; warnings: string[] } {
  const headerIdx = findHeaderRow(rows, 'case id');
  if (headerIdx < 0) {
    throw new PathwayQaParseError(
      'The workbook is missing a Test_Cases sheet with a Case ID header.',
      'MISSING_TEST_CASES',
    );
  }
  const headers = (rows[headerIdx] ?? []).map((h) => normalizeHeader(cell(h)));
  const cases: PathwayQaCase[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const values: Record<string, string> = {};
    headers.forEach((header, idx) => {
      if (!header) return;
      const mapped = HEADER_ALIASES[header];
      if (!mapped || mapped === 'ignore') return;
      values[mapped] = cell(row[idx]);
    });
    const caseId = values.caseId ?? '';
    if (!caseId || caseId.toLowerCase() === 'case id') continue;
    if (seen.has(caseId)) {
      warnings.push(`Duplicate case ID ${caseId} on row ${i + 1} was skipped.`);
      continue;
    }
    seen.add(caseId);
    if (!values.condition || !values.variantsRaw) {
      warnings.push(`Row ${i + 1} (${caseId}) is missing a condition or variant fixture.`);
    }
    cases.push({
      caseId,
      pathwayNumber: values.pathwayNumber ?? '',
      condition: values.condition ?? '',
      layer: mapLayer(values.layer ?? '', caseId),
      priority: values.priority || 'High',
      scenario: values.scenario ?? '',
      preconditions: values.preconditions ?? '',
      variantsRaw: values.variantsRaw ?? '',
      executionSteps: values.executionSteps ?? '',
      expectedRulesEngine: values.expectedRulesEngine ?? '',
      expectedTreatment: values.expectedTreatment ?? '',
      expectedFlow: values.expectedFlow ?? '',
      negativeAssertions: values.negativeAssertions ?? '',
      auditAssertions: values.auditAssertions ?? '',
      permutationExpansion: values.permutationExpansion ?? '',
      expectedDisposition: values.expectedDisposition ?? '',
      ruleSourceBasis: values.ruleSourceBasis ?? '',
      automationTags: parseTags(values.automationTags ?? ''),
      sourceRow: i + 1,
    });
  }

  if (!cases.length) {
    throw new PathwayQaParseError(
      'No executable test cases were found after the Case ID header.',
      'EMPTY_TEST_CASES',
    );
  }
  return { cases, warnings };
}

function parseCoverage(rows: unknown[][]): PathwayQaCoverageRow[] {
  const headerIdx = findHeaderRow(rows, 'condition');
  if (headerIdx < 0) return [];
  const out: PathwayQaCoverageRow[] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const condition = cell(row[1]);
    if (!condition || condition.toLowerCase() === 'condition') continue;
    out.push({
      pathwayNumber: cell(row[0]),
      condition,
      totalCases: Number(cell(row[2]) || 0),
      safety: Number(cell(row[3]) || 0),
      treatment: Number(cell(row[4]) || 0),
      pathwayFlow: Number(cell(row[5]) || 0),
      dxDrug: Number(cell(row[6]) || 0),
      drugDrug: Number(cell(row[7]) || 0),
      coverageStatus: cell(row[8]),
    });
  }
  return out;
}

function parsePermutations(rows: unknown[][]): PathwayQaPermutationRow[] {
  const headerIdx = findHeaderRow(rows, 'permutation id');
  if (headerIdx < 0) return [];
  const out: PathwayQaPermutationRow[] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const permutationId = cell(row[0]);
    if (!permutationId || permutationId.toLowerCase() === 'permutation id') continue;
    out.push({
      permutationId,
      domain: cell(row[1]),
      expectedPattern: cell(row[8]),
      applyTo: cell(row[9]),
    });
  }
  return out;
}

const DRUG_SPLIT = /\s*(?:,|;|\/|\band\b)\s*/i;

function splitDrugList(raw: string): string[] {
  return raw
    .split(DRUG_SPLIT)
    .map((part) =>
      part
        .replace(/\b(candidates?|current|topical|oral|approved|single)\b/gi, '')
        .replace(/\b(plus an?|with no|component)\b/gi, '')
        .replace(/\.$/, '')
        .trim(),
    )
    .map((part) => part.replace(/\s+/g, ' ').trim())
    .filter((part) => part.length >= 3 && !/^(no|and|or|the|with)$/i.test(part));
}

function firstMatch(text: string, patterns: RegExp[]): string | undefined {
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match?.[1]) return match[1].trim();
  }
  return undefined;
}

export function parsePatientFixture(text: string): PathwayQaPatientFixture {
  const source = text.replace(/[–—]/g, '-');
  const lower = source.toLowerCase();
  const notes: string[] = [];

  let pregnancy: PathwayQaPatientFixture['pregnancy'];
  if (/pregnancy\s*=\s*yes|\bpregnant\b/.test(lower) && !/pregnancy\s*=\s*no/.test(lower)) {
    pregnancy = 'yes';
  } else if (/pregnancy\s*=\s*no|\bnot pregnant\b/.test(lower)) {
    pregnancy = 'no';
  } else if (/unknown pregnancy|pregnancy unknown/.test(lower)) {
    pregnancy = 'unknown';
  }

  const clauses = source.split(/[;|]/);
  const candidateBits: string[] = [];
  const currentBits: string[] = [];
  for (const clause of clauses) {
    if (/\bcandidates?\b/i.test(clause)) {
      candidateBits.push(clause.replace(/\bcandidates?\b/gi, ' '));
    } else if (/\bcurrent\b/i.test(clause)) {
      currentBits.push(clause.replace(/\bcurrent\b/gi, ' '));
    }
  }
  const candidates = candidateBits.length
    ? splitDrugList(candidateBits.join(','))
    : firstMatch(source, [/candidates?\s+([^;|\n]+)/i])
      ? splitDrugList(firstMatch(source, [/candidates?\s+([^;|\n]+)/i])!)
      : [];
  const currentMedications = currentBits.length
    ? splitDrugList(currentBits.join(','))
    : [];

  const allergies: string[] = [];
  if (/no allerg/.test(lower)) notes.push('no-allergies');
  const allergyMatch = /allerg(?:y|ies)\s*(?:to|=|:)?\s*([^;|\n]+)/i.exec(source);
  if (allergyMatch && !/no allerg/.test(lower)) {
    allergies.push(...splitDrugList(allergyMatch[1]));
  }

  const conditions: string[] = [];
  if (/peptic.?ulcer|ulcer bleed/.test(lower)) conditions.push('peptic ulcer');
  if (/hypertension/.test(lower)) conditions.push('hypertension');
  if (/hepatic|liver disease/.test(lower)) conditions.push('chronic liver disease');

  let egfr: string | undefined;
  const egfrMatch = /egfr\s*[:=]?\s*(\d+)/i.exec(source);
  if (egfrMatch) egfr = egfrMatch[1];
  else if (/severe renal|renal impairment|reduced renal/.test(lower)) egfr = '18';
  else if (/normal (current )?renal|no renal|renal function recorded|renal data current/.test(lower)) egfr = '92';

  let potassium: string | undefined;
  const kMatch = /potassium\s*[:=]?\s*([\d.]+)/i.exec(source);
  if (kMatch) potassium = kMatch[1];
  else if (/potassium\/renal data current|potassium.*current/.test(lower)) potassium = '4.2';

  if (!candidates.length) notes.push('no-candidates-parsed');
  return {
    pregnancy,
    allergies,
    candidates,
    currentMedications,
    conditions,
    egfr,
    potassium,
    notes,
  };
}

function normalizeVariantKey(raw: string): PathwayQaVariantKey | null {
  const key = raw
    .toUpperCase()
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
  const exact = VARIANT_KEYS.find((item) => item === key);
  if (exact) return exact;
  const byLength = [...VARIANT_KEYS].sort((a, b) => b.length - a.length);
  return byLength.find((item) => key.includes(item)) ?? null;
}

export function expandUniqueVariants(qaCase: PathwayQaCase): PathwayQaUniqueVariant[] {
  const lines = qaCase.variantsRaw
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  const variants: PathwayQaUniqueVariant[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    const match = line.match(/^\s*\d+\.\s*([^|]+)\|\s*(.+)$/);
    const key = match ? normalizeVariantKey(match[1]) : null;
    const fixtureText = match ? match[2].trim() : line;
    if (!key) continue;
    const uniqueKey = `${qaCase.caseId}::${key}`;
    if (seen.has(uniqueKey)) continue;
    seen.add(uniqueKey);
    variants.push({
      uniqueKey,
      caseId: qaCase.caseId,
      condition: qaCase.condition,
      layer: qaCase.layer,
      priority: qaCase.priority,
      variantKey: key,
      fixtureText,
      patient: parsePatientFixture(fixtureText),
      expectedText:
        qaCase.layer === PATHWAY_QA_LAYERS.SAFETY_ENGINE
          ? qaCase.expectedRulesEngine
          : qaCase.layer === PATHWAY_QA_LAYERS.TREATMENT
            ? qaCase.expectedTreatment
            : qaCase.expectedFlow,
      expectedDisposition: qaCase.expectedDisposition,
      negativeAssertions: qaCase.negativeAssertions,
      automationTags: qaCase.automationTags,
      sourceRow: qaCase.sourceRow,
      sourceCase: qaCase,
    });
  }

  return variants;
}

export function parsePathwayQaWorkbook(
  buffer: Buffer,
  originalFilename: string,
): { parsed: PathwayQaParsedWorkbook; sha256: string } {
  const ext = originalFilename.split('.').pop()?.toLowerCase() ?? '';
  if (!['xlsx', 'xls'].includes(ext)) {
    throw new PathwayQaParseError('Upload a .xlsx workbook (the 48-pathway developer test pack).', 'INVALID_EXTENSION');
  }
  if (buffer.byteLength > MAX_BYTES) {
    throw new PathwayQaParseError('The workbook exceeds the 10 MB upload limit.', 'FILE_TOO_LARGE');
  }

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false, cellNF: false, cellText: false });
  } catch {
    throw new PathwayQaParseError('The file could not be read as an Excel workbook.', 'UNREADABLE');
  }

  const testSheet =
    workbook.SheetNames.find((n) => /test[_ ]?cases/i.test(n)) ??
    workbook.SheetNames.find((n) => /cases/i.test(n));
  if (!testSheet) {
    throw new PathwayQaParseError(
      'The workbook must include a Test_Cases sheet with Case ID, Condition, and variant columns.',
      'MISSING_SHEET',
    );
  }

  const { title, testClock, kpis } = parseKpis(sheetToAoa(workbook, 'README'));
  const { cases, warnings } = parseCases(sheetToAoa(workbook, testSheet));
  const coverageSheet = workbook.SheetNames.find((n) => /coverage/i.test(n));
  const permSheet = workbook.SheetNames.find((n) => /permut/i.test(n));

  return {
    sha256: createHash('sha256').update(buffer).digest('hex'),
    parsed: {
      title,
      testClock,
      kpis,
      cases,
      coverage: coverageSheet ? parseCoverage(sheetToAoa(workbook, coverageSheet)) : [],
      permutations: permSheet ? parsePermutations(sheetToAoa(workbook, permSheet)) : [],
      sheetNames: workbook.SheetNames,
      warnings,
    },
  };
}

export function workbookPreview(parsed: PathwayQaParsedWorkbook) {
  const conditions = [...new Set(parsed.cases.map((item) => item.condition))];
  const uniqueCount = parsed.cases.reduce((sum, item) => sum + expandUniqueVariants(item).length, 0);
  return {
    title: parsed.title,
    testClock: parsed.testClock,
    kpis: parsed.kpis,
    sheetNames: parsed.sheetNames,
    caseCount: parsed.cases.length,
    uniqueVariantCount: uniqueCount,
    conditionCount: conditions.length,
    permutationCount: parsed.permutations.length,
    coveragePassCount: parsed.coverage.filter((row) => /pass/i.test(row.coverageStatus)).length,
    conditions,
    warnings: parsed.warnings,
    layers: {
      safety: parsed.cases.filter((item) => item.layer === PATHWAY_QA_LAYERS.SAFETY_ENGINE).length,
      treatment: parsed.cases.filter((item) => item.layer === PATHWAY_QA_LAYERS.TREATMENT).length,
      flow: parsed.cases.filter((item) => item.layer === PATHWAY_QA_LAYERS.PATHWAY_FLOW).length,
    },
  };
}
