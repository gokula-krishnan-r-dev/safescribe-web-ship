/**
 * Align Safety_03082026 authoring workbooks with Safety Engine v2.0 gold-path cases.
 * Safe to re-run: skips rows whose rule_code / interaction_code already exists.
 */
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const XLSX = require('../apps/api/node_modules/xlsx');

const DIR = path.resolve('Safety_03082026');

function load(file) {
  const full = path.join(DIR, file);
  const wb = XLSX.readFile(full);
  const sheetName = wb.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: '' });
  return { full, wb, sheetName, rows };
}

function save({ full, wb, sheetName, rows }) {
  const sheet = XLSX.utils.json_to_sheet(rows);
  wb.Sheets[sheetName] = sheet;
  XLSX.writeFile(wb, full);
}

function nextRowKey(rows, prefix) {
  const nums = rows
    .map((r) => String(r.row_key ?? ''))
    .map((k) => Number((k.match(/(\d+)$/) ?? [])[1]))
    .filter((n) => Number.isFinite(n));
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return `${prefix}${String(next).padStart(3, '0')}`;
}

function upsert(rows, keyField, code, patch) {
  const existing = rows.find((r) => r[keyField] === code);
  if (existing) {
    Object.assign(existing, patch);
    return 'updated';
  }
  rows.push(patch);
  return 'added';
}

const summary = [];

{
  const pack = load('lab-threshold-rules.xlsx');
  const k = pack.rows.find((r) => r.rule_code === 'SS-LAB-SPIRONOLACTONE-POTASSIUM-ABOVE-ULN');
  if (k) {
    Object.assign(k, {
      threshold_basis_code: 'ABSOLUTE_VALUE',
      threshold_min_value: 5.0,
      threshold_min_inclusive: 'TRUE',
      threshold_max_value: '',
      threshold_max_inclusive: 'FALSE',
      reference_limit_direction: 'ABOVE_OR_EQUAL_ABSOLUTE',
      max_result_age_days: 90,
      alert_summary: 'Potassium is at or above 5.0 mmol/L',
      alert_detail:
        'Serum or plasma potassium is ≥ 5.0 mmol/L. Do not initiate or increase spironolactone until the result and clinical context are reviewed.',
      change_summary: 'v2 pack: inclusive K >= 5.0 mmol/L (not exclusive above ULN).',
      clinical_notes:
        'Gold-path LAB-02 requires an inclusive 5.0 mmol/L cutoff. Local laboratory ULN may still be used when coded; this numeric floor is the clinical default.',
    });
    summary.push('lab: spironolactone K >= 5.0 inclusive');
  }

  const tmpl = pack.rows.find((r) => r.rule_code === 'SS-LAB-SPIRONOLACTONE-POTASSIUM-ABOVE-ULN') ?? pack.rows[0];
  const altCode = 'SS-LAB-TERBINAFINE-ALT-GTE-120';
  if (!pack.rows.some((r) => r.rule_code === altCode)) {
    pack.rows.push({
      ...tmpl,
      row_key: nextRowKey(pack.rows, 'ROW-LAB-'),
      rule_code: altCode,
      drug_selector_code: 'SEL-TERBINAFINE',
      drug_display_name_snapshot: 'terbinafine',
      observation_code: '1742-6',
      observation_display_name: 'Alanine aminotransferase [Enzymatic activity/volume] in Serum or Plasma',
      expected_unit_ucum_code: 'U/L',
      threshold_basis_code: 'ABSOLUTE_VALUE',
      threshold_min_value: 120,
      threshold_min_inclusive: 'TRUE',
      threshold_max_value: '',
      reference_limit_direction: 'ABOVE_OR_EQUAL_ABSOLUTE',
      max_result_age_days: 90,
      clinical_rationale_code: 'ORAL_TERBINAFINE_HEPATOTOXICITY',
      deduplication_group: 'DEDUP-TERBINAFINE-LAB-ALT',
      alert_summary: 'ALT is at or above 3× ULN while oral terbinafine is active',
      alert_detail:
        'Current ALT is ≥ 120 U/L. Do not continue or renew oral terbinafine without immediate clinical review.',
      change_summary: 'v2 pack HEP-03 gold-path ALT threshold.',
    });
    summary.push('lab: oral terbinafine ALT >= 120');
  }
  save(pack);
}

{
  const pack = load('clinical-value-set-members.xlsx');
  pack.rows = pack.rows.filter(
    (r) =>
      !(
        r.value_set_code === 'VS-SYSTEMIC-NSAIDS' &&
        /acetaminophen|paracetamol/i.test(String(r.member_display_name ?? r.member_local_code ?? ''))
      ),
  );
  const nsaidNames = new Set(
    pack.rows
      .filter((r) => r.value_set_code === 'VS-SYSTEMIC-NSAIDS')
      .map((r) => String(r.member_display_name).toLowerCase()),
  );
  const extras = ['Aspirin', 'Ketorolac', 'Indomethacin', 'Meloxicam'];
  let seq = pack.rows.length + 1;
  for (const name of extras) {
    if (nsaidNames.has(name.toLowerCase())) continue;
    pack.rows.push({
      ...pack.rows.find((r) => r.value_set_code === 'VS-SYSTEMIC-NSAIDS'),
      row_id: `VS-MEM-${String(seq++).padStart(3, '0')}`,
      member_display_name: name,
      member_local_code: name.toUpperCase(),
      terminology_display_name: name,
    });
  }
  summary.push('value-sets: removed acetaminophen from NSAIDs; added missing NSAID members');
  save(pack);
}

{
  const pack = load('allergy-cross-reactivity-rules.xlsx');
  const tmpl = pack.rows.find((r) => r.rule_code === 'SS-ACR-BL-AMOX-PENV-IMM') ?? pack.rows[0];
  const additions = [
    {
      rule_code: 'SS-ACR-ACYCLOVIR-VALACYCLOVIR',
      source_selector_code: 'SEL-ACYCLOVIR',
      target_selector_code: 'SEL-VALACYCLOVIR',
      relationship_basis: 'PRODRUG_ACTIVE_MOIETY',
      alert_severity: 'HIGH',
      recommended_action_code: 'AVOID_AND_SELECT_ALTERNATIVE',
      alert_summary: 'Acyclovir allergy — valacyclovir cross-reactivity',
      alert_detail:
        'Valacyclovir is a prodrug of acyclovir. A confirmed severe acyclovir allergy blocks valacyclovir by any route.',
      change_summary: 'v2 pack ALG-X01 gold-path.',
    },
    {
      rule_code: 'SS-ACR-VALACYCLOVIR-ACYCLOVIR',
      source_selector_code: 'SEL-VALACYCLOVIR',
      target_selector_code: 'SEL-ACYCLOVIR',
      relationship_basis: 'PRODRUG_ACTIVE_MOIETY',
      alert_severity: 'HIGH',
      recommended_action_code: 'AVOID_AND_SELECT_ALTERNATIVE',
      alert_summary: 'Valacyclovir allergy — acyclovir cross-reactivity',
      alert_detail:
        'Acyclovir is the active moiety of valacyclovir. A confirmed valacyclovir allergy blocks oral and topical acyclovir.',
      change_summary: 'v2 pack ALG-X02 gold-path (route-independent).',
    },
    {
      rule_code: 'SS-ACR-BL-AMOX-AMPICILLIN-IMM',
      source_selector_code: 'SEL-AMOXICILLIN',
      target_selector_code: 'SEL-AMPICILLIN',
      relationship_basis: 'PENICILLIN_INTRACLASS',
      alert_severity: 'HIGH',
      recommended_action_code: 'AVOID_AND_SELECT_ALTERNATIVE',
      alert_summary: 'Amoxicillin allergy — ampicillin class member',
      alert_detail: 'Ampicillin is a penicillin-class agent and is blocked after a severe amoxicillin allergy.',
      change_summary: 'v2 pack ALG-X03 gold-path.',
    },
    {
      rule_code: 'SS-ACR-BL-AMOX-CEPHALEXIN-CAUTION',
      source_selector_code: 'SEL-AMOXICILLIN',
      target_selector_code: 'SEL-CEPHALEXIN',
      relationship_basis: 'RELATED_AMINO_R1_SIDE_CHAIN',
      alert_severity: 'MEDIUM',
      recommended_action_code: 'REVIEW_BEFORE_USE',
      alert_summary: 'Cephalexin caution in penicillin allergy',
      alert_detail:
        'Cephalosporin cross-allergenicity caution in penicillin-sensitive patients. Do not present as a routine alternative.',
      change_summary: 'v2 pack ALG-X03 cephalexin caution.',
    },
  ];
  for (const add of additions) {
    const status = upsert(pack.rows, 'rule_code', add.rule_code, {
      ...tmpl,
      row_key: pack.rows.some((r) => r.rule_code === add.rule_code)
        ? pack.rows.find((r) => r.rule_code === add.rule_code).row_key
        : nextRowKey(pack.rows, 'ROW-ACR-'),
      ...add,
      source_selector_type: 'INGREDIENT_SELECTOR',
      target_selector_type: 'INGREDIENT_SELECTOR',
    });
    summary.push(`allergy: ${add.rule_code} ${status}`);
  }
  save(pack);
}

{
  const pack = load('drug-disease-rules.xlsx');
  const tmpl = pack.rows.find((r) => r.rule_code === 'SS-DDX-NSAID-ACTIVE-PUD') ?? pack.rows[0];
  const additions = [
    {
      rule_code: 'SS-DDX-NSAID-AERD',
      condition_display_name_snapshot: 'Aspirin-exacerbated respiratory disease (disorder)',
      condition_concept_code: '241929008',
      clinical_rationale_code: 'NSAID_AERD_BRONCHOSPASM',
      alert_summary: 'NSAID blocked in ASA-exacerbated respiratory disease',
      alert_detail:
        'NSAIDs are contraindicated in aspirin-exacerbated respiratory disease (asthma / nasal polyps with ASA reaction).',
      change_summary: 'v2 pack DXD-03 gold-path.',
    },
    {
      rule_code: 'SS-DDX-TERBINAFINE-HEPATIC',
      drug_selector_type: 'INGREDIENT_SELECTOR',
      drug_selector_code: 'SEL-TERBINAFINE',
      drug_display_name_snapshot: 'terbinafine',
      drug_route_scope_code: 'SYSTEMIC_ONLY',
      condition_display_name_snapshot: 'Chronic liver disease (disorder)',
      condition_concept_code: '328383001',
      clinical_rationale_code: 'ORAL_TERBINAFINE_HEPATOTOXICITY',
      alert_summary: 'Oral terbinafine contraindicated in chronic/active hepatic disease',
      alert_detail:
        'Oral terbinafine is contraindicated in chronic or active hepatic disease. Topical terbinafine is outside this systemic rule.',
      change_summary: 'v2 pack HEP-01 gold-path.',
    },
  ];
  for (const add of additions) {
    const status = upsert(pack.rows, 'rule_code', add.rule_code, {
      ...tmpl,
      row_key: pack.rows.some((r) => r.rule_code === add.rule_code)
        ? pack.rows.find((r) => r.rule_code === add.rule_code).row_key
        : nextRowKey(pack.rows, 'ROW-DDX-'),
      ...add,
    });
    summary.push(`disease: ${add.rule_code} ${status}`);
  }
  save(pack);
}

{
  const pack = load('drug-interactions.xlsx');
  const tmpl = pack.rows.find((r) => r.interaction_code === 'SS-DDI-WARFARIN-CLARITHROMYCIN') ?? pack.rows[0];
  const additions = [
    {
      interaction_code: 'SS-DDI-CLOPIDOGREL-OMEPRAZOLE',
      drug_a_selector_type: 'INGREDIENT_SELECTOR',
      drug_a_selector_code: 'SEL-CLOPIDOGREL',
      drug_a_display_name_snapshot: 'clopidogrel',
      drug_b_selector_type: 'INGREDIENT_SELECTOR',
      drug_b_selector_code: 'SEL-OMEPRAZOLE',
      drug_b_display_name_snapshot: 'omeprazole',
      alert_severity: 'HIGH',
      recommended_action_code: 'AVOID_OR_REVIEW_ALTERNATIVE',
      rule_effect: 'PHARMACIST_REVIEW',
      alert_summary: 'Clopidogrel–omeprazole interaction',
      alert_detail:
        'Omeprazole may reduce the antiplatelet effect of clopidogrel via CYP2C19. Prefer pantoprazole or an H2RA. This is avoid/not-preferred, not a hard contraindication.',
      change_summary: 'v2 pack DDI-01 gold-path (AVOID, not BLOCK).',
    },
    {
      interaction_code: 'SS-DDI-CLOPIDOGREL-ESOMEPRAZOLE',
      drug_a_selector_type: 'INGREDIENT_SELECTOR',
      drug_a_selector_code: 'SEL-CLOPIDOGREL',
      drug_a_display_name_snapshot: 'clopidogrel',
      drug_b_selector_type: 'INGREDIENT_SELECTOR',
      drug_b_selector_code: 'SEL-ESOMEPRAZOLE',
      drug_b_display_name_snapshot: 'esomeprazole',
      alert_severity: 'HIGH',
      recommended_action_code: 'AVOID_OR_REVIEW_ALTERNATIVE',
      rule_effect: 'PHARMACIST_REVIEW',
      alert_summary: 'Clopidogrel–esomeprazole interaction',
      alert_detail:
        'Esomeprazole may reduce the antiplatelet effect of clopidogrel via CYP2C19. Prefer pantoprazole or an H2RA. This is avoid/not-preferred, not a hard contraindication.',
      change_summary: 'v2 pack DDI-01 gold-path (AVOID, not BLOCK).',
    },
    {
      interaction_code: 'SS-DDI-SIMVASTATIN-CLARITHROMYCIN',
      drug_a_selector_type: 'INGREDIENT_SELECTOR',
      drug_a_selector_code: 'SEL-SIMVASTATIN',
      drug_a_display_name_snapshot: 'simvastatin',
      drug_b_selector_type: 'INGREDIENT_SELECTOR',
      drug_b_selector_code: 'SEL-CLARITHROMYCIN',
      drug_b_display_name_snapshot: 'clarithromycin',
      alert_severity: 'CRITICAL',
      recommended_action_code: 'CONTRAINDICATED_DO_NOT_USE',
      rule_effect: 'HARD_STOP',
      alert_summary: 'Simvastatin–clarithromycin contraindicated pair',
      alert_detail:
        'Concomitant use with simvastatin is contraindicated because of myopathy and rhabdomyolysis risk.',
      change_summary: 'v2 pack DDI-02 gold-path.',
    },
  ];
  for (const add of additions) {
    const status = upsert(pack.rows, 'interaction_code', add.interaction_code, {
      ...tmpl,
      row_key: pack.rows.some((r) => r.interaction_code === add.interaction_code)
        ? pack.rows.find((r) => r.interaction_code === add.interaction_code).row_key
        : nextRowKey(pack.rows, 'ROW-DDI-'),
      ...add,
    });
    summary.push(`ddi: ${add.interaction_code} ${status}`);
  }
  save(pack);
}

{
  const pack = load('renal-rules.xlsx');
  const tmpl = pack.rows.find((r) => r.rule_code === 'SS-REN-VALACYCLOVIR-ZOSTER-CRCL-10-29') ?? pack.rows[0];
  const additions = [
    {
      rule_code: 'SS-REN-ACYCLOVIR-EGFR-10-30',
      drug_selector_code: 'SEL-ACYCLOVIR',
      drug_display_name_snapshot: 'acyclovir',
      drug_route_scope_code: 'SYSTEMIC_ONLY',
      applicability_indication_code: 'HERPES_LABIALIS_ADULT',
      renal_metric_code: 'EGFR_CKD_EPI_INDEXED',
      renal_metric_unit: 'mL/min/1.73m2',
      threshold_min_value: 10,
      threshold_min_inclusive: 'TRUE',
      threshold_max_value: 30,
      threshold_max_inclusive: 'FALSE',
      alert_severity: 'MODERATE',
      alert_summary: 'Acyclovir renal dose adjustment (eGFR 10–29)',
      alert_detail:
        "The patient's renal function is in the 10 to below 30 mL/min range. Adjust oral acyclovir dosing. Topical acyclovir is out of scope.",
      change_summary: 'v2 pack REN-01 oral acyclovir band.',
    },
    {
      rule_code: 'SS-REN-FAMCICLOVIR-EGFR-BELOW-30',
      drug_selector_code: 'SEL-FAMCICLOVIR',
      drug_display_name_snapshot: 'famciclovir',
      drug_route_scope_code: 'ORAL_ONLY',
      applicability_indication_code: 'HERPES_LABIALIS_ADULT',
      renal_metric_code: 'EGFR_CKD_EPI_INDEXED',
      renal_metric_unit: 'mL/min/1.73m2',
      threshold_min_value: '',
      threshold_min_inclusive: 'FALSE',
      threshold_max_value: 30,
      threshold_max_inclusive: 'FALSE',
      alert_severity: 'MODERATE',
      alert_summary: 'Famciclovir renal dose adjustment (eGFR <30)',
      alert_detail: 'Systemic famciclovir requires drug-specific renal dosing at this clearance.',
      change_summary: 'v2 pack REN-01 famciclovir band.',
    },
    {
      rule_code: 'SS-REN-VALACYCLOVIR-LABIALIS-CRCL-10-29',
      drug_selector_code: 'SEL-VALACYCLOVIR',
      drug_display_name_snapshot: 'valacyclovir',
      drug_route_scope_code: 'ORAL_ONLY',
      applicability_indication_code: 'HERPES_LABIALIS_ADULT',
      renal_metric_code: 'CRCL_COCKCROFT_GAULT_ABSOLUTE',
      renal_metric_unit: 'mL/min',
      threshold_min_value: 10,
      threshold_min_inclusive: 'TRUE',
      threshold_max_value: 30,
      threshold_max_inclusive: 'FALSE',
      alert_severity: 'MODERATE',
      recommended_single_dose_value: 500,
      recommended_dose_unit: 'mg',
      alert_summary: 'Valacyclovir cold-sore renal-adjusted regimen (CrCl 10–29)',
      alert_detail:
        'Standard 2 g valacyclovir is not appropriate. Use a renal-adjusted 500 mg regimen or obtain verified CrCl before finalizing. Do not treat eGFR as CrCl.',
      change_summary: 'v2 pack REN-02 regimen split + REN-03 CrCl-required.',
    },
  ];
  for (const add of additions) {
    const status = upsert(pack.rows, 'rule_code', add.rule_code, {
      ...tmpl,
      row_key: pack.rows.some((r) => r.rule_code === add.rule_code)
        ? pack.rows.find((r) => r.rule_code === add.rule_code).row_key
        : nextRowKey(pack.rows, 'ROW-REN-'),
      ...add,
    });
    summary.push(`renal: ${add.rule_code} ${status}`);
  }
  save(pack);
}

{
  // Align VS-SS-* selector codes in authoring rules to published value-set codes.
  const maps = [
    ['drug-disease-rules.xlsx', ['drug_selector_code']],
    ['drug-interactions.xlsx', ['drug_a_selector_code', 'drug_b_selector_code']],
    ['pregnancy-rules.xlsx', ['drug_selector_code']],
    ['allergy-cross-reactivity-rules.xlsx', ['source_selector_code', 'target_selector_code']],
  ];
  const aliases = {
    'VS-SS-ACE-INHIBITORS': 'VS-ACE-INHIBITORS',
    'VS-SS-PENICILLINS': 'VS-PENICILLINS',
    'VS-SS-CEPHALOSPORINS': 'VS-CEPHALOSPORINS',
    'VS-SS-PDE5-INHIBITORS': 'VS-PDE5-INHIBITORS',
    'VS-SS-NITRATES': 'VS-ORGANIC-NITRATES',
    'VS-SS-VITAMIN-K-ANTAGONISTS': 'VS-VITAMIN-K-ANTAGONISTS',
    'VS-SS-K-SPARING-DIURETICS': 'VS-POTASSIUM-SPARING-DIURETICS',
    'VS-SS-SSRIs': 'VS-SSRIS',
    'VS-SS-FLUOROQUINOLONES': 'VS-SYSTEMIC-FLUOROQUINOLONES',
    'VS-SS-CORTICOSTEROIDS': 'VS-SYSTEMIC-CORTICOSTEROIDS',
    'VS-SS-SYSTEMIC-RETINOIDS': 'VS-SYSTEMIC-RETINOIDS',
    'VS-SS-TOPICAL-RETINOIDS': 'VS-TOPICAL-RETINOIDS',
  };
  for (const [file, cols] of maps) {
    const pack = load(file);
    let n = 0;
    for (const row of pack.rows) {
      for (const col of cols) {
        const next = aliases[row[col]];
        if (next && next !== row[col]) {
          row[col] = next;
          n += 1;
        }
      }
    }
    if (n) {
      save(pack);
      summary.push(`${file}: aligned ${n} value-set selector codes`);
    }
  }
}

console.log(summary.join('\n'));
