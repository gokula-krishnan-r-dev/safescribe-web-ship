import { createHash } from 'crypto';
import type { OpenFdaLabelResult } from './providers/openfda/openfda-label.client';
import type {
  ClinicalSafetyWarning,
  DrugInteractionCard,
  EvidenceSourceMeta,
  MonitoringRequirement,
  RecommendedTreatmentInfo,
  SafetySeverity,
} from './drug-label.types';

function first(arr?: string[] | null): string | null {
  const v = arr?.find((s) => s?.trim());
  return v?.trim() ?? null;
}

function join(arr?: string[] | null, max = 1200): string | null {
  if (!arr?.length) return null;
  const text = arr.map((s) => s.trim()).filter(Boolean).join('\n\n');
  return text.length > max ? `${text.slice(0, max).trim()}…` : text;
}

function snippet(text: string | null | undefined, max = 220): string {
  if (!text) return '';
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max).trim()}…` : clean;
}

function ruleId(parts: string[]): string {
  const raw = parts.join(':').toLowerCase();
  const hash = createHash('sha1').update(raw).digest('hex').slice(0, 10);
  return `dl.${parts[0]}.${hash}`;
}

function extractPediatricDose(dosage: string | null): string | null {
  if (!dosage) return null;
  const m = dosage.match(
    /(?:pediatric|children|paediatric)[^.]{0,40}(?:dose|dosing)[^.]*\./i,
  );
  return m ? snippet(m[0], 180) : null;
}

function extractAdultDose(dosage: string | null): string | null {
  if (!dosage) return null;
  const m = dosage.match(
    /(?:adult|usual)[^.]{0,40}(?:dose|dosing|dosage)[^.]*\./i,
  );
  return m ? snippet(m[0], 180) : snippet(dosage, 180);
}

function splitSentences(text: string, limit = 6): string[] {
  return text
    .split(/(?<=[.!;])\s+|\n+/)
    .map((s) => s.replace(/^[-•*\d.)\s]+/, '').trim())
    .filter((s) => s.length > 18 && s.length < 220)
    .slice(0, limit);
}

function interactionSeverity(text: string): SafetySeverity {
  if (/contraindic|avoid|do not|life.?threat|fatal/i.test(text)) return 'CRITICAL';
  if (/major|serious|significant|monitor closely|increase.*risk/i.test(text)) return 'HIGH';
  if (/moderate|caution|consider/i.test(text)) return 'MODERATE';
  return 'INFO';
}

export function mapLabelToRecommended(
  drugName: string,
  label: OpenFdaLabelResult | null,
  pathway?: {
    dose?: string | null;
    route?: string | null;
    frequency?: string | null;
    duration?: string | null;
    genericName?: string | null;
  },
): RecommendedTreatmentInfo {
  const ofda = label?.openfda;
  const dosage = join(label?.dosage_and_administration, 4000);
  return {
    medicationName: drugName,
    genericName: first(ofda?.generic_name) || pathway?.genericName || null,
    brandName: first(ofda?.brand_name) || null,
    therapeuticClass:
      first(ofda?.pharm_class_epc) || first(ofda?.pharm_class_cs) || null,
    indications: snippet(join(label?.indications_and_usage), 320) || null,
    adultDose: pathway?.dose || extractAdultDose(dosage),
    pediatricDose: extractPediatricDose(dosage),
    route: pathway?.route || first(ofda?.route) || null,
    frequency: pathway?.frequency || null,
    duration: pathway?.duration || null,
  };
}

export function mapLabelWarnings(
  label: OpenFdaLabelResult,
  drugCode?: string | null,
): ClinicalSafetyWarning[] {
  const warnings: ClinicalSafetyWarning[] = [];
  const setId = first(label.openfda?.spl_set_id) || label.set_id || null;
  const version = label.version || label.effective_time || null;
  const baseMeta = {
    drugCode: drugCode ?? null,
    snomedOrCcddCode: null as string | null,
    evidenceSource: 'OpenFDA Drug Label',
    evidenceVersion: version,
    lastUpdated: label.effective_time || null,
  };

  const boxed = join(label.boxed_warning, 8000);
  if (boxed) {
    warnings.push({
      ruleId: ruleId(['boxed', setId || 'na', boxed.slice(0, 80)]),
      severity: 'CRITICAL',
      title: 'Black Box Warning',
      explanation: snippet(boxed, 260),
      clinicianAction:
        'Review boxed warning before prescribing. Confirm monitoring plan and counsel patient on risks.',
      source: 'OpenFDA',
      sourceKind: 'DRUG_LABEL',
      clinicalCategory: 'BLACK_BOX',
      fullText: boxed,
      ...baseMeta,
    });
  }

  const contra = join(label.contraindications, 6000);
  if (contra) {
    warnings.push({
      ruleId: ruleId(['ci', setId || 'na', contra.slice(0, 80)]),
      severity: 'CRITICAL',
      title: 'Absolute Contraindications',
      explanation: snippet(contra, 260),
      clinicianAction: 'Do not prescribe if any listed contraindication applies.',
      source: 'OpenFDA',
      sourceKind: 'DRUG_LABEL',
      clinicalCategory: 'CONTRAINDICATION',
      fullText: contra,
      ...baseMeta,
    });
  }

  const warnText = join(label.warnings_and_cautions || label.warnings, 6000);
  if (warnText) {
    const hepatic = /hepat|liver/i.test(warnText);
    const renal = /renal|kidney|creatinine|egfr/i.test(warnText);
    warnings.push({
      ruleId: ruleId(['warn', setId || 'na', warnText.slice(0, 80)]),
      severity: hepatic || renal ? 'HIGH' : 'MODERATE',
      title: hepatic
        ? 'Hepatic Precautions'
        : renal
          ? 'Renal Precautions'
          : 'Clinical Warnings',
      explanation: snippet(warnText, 260),
      clinicianAction: hepatic
        ? 'Assess liver function before initiation; discontinue if clinically indicated.'
        : renal
          ? 'Review renal function / CrCl and adjust dose if required.'
          : 'Review warnings and document clinical rationale.',
      source: 'OpenFDA',
      sourceKind: 'DRUG_LABEL',
      clinicalCategory: hepatic ? 'HEPATIC' : renal ? 'RENAL' : 'OTHER',
      fullText: warnText,
      ...baseMeta,
    });
  }

  const populations = join(label.use_in_specific_populations, 5000);
  if (populations) {
    const preg = /pregnan|fetal|teratogen|lactat|breast/i.test(populations);
    warnings.push({
      ruleId: ruleId(['pop', setId || 'na', populations.slice(0, 80)]),
      severity: preg ? 'CRITICAL' : 'HIGH',
      title: preg ? 'Pregnancy / Lactation Risk' : 'Use in Specific Populations',
      explanation: snippet(populations, 260),
      clinicianAction: preg
        ? 'Confirm pregnancy/breastfeeding status before prescribing; prefer safer alternatives when indicated.'
        : 'Review population-specific precautions (pediatric, geriatric, pregnancy).',
      source: 'OpenFDA',
      sourceKind: 'DRUG_LABEL',
      clinicalCategory: preg ? 'PREGNANCY' : 'CONDITION',
      fullText: populations,
      ...baseMeta,
    });
  }

  const adverse = join(label.adverse_reactions, 4000);
  if (adverse) {
    warnings.push({
      ruleId: ruleId(['ae', setId || 'na', adverse.slice(0, 80)]),
      severity: 'MODERATE',
      title: 'Common Adverse Effects',
      explanation: snippet(adverse, 260),
      clinicianAction: 'Counsel patient on expected side effects and when to seek care.',
      source: 'OpenFDA',
      sourceKind: 'DRUG_LABEL',
      clinicalCategory: 'ADVERSE_EFFECT',
      fullText: adverse,
      ...baseMeta,
    });
  }

  return warnings;
}

export function mapContraindicationChips(
  label: OpenFdaLabelResult | null,
  pathwayContras?: string[],
): Array<{ label: string; severity: SafetySeverity; ruleId: string }> {
  const chips: Array<{ label: string; severity: SafetySeverity; ruleId: string }> = [];
  const seen = new Set<string>();

  const push = (text: string, severity: SafetySeverity) => {
    const labelText = text.replace(/\s+/g, ' ').trim();
    if (labelText.length < 4) return;
    const key = labelText.toLowerCase().slice(0, 80);
    if (seen.has(key)) return;
    seen.add(key);
    chips.push({
      label: labelText.length > 72 ? `${labelText.slice(0, 72)}…` : labelText,
      severity,
      ruleId: ruleId(['chip', key]),
    });
  };

  for (const c of pathwayContras ?? []) push(c, 'CRITICAL');

  const contra = join(label?.contraindications, 3000);
  if (contra) {
    for (const s of splitSentences(contra, 8)) push(s, 'CRITICAL');
  }

  return chips.slice(0, 12);
}

export function mapInteractions(
  label: OpenFdaLabelResult | null,
  pathwayInteractions?: string[],
  currentMeds: string[] = [],
): DrugInteractionCard[] {
  const cards: DrugInteractionCard[] = [];
  const seen = new Set<string>();

  for (const raw of pathwayInteractions ?? []) {
    const key = raw.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    cards.push({
      drug: raw.split(/[:–-]/)[0]?.trim() || raw,
      severity: interactionSeverity(raw),
      clinicalEffect: snippet(raw, 160),
      recommendedAction: 'Review combination; monitor or avoid per guideline.',
      source: 'Pathway Guideline',
      ruleId: ruleId(['px-int', key]),
    });
  }

  const text = join(label?.drug_interactions, 5000);
  if (text) {
    for (const sentence of splitSentences(text, 8)) {
      const key = sentence.toLowerCase().slice(0, 60);
      if (seen.has(key)) continue;
      seen.add(key);
      const matchedMed = currentMeds.find((m) =>
        sentence.toLowerCase().includes(m.toLowerCase().split(/\s+/)[0] ?? ''),
      );
      cards.push({
        drug: matchedMed || sentence.split(/\s+/).slice(0, 3).join(' '),
        severity: matchedMed ? 'HIGH' : interactionSeverity(sentence),
        clinicalEffect: snippet(sentence, 180),
        recommendedAction: matchedMed
          ? `Patient is on ${matchedMed}. Avoid combination or intensify monitoring.`
          : 'Assess clinical significance; monitor or avoid combination as indicated.',
        source: 'OpenFDA',
        ruleId: ruleId(['ofd-int', key]),
      });
    }
  }

  return cards.slice(0, 10);
}

export function mapMonitoring(
  label: OpenFdaLabelResult | null,
  pathwayMonitoring?: string | null,
): MonitoringRequirement[] {
  const items: MonitoringRequirement[] = [];
  const blob = [
    pathwayMonitoring,
    join(label?.warnings_and_cautions || label?.warnings, 3000),
    join(label?.precautions, 2000),
    join(label?.dosage_and_administration, 2000),
  ]
    .filter(Boolean)
    .join(' ');

  const catalog: Array<{
    test: string;
    match: RegExp;
    reason: string;
    frequency: string;
  }> = [
    {
      test: 'Liver Function Tests',
      match: /liver|hepat|lft|alt|ast/i,
      reason: 'Hepatic safety',
      frequency: 'Baseline; repeat if clinically indicated',
    },
    {
      test: 'Kidney Function',
      match: /renal|kidney|creatinine|egfr|crcl/i,
      reason: 'Dose adjustment / toxicity risk',
      frequency: 'Baseline and with dose changes',
    },
    {
      test: 'CBC',
      match: /cbc|blood count|neutropen|anemia|leukopen/i,
      reason: 'Hematologic adverse effects',
      frequency: 'As clinically indicated',
    },
    {
      test: 'Blood Pressure',
      match: /blood pressure|hypertension|hypotension/i,
      reason: 'Cardiovascular monitoring',
      frequency: 'During therapy as indicated',
    },
    {
      test: 'ECG',
      match: /\becg\b|qt prolong|arrhythm/i,
      reason: 'Cardiac conduction risk',
      frequency: 'Baseline if risk factors present',
    },
  ];

  for (const c of catalog) {
    if (!c.match.test(blob)) continue;
    items.push({
      test: c.test,
      reason: c.reason,
      frequency: c.frequency,
      clinicalRationale: snippet(
        blob.match(new RegExp(`.{0,60}${c.match.source}.{0,80}`, 'i'))?.[0] ||
          c.reason,
        180,
      ),
      ruleId: ruleId(['mon', c.test]),
    });
  }

  if (pathwayMonitoring?.trim() && items.length === 0) {
    items.push({
      test: 'Pathway monitoring',
      reason: 'Guideline requirement',
      frequency: 'Per pathway',
      clinicalRationale: snippet(pathwayMonitoring, 200),
      ruleId: ruleId(['mon', 'pathway']),
    });
  }

  return items.slice(0, 8);
}

export function mapCounselling(
  label: OpenFdaLabelResult | null,
  pathwayCounselling?: string | null,
): string[] {
  const points: string[] = [];
  if (pathwayCounselling?.trim()) {
    points.push(
      ...pathwayCounselling
        .split(/\n|[.;]/)
        .map((s) => s.trim())
        .filter((s) => s.length > 8)
        .slice(0, 4),
    );
  }

  const patientInfo = join(
    label?.information_for_patients || label?.patient_information,
    3000,
  );
  if (patientInfo) {
    points.push(...splitSentences(patientInfo, 6));
  }

  const dosage = join(label?.dosage_and_administration, 2000);
  if (dosage) {
    for (const tip of [
      /take with food[^.]*\./i,
      /avoid alcohol[^.]*\./i,
      /do not crush[^.]*\./i,
      /complete (?:the )?full[^.]*\./i,
    ]) {
      const m = dosage.match(tip);
      if (m) points.push(snippet(m[0], 160));
    }
  }

  const unique = [...new Set(points.map((p) => p.replace(/\s+/g, ' ').trim()))];
  return unique.slice(0, 8);
}

export function mapEvidence(label: OpenFdaLabelResult | null): EvidenceSourceMeta {
  if (!label) {
    return {
      evidenceLevel: 'Pathway / clinical judgment',
      lastReviewed: new Date().toISOString().slice(0, 10),
    };
  }
  const setId = first(label.openfda?.spl_set_id) || label.set_id || null;
  return {
    latestDailyMedVersion: label.version || null,
    openFdaLabelVersion: label.version || label.id || null,
    publicationDate: label.effective_time || null,
    lastReviewed: label.effective_time || null,
    evidenceLevel: 'FDA Structured Product Labeling (reference)',
    setId,
    openFdaUrl: setId
      ? `https://api.fda.gov/drug/label.json?search=openfda.spl_set_id:"${setId}"`
      : 'https://open.fda.gov/apis/drug/label/',
    dailyMedUrl: setId
      ? `https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=${setId}`
      : 'https://dailymed.nlm.nih.gov/dailymed/',
  };
}
