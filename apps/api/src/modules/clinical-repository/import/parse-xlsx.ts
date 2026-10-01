import { createHash } from 'crypto';
import * as XLSX from 'xlsx';
import {
  XLSX_LIMITS,
  WORKBOOK_REGISTRY,
  buildBusinessKey,
  buildHeaderFingerprint,
  cellToString,
  fingerprintWorkbook,
  normalizeHeader,
  type ClinicalFileTypeKey,
  type ImportIssue,
} from '../contracts/workbook-registry';

export type ParsedWorkbook = {
  fileTypeKey: ClinicalFileTypeKey;
  schemaVersion: string;
  sheetName: string;
  headerFingerprint: string;
  headers: string[];
  rows: Array<{
    sourceRowNumber: number;
    raw: Record<string, unknown>;
    businessKey: string;
  }>;
  sha256: string;
  issues: ImportIssue[];
};

export class WorkbookParserError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly issues: ImportIssue[] = [],
  ) {
    super(message);
    this.name = 'WorkbookParserError';
  }
}

function detectFormulasInSheet(ws: XLSX.WorkSheet): boolean {
  for (const key of Object.keys(ws)) {
    if (key.startsWith('!')) continue;
    const cell = ws[key] as XLSX.CellObject | undefined;
    if (cell && cell.f) return true;
  }
  return false;
}

/**
 * Parse and fingerprint a clinical-repository XLSX buffer.
 * Identifies file type from exact header contract, not filename.
 */
export function parseClinicalWorkbook(
  buffer: Buffer,
  originalFilename: string,
): ParsedWorkbook {
  const issues: ImportIssue[] = [];
  const sha256 = createHash('sha256').update(buffer).digest('hex');
  const ext = originalFilename.split('.').pop()?.toLowerCase() ?? '';

  if (ext !== 'xlsx') {
    throw new WorkbookParserError(
      'Only .xlsx files are accepted for clinical repository imports.',
      'INVALID_EXTENSION',
    );
  }

  if (buffer.byteLength > XLSX_LIMITS.maxBytes) {
    throw new WorkbookParserError(
      `File exceeds maximum size of ${XLSX_LIMITS.maxBytes} bytes.`,
      'FILE_TOO_LARGE',
    );
  }

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, {
      type: 'buffer',
      cellDates: false,
      cellNF: false,
      cellText: false,
      raw: true,
    });
  } catch (err) {
    throw new WorkbookParserError(
      `Unable to parse XLSX: ${String(err)}`,
      'PARSE_FAILED',
    );
  }

  const visibleSheets = workbook.SheetNames.filter((name) => {
    const sheet = workbook.Sheets[name];
    const hidden = (workbook.Workbook?.Sheets ?? []).find((s) => s.name === name)?.Hidden;
    return sheet && hidden !== 1 && hidden !== 2;
  });

  if (!visibleSheets.length) {
    throw new WorkbookParserError('Workbook has no visible worksheets.', 'SHEET_COUNT');
  }

  const dataSheets = visibleSheets.filter((name) => !/^readme$/i.test(name.trim()));
  const sheetCandidates = dataSheets.length ? dataSheets : visibleSheets;

  let sheetName: string | null = null;
  let fileTypeKey: ClinicalFileTypeKey | null = null;
  let headerRow: unknown[] = [];
  let headers: string[] = [];
  let ws: XLSX.WorkSheet | null = null;

  for (const candidate of sheetCandidates) {
    const candidateSheet = workbook.Sheets[candidate];
    if (!candidateSheet) continue;
    const candidateMatrix = XLSX.utils.sheet_to_json<unknown[]>(candidateSheet, {
      header: 1,
      defval: null,
      raw: false,
      blankrows: false,
    });
    const candidateHeader = (candidateMatrix[0] ?? []) as unknown[];
    const matched = fingerprintWorkbook(candidateHeader);
    if (matched) {
      sheetName = candidate;
      fileTypeKey = matched;
      headerRow = candidateHeader;
      headers = candidateHeader.map((h) => normalizeHeader(h));
      ws = candidateSheet;
      break;
    }
  }

  if (!sheetName || !ws || !fileTypeKey) {
    throw new WorkbookParserError(
      'Workbook headers do not match any registered clinical repository or Renew workflow template. File type is identified by exact header order, not filename.',
      'UNKNOWN_HEADER_FINGERPRINT',
      [
        {
          severity: 'ERROR',
          code: 'UNKNOWN_HEADER_FINGERPRINT',
          row: 1,
          message: `Visible sheets: ${visibleSheets.join(', ')}`,
          suggestedFix:
            'Use the official Safety Alert template, or a Renew workflow workbook (medication indications, monitoring rules, input definitions, or conditional questions).',
        },
      ],
    );
  }

  if (detectFormulasInSheet(ws)) {
    throw new WorkbookParserError(
      'Workbook contains formulas. Import cells must be values only.',
      'FORMULAS_PRESENT',
    );
  }

  const matrix = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    defval: null,
    raw: false,
    blankrows: false,
  });

  if (!matrix.length) {
    throw new WorkbookParserError('Workbook has no rows.', 'EMPTY_WORKBOOK');
  }

  if (headerRow.length > XLSX_LIMITS.maxColumns) {
    throw new WorkbookParserError(
      `Column count ${headerRow.length} exceeds limit ${XLSX_LIMITS.maxColumns}.`,
      'TOO_MANY_COLUMNS',
    );
  }

  const blankHeaders = headers.filter((h) => !h).length;
  if (blankHeaders) {
    throw new WorkbookParserError('Blank header cells are not allowed.', 'BLANK_HEADER');
  }
  const headerSet = new Set(headers);
  if (headerSet.size !== headers.length) {
    throw new WorkbookParserError('Duplicate headers are not allowed.', 'DUPLICATE_HEADER');
  }

  const def = WORKBOOK_REGISTRY[fileTypeKey];
  const headerFingerprint = buildHeaderFingerprint(headerRow);

  const expected = def.exactHeaders.map((h) => normalizeHeader(h));
  if (
    headers.length !== expected.length ||
    headers.some((h, i) => h !== expected[i])
  ) {
    throw new WorkbookParserError(
      'Header order or names do not exactly match the registered contract.',
      'HEADER_MISMATCH',
    );
  }

  if (matrix.length - 1 > XLSX_LIMITS.maxRows) {
    throw new WorkbookParserError(
      `Row count exceeds maximum of ${XLSX_LIMITS.maxRows}.`,
      'TOO_MANY_ROWS',
    );
  }

  const rows: ParsedWorkbook['rows'] = [];
  const seenKeys = new Set<string>();

  for (let i = 1; i < matrix.length; i++) {
    const rawCells = (matrix[i] ?? []) as unknown[];
    const sourceRowNumber = i + 1;
    const isCompletelyBlank = rawCells.every(
      (c) => c == null || String(c).trim() === '',
    );
    if (isCompletelyBlank) {
      issues.push({
        severity: 'ERROR',
        code: 'BLANK_ROW',
        row: sourceRowNumber,
        message: 'Completely blank rows are not allowed inside the data region.',
      });
      continue;
    }

    const raw: Record<string, unknown> = {};
    for (let c = 0; c < def.exactHeaders.length; c++) {
      const col = def.exactHeaders[c];
      let value = rawCells[c] ?? null;
      if (typeof value === 'string') {
        if (value.length > XLSX_LIMITS.maxCellLength) {
          issues.push({
            severity: 'ERROR',
            code: 'CELL_TOO_LONG',
            row: sourceRowNumber,
            column: col,
            message: `Cell exceeds ${XLSX_LIMITS.maxCellLength} characters.`,
          });
        }
        value = value.trim();
        if (value === '') value = null;
      }
      raw[col] = value;
    }

    const businessKey = buildBusinessKey(raw, def.businessKeyColumns);
    if (businessKey && seenKeys.has(businessKey)) {
      issues.push({
        severity: 'ERROR',
        code: 'DUPLICATE_BUSINESS_KEY',
        row: sourceRowNumber,
        message: `Duplicate business key in upload: ${businessKey}`,
        suggestedFix: 'Remove or correct the duplicate row, then re-upload.',
      });
    } else if (businessKey) {
      seenKeys.add(businessKey);
    }

    rows.push({ sourceRowNumber, raw, businessKey });
  }

  return {
    fileTypeKey,
    schemaVersion: def.schemaVersion,
    sheetName,
    headerFingerprint,
    headers: [...def.exactHeaders],
    rows,
    sha256,
    issues,
  };
}

export function escapeCsvFormula(value: unknown): string {
  const s = cellToString(value) ?? '';
  if (/^[=+\-@]/.test(s)) return `'${s}`;
  return s;
}
