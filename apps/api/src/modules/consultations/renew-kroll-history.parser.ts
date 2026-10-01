import {
  deriveReviewStatus,
  normalizeMedicationKey,
  type RenewMedication,
} from '@safescript/shared';

/**
 * Kroll Patient Medical History PDFs often concatenate table columns with no
 * spaces, e.g. `1564817158428930310TAB Auro-Finasteride 5mg02405814Dr. Cote…`
 * (Orig Rx + Rx + Disp. Qty + Rem. Qty + form + name + DIN + doctor + dates).
 * The LLM then treats quantity as ambiguous and returns null. Parse Disp. Qty
 * deterministically instead.
 */

export interface KrollHistoryLine {
  origRx: string;
  fillRx: string;
  dispenseQty: number;
  remainingQty: number;
  formCode: string;
  quantityUnit: string;
  dosageForm: string;
  brandName: string;
  genericName: string | null;
  strength: string | null;
  din: string | null;
  prescriberName: string | null;
  firstFillDate: string | null;
  lastFillDate: string | null;
  directionsRaw: string | null;
}

const FORM_CODES = [
  'PATCH',
  'CREAM',
  'OINT',
  'SUSP',
  'SOLN',
  'INH',
  'SUPP',
  'LOZ',
  'SPRAY',
  'DROP',
  'VIAL',
  'SYR',
  'KIT',
  'WAF',
  'PCK',
  'PKG',
  'TAB',
  'CAP',
  'ML',
  'GM',
  'G',
] as const;

const FORM_GROUP = FORM_CODES.join('|');
const DATE_TOKEN = '(\\d{2}-[A-Za-z]{3}-\\d{4})';
const AFTER_FORM = new RegExp(
  `^(.+?)\\s*(\\d{8})\\s*(Dr\\..+?)\\s*${DATE_TOKEN}\\s*${DATE_TOKEN}\\s*$`,
  'i',
);
const SPACED_ROW = new RegExp(
  `^(\\d{6,8})\\s+(\\d{6,8})\\s+(\\d+(?:\\.\\d+)?)\\s+(\\d+(?:\\.\\d+)?)\\s+(${FORM_GROUP})\\s+(.+)$`,
  'i',
);
const STRENGTH_IN_NAME = /(\d+(?:\.\d+)?\s*(?:mcg|mg|g|iu|ml|%))\s*$/i;
const SIG_LINE =
  /^(TAKE|SIG|APPLY|INHALE|USE|INSERT|INSTILL|CHEW|DISSOLVE|INJECT|SWALLOW|GARGLE|RINSE|SPRAY|PLACE|GIVE)\b/i;

const MONTHS: Record<string, string> = {
  jan: '01',
  feb: '02',
  mar: '03',
  apr: '04',
  may: '05',
  jun: '06',
  jul: '07',
  aug: '08',
  sep: '09',
  oct: '10',
  nov: '11',
  dec: '12',
};

/** Common Canadian community-pharmacy pack sizes, longest first. */
const PACK_SIZES = [360, 200, 180, 120, 100, 90, 60, 31, 30, 28, 21, 15, 14, 10, 7, 5, 4, 3, 2, 1];

const FORM_UNITS: Record<string, { unit: string; dosageForm: string }> = {
  TAB: { unit: 'tablets', dosageForm: 'tablet' },
  CAP: { unit: 'capsules', dosageForm: 'capsule' },
  ML: { unit: 'mL', dosageForm: 'solution' },
  G: { unit: 'g', dosageForm: 'grams' },
  GM: { unit: 'g', dosageForm: 'grams' },
  PATCH: { unit: 'patches', dosageForm: 'patch' },
  CREAM: { unit: 'g', dosageForm: 'cream' },
  OINT: { unit: 'g', dosageForm: 'ointment' },
  SUSP: { unit: 'mL', dosageForm: 'suspension' },
  SOLN: { unit: 'mL', dosageForm: 'solution' },
  INH: { unit: 'inhalations', dosageForm: 'inhaler' },
  SUPP: { unit: 'suppositories', dosageForm: 'suppository' },
  PCK: { unit: 'packs', dosageForm: 'pack' },
  PKG: { unit: 'packs', dosageForm: 'pack' },
};

export function parseKrollDate(value: string): string | null {
  const match = value.trim().match(/^(\d{2})-([A-Za-z]{3})-(\d{4})$/);
  if (!match) return null;
  const month = MONTHS[match[2].toLowerCase()];
  if (!month) return null;
  return `${match[3]}-${month}-${match[1]}`;
}

export function splitKrollDispAndRemaining(blob: string): { disp: number; rem: number } | null {
  if (!/^\d+$/.test(blob) || blob.length < 2) return null;
  for (const pack of PACK_SIZES) {
    const prefix = String(pack);
    if (!blob.startsWith(prefix) || blob.length <= prefix.length) continue;
    const rem = Number(blob.slice(prefix.length));
    if (!Number.isFinite(rem)) continue;
    return { disp: pack, rem };
  }
  if (blob.length >= 4) {
    const disp = Number(blob.slice(0, blob.length - 3));
    const rem = Number(blob.slice(-3));
    if (Number.isFinite(disp) && Number.isFinite(rem) && disp > 0) return { disp, rem };
  }
  const disp = Number(blob);
  return Number.isFinite(disp) ? { disp, rem: 0 } : null;
}

function formMeta(code: string) {
  return FORM_UNITS[code.toUpperCase()] ?? {
    unit: code.toLowerCase(),
    dosageForm: code.toLowerCase(),
  };
}

function finishDrugLine(parts: {
  origRx: string;
  fillRx: string;
  disp: number;
  rem: number;
  form: string;
  rest: string;
}): Omit<KrollHistoryLine, 'genericName' | 'directionsRaw'> | null {
  const fields = parts.rest.trim().match(AFTER_FORM);
  if (!fields) return null;
  const brandName = fields[1].trim();
  const meta = formMeta(parts.form);
  return {
    origRx: parts.origRx,
    fillRx: parts.fillRx,
    dispenseQty: parts.disp,
    remainingQty: parts.rem,
    formCode: parts.form.toUpperCase(),
    quantityUnit: meta.unit,
    dosageForm: meta.dosageForm,
    brandName,
    strength: brandName.match(STRENGTH_IN_NAME)?.[1]?.replace(/\s+/g, ' ') ?? null,
    din: fields[2],
    prescriberName: fields[3].trim() || null,
    firstFillDate: parseKrollDate(fields[4]),
    lastFillDate: parseKrollDate(fields[5]),
  };
}

function parseGluedDrugLine(line: string) {
  for (const len of [7, 8, 6]) {
    const match = line.match(new RegExp(`^(\\d{${len}})(\\d{${len}})(\\d+)(${FORM_GROUP})\\s+(.+)$`, 'i'));
    if (!match) continue;
    const qty = splitKrollDispAndRemaining(match[3]);
    if (!qty) continue;
    return finishDrugLine({
      origRx: match[1],
      fillRx: match[2],
      disp: qty.disp,
      rem: qty.rem,
      form: match[4],
      rest: match[5],
    });
  }
  return null;
}

function parseDrugLine(line: string): Omit<KrollHistoryLine, 'genericName' | 'directionsRaw'> | null {
  const compact = line.replace(/\s+/g, ' ').trim();
  const spaced = compact.match(SPACED_ROW);
  if (spaced) {
    return finishDrugLine({
      origRx: spaced[1],
      fillRx: spaced[2],
      disp: Number(spaced[3]),
      rem: Number(spaced[4]),
      form: spaced[5],
      rest: spaced[6],
    });
  }
  return parseGluedDrugLine(compact);
}

function isJunkLine(line: string) {
  return /^(page\s+\d+|this message is intended|confidential|orig rx|sig code|report parameters|patients?\s+-|fill date\s+-|allergies\s+-|conditions\s+-|patient medical history)/i.test(
    line,
  );
}

export function parseKrollHistoryText(text: string): KrollHistoryLine[] {
  if (!/patient medical history report/i.test(text) && !/disp\.?\s*qty/i.test(text)) {
    return [];
  }

  const lines = text
    .split(/\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const out: KrollHistoryLine[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const parsed = parseDrugLine(lines[i]);
    if (!parsed) continue;

    let genericName: string | null = null;
    let directionsRaw: string | null = null;
    const next = lines[i + 1];
    const after = lines[i + 2];
    if (next && !parseDrugLine(next) && !isJunkLine(next) && !SIG_LINE.test(next)) {
      genericName = next;
      if (after && SIG_LINE.test(after)) directionsRaw = after;
    } else if (next && SIG_LINE.test(next)) {
      directionsRaw = next;
    }

    out.push({ ...parsed, genericName, directionsRaw });
  }

  return out;
}

export function formatKrollHistoryForAi(lines: KrollHistoryLine[]): string {
  if (!lines.length) return '';
  const rows = lines.map((line) => {
    const bits = [
      line.brandName,
      line.genericName ? `generic ${line.genericName}` : null,
      line.din ? `DIN ${line.din}` : null,
      `Disp. Qty ${line.dispenseQty}`,
      `Rem. Qty ${line.remainingQty}`,
      `form ${line.formCode}`,
      line.prescriberName,
      line.lastFillDate ? `fill ${line.lastFillDate}` : null,
      line.directionsRaw,
    ].filter(Boolean);
    return `- ${bits.join(' | ')}`;
  });
  return [
    'Structured Kroll Patient Medical History lines (authoritative for quantity):',
    'quantity MUST be Disp. Qty. Never use Orig Rx, Rx, or Rem. Qty as quantity.',
    ...rows,
  ].join('\n');
}

function dinDigits(value?: string | null) {
  const digits = (value ?? '').replace(/\D/g, '');
  return digits.length >= 6 ? digits : '';
}

function namesMatch(med: RenewMedication, line: KrollHistoryLine) {
  const medKey = normalizeMedicationKey(
    med.normalized.brandName || med.normalized.genericName || med.raw.medicationText || '',
  );
  const lineKey = normalizeMedicationKey(line.brandName);
  const genericKey = normalizeMedicationKey(line.genericName ?? '');
  if (!medKey) return false;
  const compact = (value: string) => value.replace(/\s+/g, '');
  const medCompact = compact(medKey);
  if (lineKey && (medKey.includes(lineKey) || lineKey.includes(medKey) || medCompact.includes(compact(lineKey)))) {
    return true;
  }
  if (
    genericKey &&
    (medKey.includes(genericKey) || genericKey.includes(medKey) || medCompact.includes(compact(genericKey)))
  ) {
    return true;
  }
  return false;
}

function overlayKrollLine(med: RenewMedication, line: KrollHistoryLine): RenewMedication {
  const next: RenewMedication = {
    ...med,
    source: {
      ...med.source,
      sourceSystem: med.source.sourceSystem ?? 'kroll',
      documentType: med.source.documentType ?? 'medication_history',
    },
    raw: {
      ...med.raw,
      quantityText: String(line.dispenseQty),
      prescriberText: med.raw.prescriberText ?? line.prescriberName,
      dateText: med.raw.dateText ?? line.lastFillDate,
    },
    normalized: {
      ...med.normalized,
      quantity: line.dispenseQty,
      quantityUnit: med.normalized.quantityUnit || line.quantityUnit,
      din: med.normalized.din || line.din,
      brandName: med.normalized.brandName || line.brandName,
      genericName: med.normalized.genericName || line.genericName,
      strength: med.normalized.strength || line.strength,
      dosageForm: med.normalized.dosageForm || line.dosageForm,
      prescriberName: med.normalized.prescriberName || line.prescriberName,
      prescribedDate: med.normalized.prescribedDate || line.firstFillDate,
      lastFillDate: med.normalized.lastFillDate || line.lastFillDate,
      directions: med.normalized.directions || line.directionsRaw,
      refillsRemaining: med.normalized.refillsRemaining ?? line.remainingQty,
    },
    confidence: {
      ...med.confidence,
      quantity: Math.max(med.confidence.quantity ?? 0, 0.96),
    },
    reviewStatus: med.reviewStatus,
    ccddMatchStatus: med.ccddMatchStatus,
    ccddCandidates: med.ccddCandidates,
    pharmacistEdited: med.pharmacistEdited,
  };
  next.reviewStatus = deriveReviewStatus(next);
  return next;
}

export function applyKrollDispenseQuantities(
  medications: RenewMedication[],
  lines: KrollHistoryLine[],
): RenewMedication[] {
  if (!lines.length) return medications;
  const used = new Set<number>();

  const matchIndex = (med: RenewMedication) => {
    const medDin = dinDigits(med.normalized.din);
    if (medDin) {
      const byDin = lines.findIndex((line, idx) => !used.has(idx) && dinDigits(line.din) === medDin);
      if (byDin >= 0) return byDin;
    }
    return lines.findIndex((line, idx) => !used.has(idx) && namesMatch(med, line));
  };

  const next = medications.map((med) => {
    const idx = matchIndex(med);
    if (idx < 0) return med;
    used.add(idx);
    return overlayKrollLine(med, lines[idx]);
  });

  if (used.size < lines.length && used.size < medications.length) {
    const leftoverMeds = next
      .map((med, idx) => ({ med, idx }))
      .filter(({ med }) => med.normalized.quantity == null);
    const leftoverLines = lines.map((line, idx) => ({ line, idx })).filter(({ idx }) => !used.has(idx));
    leftoverMeds.forEach((row, i) => {
      const pair = leftoverLines[i];
      if (!pair) return;
      used.add(pair.idx);
      next[row.idx] = overlayKrollLine(row.med, pair.line);
    });
  }

  return next;
}

export function krollLinesToMedications(
  lines: KrollHistoryLine[],
  newId: () => string,
): RenewMedication[] {
  return lines.map((line) => {
    const med: RenewMedication = {
      id: newId(),
      source: {
        type: 'pharmacy_document',
        sourceSystem: 'kroll',
        documentType: 'medication_history',
      },
      raw: {
        medicationText: line.brandName,
        directionsText: line.directionsRaw,
        quantityText: String(line.dispenseQty),
        prescriberText: line.prescriberName,
        dateText: line.lastFillDate,
      },
      normalized: {
        din: line.din,
        brandName: line.brandName,
        genericName: line.genericName,
        strength: line.strength,
        dosageForm: line.dosageForm,
        directions: line.directionsRaw,
        quantity: line.dispenseQty,
        quantityUnit: line.quantityUnit,
        prescriberName: line.prescriberName,
        prescribedDate: line.firstFillDate,
        lastFillDate: line.lastFillDate,
        refillsRemaining: line.remainingQty,
      },
      confidence: {
        medication: 0.92,
        strength: line.strength ? 0.9 : null,
        directions: line.directionsRaw ? 0.9 : null,
        quantity: 0.96,
        prescriber: line.prescriberName ? 0.9 : null,
        dates: line.lastFillDate ? 0.9 : null,
      },
      reviewStatus: 'not_reviewed',
      ccddMatchStatus: 'unmatched',
      ccddCandidates: [],
      pharmacistEdited: false,
    };
    med.reviewStatus = deriveReviewStatus(med);
    return med;
  });
}
