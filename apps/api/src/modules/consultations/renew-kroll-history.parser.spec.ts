import {
  applyKrollDispenseQuantities,
  formatKrollHistoryForAi,
  parseKrollDate,
  parseKrollHistoryText,
  splitKrollDispAndRemaining,
} from './renew-kroll-history.parser';
import type { RenewMedication } from '@safescript/shared';

const KROLL_PDF_TEXT = `
Patient Medical History Report
Chappelle Pharmacy, 3134  141 Street SW, Edmonton AB  T6W 4B5
Orig RxRxDisp. QtyRem. QtyDrug NameDINDoctorFirst FillFill Date
Sig CodeStatus
1564817158428930310TAB Auro-Finasteride 5mg02405814Dr. Cote, Jodi03-Jun-202626-Aug-2026
Finasteride
TAKE 1 TABLET ORALLY ONCE DAILY
1564818158428830310TAB Auro-Tamsulosin CR 0.4mg02545179Dr. Cote, Jodi03-Jun-202626-Aug-2026
Tamsulosin Hydrochloride
TAKE 1 CAPSULE ORALLY ONCE DAILY
1564819158428730310TAB Sandoz-Amlodipine 5mg02284383Dr. Cote, Jodi03-Jun-202626-Aug-2026
Amlodipine Besylate
TAKE 1 TABLET DAILY
1564820158428630310TAB Apo-Pravastatin 40mg02243508Dr. Cote, Jodi03-Jun-202626-Aug-2026
Pravastatin Sodium
TAKE 1 TABLET DAILY
1564821158428530310TAB Pms-Perindopril 8mg02470691Dr. Cote, Jodi03-Jun-202626-Aug-2026
Perindopril Erbumine
TAKE 1 TABLET DAILY
1564822158428330310TAB Mar-Ezetimibe 10mg02422662Dr. Cote, Jodi03-Jun-202626-Aug-2026
Ezetimibe
TAKE 1 TABLET DAILY
1564824158428230310CAP Apo-Lansoprazole 30mg02293838Dr. Cote, Jodi03-Jun-202626-Aug-2026
Lansoprazole
TAKE 1 CAPSULE ORALLY ONCE DAILY
Page 1
`;

function med(patch: Partial<RenewMedication> & { id: string }): RenewMedication {
  return {
    id: patch.id,
    source: patch.source ?? { type: 'pharmacy_document' },
    raw: patch.raw ?? { medicationText: 'Auro-Finasteride 5mg' },
    normalized: {
      brandName: null,
      genericName: null,
      strength: null,
      dosageForm: null,
      quantity: null,
      quantityUnit: null,
      ...patch.normalized,
    },
    confidence: patch.confidence ?? {},
    reviewStatus: patch.reviewStatus ?? 'not_reviewed',
    ccddMatchStatus: patch.ccddMatchStatus ?? 'unmatched',
    pharmacistEdited: patch.pharmacistEdited ?? false,
  };
}

describe('Kroll medical history quantity parser', () => {
  it('splits concatenated Disp. Qty + Rem. Qty using pack sizes', () => {
    expect(splitKrollDispAndRemaining('30310')).toEqual({ disp: 30, rem: 310 });
    expect(splitKrollDispAndRemaining('60100')).toEqual({ disp: 60, rem: 100 });
    expect(splitKrollDispAndRemaining('90310')).toEqual({ disp: 90, rem: 310 });
    expect(splitKrollDispAndRemaining('100310')).toEqual({ disp: 100, rem: 310 });
  });

  it('parses concatenated Kroll history rows from pdf-parse output', () => {
    const lines = parseKrollHistoryText(KROLL_PDF_TEXT);
    expect(lines).toHaveLength(7);
    expect(lines.map((row) => row.dispenseQty)).toEqual([30, 30, 30, 30, 30, 30, 30]);
    expect(lines[0]).toMatchObject({
      brandName: 'Auro-Finasteride 5mg',
      genericName: 'Finasteride',
      din: '02405814',
      quantityUnit: 'tablets',
      remainingQty: 310,
      prescriberName: 'Dr. Cote, Jodi',
      lastFillDate: '2026-08-26',
      directionsRaw: 'TAKE 1 TABLET ORALLY ONCE DAILY',
    });
    expect(lines[6]).toMatchObject({
      brandName: 'Apo-Lansoprazole 30mg',
      formCode: 'CAP',
      quantityUnit: 'capsules',
      din: '02293838',
    });
  });

  it('parses spaced Kroll columns as well', () => {
    const text = `Patient Medical History Report
1564817 1584289 30 310 TAB Auro-Finasteride 5mg 02405814 Dr. Cote, Jodi 03-Jun-2026 26-Aug-2026
Finasteride
TAKE 1 TABLET ORALLY ONCE DAILY`;
    const lines = parseKrollHistoryText(text);
    expect(lines).toHaveLength(1);
    expect(lines[0]?.dispenseQty).toBe(30);
  });

  it('fills missing AI quantity from Disp. Qty, not Rem. Qty', () => {
    const lines = parseKrollHistoryText(KROLL_PDF_TEXT);
    const filled = applyKrollDispenseQuantities(
      [
        med({
          id: 'a',
          normalized: { din: '02405814', brandName: 'Auro-Finasteride', quantity: null },
        }),
      ],
      lines,
    );
    expect(filled[0]?.normalized.quantity).toBe(30);
    expect(filled[0]?.normalized.quantityUnit).toBe('tablets');
    expect(filled[0]?.raw.quantityText).toBe('30');
  });

  it('overwrites an AI quantity that used remaining qty', () => {
    const lines = parseKrollHistoryText(KROLL_PDF_TEXT);
    const filled = applyKrollDispenseQuantities(
      [
        med({
          id: 'a',
          normalized: { din: '02405814', quantity: 310, quantityUnit: 'tablets' },
        }),
      ],
      lines,
    );
    expect(filled[0]?.normalized.quantity).toBe(30);
  });

  it('formats Disp. Qty lines for the model', () => {
    const text = formatKrollHistoryForAi(parseKrollHistoryText(KROLL_PDF_TEXT));
    expect(text).toContain('Disp. Qty 30');
    expect(text).toContain('Never use Orig Rx, Rx, or Rem. Qty as quantity');
  });

  it('parses dates', () => {
    expect(parseKrollDate('26-Aug-2026')).toBe('2026-08-26');
    expect(parseKrollDate('03-Jun-2026')).toBe('2026-06-03');
  });
});
