import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseRenewPayload } from './renew';
import {
  emptyMonitoringResult,
  evaluateMonitoringGate,
  formatMonitoringDate,
  formatMonitoringResult,
  composeUnavailableNote,
  parseUnavailableNote,
  matchExtractionToCode,
  requirementFingerprint,
  hydrateMonitoringResultDraft,
  validateMonitoringResultDraft,
  buildMonitoringResultSaveBody,
  monitoringResultEditorKind,
  unitsForMonitoringItem,
  resolveMonitoringItem,
  monitoringResultPlaceholders,
  type MonitoringResultEditorItem,
} from './renew-monitoring';

describe('renew monitoring helpers', () => {
  it('parses monitoring payload and formats BP and dates', () => {
    const parsed = parseRenewPayload({
      version: 1,
      monitoringSafety: {
        results: [
          {
            inputCode: 'BP',
            status: 'AVAILABLE',
            value: { numericValue: 132, secondaryNumericValue: 78, valueText: '132 / 78', unit: 'mmHg' },
            observedDate: '2026-08-23',
            pharmacistConfirmed: true,
          },
        ],
        completed: false,
      },
    });
    assert.equal(parsed.monitoringSafety.results.length, 1);
    assert.equal(formatMonitoringResult(parsed.monitoringSafety.results[0]!, 'mmHg'), '132 / 78 mmHg');
    assert.equal(formatMonitoringDate('26-Aug-2026'), '2026-08-26');
    assert.equal(
      validateMonitoringResultDraft(
        { label: 'eGFR', valueShape: 'NUMERIC' },
        { numeric: '60', systolic: '', diastolic: '', text: '', unit: '', observedDate: '2026-13-01', sourceLabel: '' },
      ),
      'Enter a valid date (yyyy-mm-dd).',
    );
  });

  it('lets Continue proceed when a result is unavailable', () => {
    const gate = evaluateMonitoringGate({
      monitoring: [
        {
          inputCode: 'EGFR',
          label: 'eGFR',
          inputType: 'LAB',
          valueShape: 'NUMERIC',
          unit: 'mL/min/1.73m²',
          medicationIds: ['ramipril', 'metformin'],
          medicationNames: ['Ramipril', 'Metformin'],
          result: {
            inputCode: 'EGFR',
            status: 'UNAVAILABLE',
            value: null,
            observedDate: null,
            sourceType: null,
            sourceLabel: null,
            note: 'Netcare unavailable',
            pharmacistConfirmed: true,
          },
        },
      ],
      context: [],
      findings: [],
      acknowledgedFindingKeys: [],
    });
    assert.equal(gate.ok, true);
    assert.deepEqual(gate.pendingMonitoringCodes, []);
  });

  it('composes and parses unavailable reasons', () => {
    const note = composeUnavailableNote('netcare_record', 'system down');
    assert.equal(note, 'Netcare / provincial record unavailable — system down');
    const parsed = parseUnavailableNote(note);
    assert.equal(parsed.reasonId, 'netcare_record');
    assert.equal(parsed.shortLabel, 'Netcare unavailable');
    assert.equal(parsed.extra, 'system down');
    const legacy = parseUnavailableNote('Netcare unavailable — fob not working');
    assert.equal(legacy.reasonId, 'netcare_record');
    assert.equal(legacy.extra, 'fob not working');
  });

  it('blocks Continue while a monitoring item is still pending', () => {
    const gate = evaluateMonitoringGate({
      monitoring: [
        {
          inputCode: 'TSH',
          label: 'TSH',
          inputType: 'LAB',
          valueShape: 'NUMERIC',
          unit: 'mIU/L',
          medicationIds: ['levo'],
          medicationNames: ['Levothyroxine'],
          result: emptyMonitoringResult('TSH'),
        },
      ],
      context: [],
      findings: [],
      acknowledgedFindingKeys: [],
    });
    assert.equal(gate.ok, false);
    assert.deepEqual(gate.pendingMonitoringCodes, ['TSH']);
  });

  it('matches extracted labels to requested input codes', () => {
    const inputs = [
      { code: 'EGFR', label: 'eGFR', aliases: ['estimated gfr', 'gfr'] },
      { code: 'POTASSIUM', label: 'Potassium', aliases: ['k', 'k+'] },
    ];
    assert.equal(matchExtractionToCode('Estimated GFR', inputs), 'EGFR');
    assert.equal(matchExtractionToCode('eGFR', inputs), 'EGFR');
    assert.equal(matchExtractionToCode('K+', inputs), 'POTASSIUM');
    assert.equal(matchExtractionToCode('unrelated cholesterol', inputs), null);
  });

  it('hydrates BP vs numeric drafts and switches units with the selected item', () => {
    const bp: MonitoringResultEditorItem = {
      inputCode: 'BP',
      label: 'Blood pressure',
      inputType: 'VITAL',
      valueShape: 'SYSTOLIC_DIASTOLIC',
      unit: 'mmHg',
      result: {
        ...emptyMonitoringResult('BP'),
        status: 'AVAILABLE',
        value: { numericValue: 132, secondaryNumericValue: 78, valueText: '132 / 78', unit: 'mmHg' },
        observedDate: '2026-08-23',
        sourceLabel: 'Netcare',
        pharmacistConfirmed: true,
      },
    };
    const egfr: MonitoringResultEditorItem = {
      inputCode: 'EGFR',
      label: 'eGFR',
      inputType: 'LAB',
      valueShape: 'NUMERIC',
      unit: 'mL/min/1.73m²',
      result: emptyMonitoringResult('EGFR'),
    };

    const bpDraft = hydrateMonitoringResultDraft(bp);
    assert.equal(bpDraft.systolic, '132');
    assert.equal(bpDraft.diastolic, '78');
    assert.equal(bpDraft.unit, 'mmHg');
    assert.equal(validateMonitoringResultDraft(bp, bpDraft), null);
    assert.deepEqual(buildMonitoringResultSaveBody(bp, bpDraft), {
      numericValue: 132,
      secondaryNumericValue: 78,
      valueText: '132 / 78',
      unit: 'mmHg',
      observedDate: '2026-08-23',
      sourceLabel: 'Netcare',
    });

    const switched = hydrateMonitoringResultDraft(egfr, {
      observedDate: bpDraft.observedDate,
      sourceLabel: bpDraft.sourceLabel,
    });
    assert.equal(switched.systolic, '');
    assert.equal(switched.numeric, '');
    assert.equal(switched.unit, 'mL/min/1.73m²');
    assert.equal(switched.observedDate, '2026-08-23');
    assert.equal(switched.sourceLabel, 'Netcare');
    assert.equal(monitoringResultEditorKind(egfr.valueShape), 'numeric');
    assert.equal(validateMonitoringResultDraft(egfr, switched), 'Enter a eGFR value.');
    assert.deepEqual(unitsForMonitoringItem(egfr), ['mL/min/1.73m²', 'mL/min']);
    assert.equal(resolveMonitoringItem([bp, egfr], 'EGFR')?.inputCode, 'EGFR');
    assert.equal(resolveMonitoringItem([bp, egfr], 'MISSING')?.inputCode, 'BP');
    assert.equal(monitoringResultPlaceholders('BP', 'SYSTOLIC_DIASTOLIC').secondary, '78');
  });

  it('fingerprints merged input codes in stable order', () => {
    assert.equal(requirementFingerprint(['EGFR', 'BP', 'EGFR']), 'BP,EGFR,EGFR');
    assert.equal(requirementFingerprint(['POTASSIUM', 'EGFR']), requirementFingerprint(['EGFR', 'POTASSIUM']));
  });
});
