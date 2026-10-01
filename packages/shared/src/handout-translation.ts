/**
 * Patient Care Summary translation pipeline.
 *
 * Canonical English (pharmacist-confirmed) → protect meds/numbers →
 * Cloud Translation → restore tokens → validate.
 * Never send raw consultation, transcript, pathway, or unconfirmed AI drafts.
 */

import {
  assessmentSentence,
  carePlanTitle,
  googleTranslateLanguageCode,
  handoutChrome,
  isSupportedHandoutLanguage,
  normalizeHandoutLanguage,
  questionsContactLine,
  type PatientHandoutSectionKey,
} from './handout-languages';
import type { PatientSummaryPayload } from './patient-care-summary';
import {
  questionsContactFromPharmacy,
  mergeMedicationUseIntoTreatment,
  renderPatientSummaryTreatmentLines,
  splitFollowUpForHandout,
} from './patient-care-summary';

export const HANDOUT_TRANSLATION_REVIEW_MESSAGE =
  'Translated draft — pharmacist review required';
export const HANDOUT_TRANSLATION_FALLBACK_MESSAGE =
  'Translation requires pharmacist review';
export const HANDOUT_TRANSLATION_STALE_MESSAGE =
  'The English source changed. Refresh the translation.';

export type HandoutTranslationValidationStatus =
  | 'ok'
  | 'failed_fallback_en'
  | 'stale'
  | 'unsupported_language'
  | 'disabled';

export interface CanonicalHandoutTreatment {
  display_name: string;
  patient_directions: string;
}

export interface CanonicalHandoutTranslationPayload {
  source_language: 'en';
  target_language: string;
  assessment: string[];
  treatments: CanonicalHandoutTreatment[];
  expected_response: string[];
  self_care: string[];
  seek_care: string[];
  follow_up: string[];
  pharmacy_details: {
    name: string | null;
    phone: string | null;
    address: string | null;
  };
}

export interface HandoutTranslationValidation {
  ok: boolean;
  reasons: string[];
  status: HandoutTranslationValidationStatus;
}

export interface TranslateTextsFn {
  (texts: string[], targetLanguage: string): Promise<string[]>;
}

const TOKEN_OPEN = '⟦';
const TOKEN_CLOSE = '⟧';

const DOSE_RE =
  /(?<![A-Za-z0-9])(\d+(?:[.,]\d+)?)\s*(mg|g|mcg|µg|ug|mL|ml|L|%|IU|units?|mmol|mEq)\b/gi;
const NUMBER_RE = /(?<![A-Za-z0-9⟦])(\d+(?:[.,]\d+)?)(?![A-Za-z0-9⟧])/g;
const PHONE_RE = /(\+?\d[\d\s().-]{6,}\d)/g;
const INTERNAL_META =
  /\b(?:safescribe|consultation[_ ]?(?:id|ref)|pathway id|rule id|phn|health(?:\s|-)?card)\b/i;

type PhraseKey =
  | 'by mouth'
  | 'twice daily'
  | 'once daily'
  | 'three times daily'
  | 'four times daily'
  | 'five times daily'
  | 'as needed'
  | 'at bedtime'
  | 'with food'
  | 'without food'
  | 'a thin layer'
  | 'to the affected area'
  | 'to the affected cold sore';

const PHRASE_ORDER: PhraseKey[] = [
  'to the affected cold sore',
  'to the affected area',
  'five times daily',
  'four times daily',
  'three times daily',
  'twice daily',
  'once daily',
  'without food',
  'with food',
  'at bedtime',
  'as needed',
  'a thin layer',
  'by mouth',
];

const PHRASES: Record<PhraseKey, Record<string, string>> = {
  'by mouth': {
    'fr-CA': 'par la bouche',
    es: 'por vía oral',
    'zh-CN': '口服',
    'zh-TW': '口服',
    pa: 'ਮੂੰਹ ਰਾਹੀਂ',
    hi: 'मुँह से',
    ar: 'عن طريق الفم',
    ur: 'منہ کے راستے',
    fil: 'sa bibig',
    ta: 'வாயின் வழியாக',
    gu: 'મોં દ્વારા',
    bn: 'মুখে',
    vi: 'uống',
    ko: '경구',
    fa: 'از راه دهان',
    uk: 'через рот',
    ru: 'внутрь',
    pt: 'por via oral',
    it: 'per bocca',
    pl: 'doustnie',
  },
  'twice daily': {
    'fr-CA': 'deux fois par jour',
    es: 'dos veces al día',
    'zh-CN': '每日两次',
    'zh-TW': '每日兩次',
    pa: 'ਰੋਜ਼ ਦੋ ਵਾਰ',
    hi: 'दिन में दो बार',
    ar: 'مرتين يومياً',
    ur: 'دن میں دو بار',
    fil: 'dalawang beses araw-araw',
    ta: 'நாளில் இருமுறை',
    gu: 'દિવસમાં બે વાર',
    bn: 'দিনে দুবার',
    vi: 'hai lần mỗi ngày',
    ko: '하루 두 번',
    fa: 'دو بار در روز',
    uk: 'двічі на день',
    ru: 'два раза в день',
    pt: 'duas vezes ao dia',
    it: 'due volte al giorno',
    pl: 'dwa razy dziennie',
  },
  'once daily': {
    'fr-CA': 'une fois par jour',
    es: 'una vez al día',
    'zh-CN': '每日一次',
    'zh-TW': '每日一次',
    pa: 'ਰੋਜ਼ ਇੱਕ ਵਾਰ',
    hi: 'दिन में एक बार',
    ar: 'مرة واحدة يومياً',
    ur: 'دن میں ایک بار',
    fil: 'isang beses araw-araw',
    ta: 'நாளில் ஒருமுறை',
    gu: 'દિવસમાં એક વાર',
    bn: 'দিনে একবার',
    vi: 'một lần mỗi ngày',
    ko: '하루 한 번',
    fa: 'یک بار در روز',
    uk: 'один раз на день',
    ru: 'один раз в день',
    pt: 'uma vez ao dia',
    it: 'una volta al giorno',
    pl: 'raz dziennie',
  },
  'three times daily': {
    'fr-CA': 'trois fois par jour',
    es: 'tres veces al día',
    'zh-CN': '每日三次',
    'zh-TW': '每日三次',
    pa: 'ਰੋਜ਼ ਤਿੰਨ ਵਾਰ',
    hi: 'दिन में तीन बार',
    ar: 'ثلاث مرات يومياً',
    ur: 'دن میں تین بار',
    fil: 'tatlong beses araw-araw',
    ta: 'நாளில் மூன்று முறை',
    gu: 'દિવસમાં ત્રણ વાર',
    bn: 'দিনে তিনবার',
    vi: 'ba lần mỗi ngày',
    ko: '하루 세 번',
    fa: 'سه بار در روز',
    uk: 'тричі на день',
    ru: 'три раза в день',
    pt: 'três vezes ao dia',
    it: 'tre volte al giorno',
    pl: 'trzy razy dziennie',
  },
  'four times daily': {
    'fr-CA': 'quatre fois par jour',
    es: 'cuatro veces al día',
    'zh-CN': '每日四次',
    'zh-TW': '每日四次',
    pa: 'ਰੋਜ਼ ਚਾਰ ਵਾਰ',
    hi: 'दिन में चार बार',
    ar: 'أربع مرات يومياً',
    ur: 'دن میں چار بار',
    fil: 'apat na beses araw-araw',
    ta: 'நாளில் நான்கு முறை',
    gu: 'દિવસમાં ચાર વાર',
    bn: 'দিনে চারবার',
    vi: 'bốn lần mỗi ngày',
    ko: '하루 네 번',
    fa: 'چهار بار در روز',
    uk: 'чотири рази на день',
    ru: 'четыре раза в день',
    pt: 'quatro vezes ao dia',
    it: 'quattro volte al giorno',
    pl: 'cztery razy dziennie',
  },
  'five times daily': {
    'fr-CA': 'cinq fois par jour',
    es: 'cinco veces al día',
    'zh-CN': '每日五次',
    'zh-TW': '每日五次',
    pa: 'ਰੋਜ਼ ਪੰਜ ਵਾਰ',
    hi: 'दिन में पाँच बार',
    ar: 'خمس مرات يومياً',
    ur: 'دن میں پانچ بار',
    fil: 'limang beses araw-araw',
    ta: 'நாளில் ஐந்து முறை',
    gu: 'દિવસમાં પાંચ વાર',
    bn: 'দিনে পাঁচবার',
    vi: 'năm lần mỗi ngày',
    ko: '하루 다섯 번',
    fa: 'پنج بار در روز',
    uk: 'п’ять разів на день',
    ru: 'пять раз в день',
    pt: 'cinco vezes ao dia',
    it: 'cinque volte al giorno',
    pl: 'pięć razy dziennie',
  },
  'as needed': {
    'fr-CA': 'au besoin',
    es: 'según sea necesario',
    'zh-CN': '必要时',
    'zh-TW': '必要時',
    pa: 'ਲੋੜ ਅਨੁਸਾਰ',
    hi: 'आवश्यकतानुसार',
    ar: 'عند الحاجة',
    ur: 'ضرورت کے مطابق',
    fil: 'kung kailangan',
    ta: 'தேவைக்கேற்ப',
    gu: 'જરૂર મુજબ',
    bn: 'প্রয়োজনমতো',
    vi: 'khi cần',
    ko: '필요 시',
    fa: 'در صورت نیاز',
    uk: 'за потреби',
    ru: 'по необходимости',
    pt: 'se necessário',
    it: 'al bisogno',
    pl: 'w razie potrzeby',
  },
  'at bedtime': {
    'fr-CA': 'au coucher',
    es: 'al acostarse',
    'zh-CN': '睡前',
    'zh-TW': '睡前',
    pa: 'ਸੌਣ ਵੇਲੇ',
    hi: 'सोते समय',
    ar: 'عند النوم',
    ur: 'سونے کے وقت',
    fil: 'bago matulog',
    ta: 'படுக்கைக்கு முன்',
    gu: 'સૂતી વખતે',
    bn: 'ঘুমানোর সময়',
    vi: 'trước khi ngủ',
    ko: '취침 시',
    fa: 'هنگام خواب',
    uk: 'перед сном',
    ru: 'перед сном',
    pt: 'ao deitar',
    it: 'prima di coricarsi',
    pl: 'przed snem',
  },
  'with food': {
    'fr-CA': 'avec de la nourriture',
    es: 'con alimentos',
    'zh-CN': '随餐',
    'zh-TW': '隨餐',
    pa: 'ਭੋਜਨ ਨਾਲ',
    hi: 'भोजन के साथ',
    ar: 'مع الطعام',
    ur: 'کھانے کے ساتھ',
    fil: 'kasama ng pagkain',
    ta: 'உணவுடன்',
    gu: 'ભોજન સાથે',
    bn: 'খাবারের সাথে',
    vi: 'cùng thức ăn',
    ko: '식사와 함께',
    fa: 'همراه غذا',
    uk: 'з їжею',
    ru: 'во время еды',
    pt: 'com alimentos',
    it: 'con il cibo',
    pl: 'z jedzeniem',
  },
  'without food': {
    'fr-CA': 'à jeun',
    es: 'sin alimentos',
    'zh-CN': '空腹',
    'zh-TW': '空腹',
    pa: 'ਭੋਜਨ ਤੋਂ ਬਿਨਾਂ',
    hi: 'बिना भोजन',
    ar: 'بدون طعام',
    ur: 'کھانے کے بغیر',
    fil: 'nang walang pagkain',
    ta: 'உணவின்றி',
    gu: 'ભોજન વગર',
    bn: 'খাবার ছাড়া',
    vi: 'khi đói',
    ko: '공복에',
    fa: 'بدون غذا',
    uk: 'без їжі',
    ru: 'натощак',
    pt: 'em jejum',
    it: 'a stomaco vuoto',
    pl: 'na czczo',
  },
  'a thin layer': {
    'fr-CA': 'une mince couche',
    es: 'una capa fina',
    'zh-CN': '薄薄一层',
    'zh-TW': '薄薄一層',
    pa: 'ਇੱਕ ਪਤਲੀ ਪਰਤ',
    hi: 'एक पतली परत',
    ar: 'طبقة رقيقة',
    ur: 'ایک پتلی تہہ',
    fil: 'isang manipis na layer',
    ta: 'ஒரு மெல்லிய அடுக்கு',
    gu: 'પાતળી પરત',
    bn: 'একটি পাতলা স্তর',
    vi: 'một lớp mỏng',
    ko: '얇은 층',
    fa: 'یک لایه نازک',
    uk: 'тонкий шар',
    ru: 'тонкий слой',
    pt: 'uma camada fina',
    it: 'uno strato sottile',
    pl: 'cienką warstwę',
  },
  'to the affected area': {
    'fr-CA': 'sur la zone touchée',
    es: 'en la zona afectada',
    'zh-CN': '涂于患处',
    'zh-TW': '塗於患處',
    pa: 'ਪ੍ਰਭਾਵਿਤ ਖੇਤਰ ਉੱਤੇ',
    hi: 'प्रभावित क्षेत्र पर',
    ar: 'على المنطقة المصابة',
    ur: 'متاثرہ جگہ پر',
    fil: 'sa apektadong bahagi',
    ta: 'பாதிக்கப்பட்ட பகுதியில்',
    gu: 'અસરગ્રસ્ત વિસ્તાર પર',
    bn: 'আক্রান্ত স্থানে',
    vi: 'lên vùng bị ảnh hưởng',
    ko: '환부에',
    fa: 'روی ناحیه مبتلا',
    uk: 'на уражену ділянку',
    ru: 'на поражённый участок',
    pt: 'na zona afetada',
    it: 'sulla zona interessata',
    pl: 'na zmieniony obszar',
  },
  'to the affected cold sore': {
    'fr-CA': 'sur le bouton de fièvre atteint',
    es: 'en el herpes labial afectado',
    'zh-CN': '涂于患处的唇疱疹',
    'zh-TW': '塗於患處的唇疱疹',
    pa: 'ਪ੍ਰਭਾਵਿਤ ਠੰਢੇ ਛਾਲੇ ਉੱਤੇ',
    hi: 'प्रभावित कोल्ड सोर पर',
    ar: 'على القرحة الباردة المصابة',
    ur: 'متاثرہ کولڈ سور پر',
    fil: 'sa apektadong cold sore',
    ta: 'பாதிக்கப்பட்ட கொப்புளத்தில்',
    gu: 'અસરગ્રસ્ત કોલ્ડ સોર પર',
    bn: 'আক্রান্ত কোল্ড সোরে',
    vi: 'lên đốm herpes bị ảnh hưởng',
    ko: '환부의 구순포진에',
    fa: 'روی تبخال مبتلا',
    uk: 'на уражену застудну виразку',
    ru: 'на поражённую простудную язву',
    pt: 'no herpes labial afetado',
    it: 'sull’herpes labiale interessato',
    pl: 'na zmienioną opryszczkę',
  },
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function tokenFor(index: number): string {
  return `${TOKEN_OPEN}SS${String(index).padStart(2, '0')}${TOKEN_CLOSE}`;
}

export function hashCanonicalHandout(
  payload: Pick<
    CanonicalHandoutTranslationPayload,
    | 'assessment'
    | 'treatments'
    | 'expected_response'
    | 'self_care'
    | 'seek_care'
    | 'follow_up'
    | 'pharmacy_details'
  >,
): string {
  const canonical = JSON.stringify({
    assessment: payload.assessment,
    treatments: payload.treatments.map((t) => ({
      display_name: t.display_name,
      patient_directions: t.patient_directions,
    })),
    expected_response: payload.expected_response,
    self_care: payload.self_care,
    seek_care: payload.seek_care,
    follow_up: payload.follow_up,
    pharmacy: {
      name: payload.pharmacy_details.name ?? '',
      phone: payload.pharmacy_details.phone ?? '',
      address: payload.pharmacy_details.address ?? '',
    },
  });
  let hash = 2166136261;
  for (let i = 0; i < canonical.length; i += 1) {
    hash ^= canonical.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `h${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

export function tokenizeProtectedText(
  text: string,
  extras: { names?: string[]; phones?: string[]; pharmacyName?: string | null } = {},
): { text: string; tokens: Record<string, string> } {
  let next = text ?? '';
  const tokens: Record<string, string> = {};
  let index = 1;

  const protectExact = (value: string | null | undefined) => {
    const raw = (value ?? '').trim();
    if (!raw) return;
    const re = new RegExp(escapeRegExp(raw), 'gi');
    next = next.replace(re, () => {
      const token = tokenFor(index);
      index += 1;
      tokens[token] = raw;
      return token;
    });
  };

  const names = [...(extras.names ?? [])].sort((a, b) => b.length - a.length);
  for (const name of names) protectExact(name);
  protectExact(extras.pharmacyName);
  for (const phone of extras.phones ?? []) protectExact(phone);

  next = next.replace(PHONE_RE, (match) => {
    if (Object.values(tokens).includes(match)) return match;
    const token = tokenFor(index);
    index += 1;
    tokens[token] = match;
    return token;
  });

  next = next.replace(DOSE_RE, (match) => {
    const token = tokenFor(index);
    index += 1;
    tokens[token] = match;
    return token;
  });

  next = next.replace(NUMBER_RE, (match) => {
    if (match.startsWith(TOKEN_OPEN) || Object.values(tokens).includes(match)) {
      return match;
    }
    const token = tokenFor(index);
    index += 1;
    tokens[token] = match;
    return token;
  });

  for (const phrase of PHRASE_ORDER) {
    const re = new RegExp(`\\b${escapeRegExp(phrase)}\\b`, 'gi');
    next = next.replace(re, () => {
      const token = tokenFor(index);
      index += 1;
      tokens[token] = `PHRASE:${phrase}`;
      return token;
    });
  }

  return { text: next, tokens };
}

export function restoreProtectedTokens(
  text: string,
  tokens: Record<string, string>,
  targetLanguage?: string,
): string {
  let next = text ?? '';
  const lang = targetLanguage ? normalizeHandoutLanguage(targetLanguage) : 'en';
  for (const [token, value] of Object.entries(tokens)) {
    const inner = token.slice(TOKEN_OPEN.length, -TOKEN_CLOSE.length);
    const re = new RegExp(
      `${escapeRegExp(TOKEN_OPEN)}\\s*${escapeRegExp(inner)}\\s*${escapeRegExp(TOKEN_CLOSE)}`,
      'gi',
    );
    const resolved = value.startsWith('PHRASE:')
      ? resolvePhrase(value.slice('PHRASE:'.length) as PhraseKey, lang)
      : value;
    next = next.replace(re, resolved);
  }
  return next.replace(/\s{2,}/g, ' ').trim();
}

function resolvePhrase(phrase: PhraseKey, language: string): string {
  if (language === 'en') return phrase;
  return PHRASES[phrase]?.[language] ?? phrase;
}

function extractNumbers(text: string): string[] {
  return (text.match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => n.replace(',', '.'));
}

function sameMultiset(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const counts = new Map<string, number>();
  for (const x of a) counts.set(x, (counts.get(x) ?? 0) + 1);
  for (const y of b) {
    const n = counts.get(y) ?? 0;
    if (!n) return false;
    counts.set(y, n - 1);
  }
  return true;
}

export function buildCanonicalHandoutPayload(
  summary: PatientSummaryPayload,
  targetLanguage = 'en',
): CanonicalHandoutTranslationPayload {
  const counsellingOn =
    summary.status !== 'not_requested' &&
    summary.status !== 'awaiting_counselling_confirmation';
  const { seekCare, followUp } = counsellingOn
    ? splitFollowUpForHandout(summary.confirmed_counselling.FOLLOW_UP)
    : { seekCare: [] as string[], followUp: [] as string[] };
  const assessment =
    summary.confirmed_assessment.patient_statement?.trim() ||
    assessmentSentence(summary.confirmed_assessment.display_name, 'en');
  return {
    source_language: 'en',
    target_language: normalizeHandoutLanguage(targetLanguage),
    assessment: assessment ? [assessment] : [],
    treatments: summary.selected_treatments.map((t) => ({
      display_name: t.display_name,
      patient_directions: t.patient_directions,
    })),
    expected_response: counsellingOn
      ? [...summary.confirmed_counselling.EXPECTED_RESPONSE]
      : [],
    self_care: counsellingOn ? [...summary.confirmed_counselling.SELF_CARE] : [],
    seek_care: seekCare,
    follow_up: followUp,
    pharmacy_details: {
      name: summary.pharmacy_details.name,
      phone: summary.pharmacy_details.phone,
      address: summary.pharmacy_details.address,
    },
  };
}

export function englishHandoutFieldsFromPayload(
  summary: PatientSummaryPayload,
  language = 'en',
): Record<string, string> {
  const canonical = buildCanonicalHandoutPayload(summary, language);
  const lang = normalizeHandoutLanguage(language);
  const condition = summary.confirmed_assessment.display_name;
  const questionsContact =
    questionsContactLine(
      canonical.pharmacy_details.name,
      canonical.pharmacy_details.phone,
      lang === 'en' ? 'en' : lang,
      canonical.pharmacy_details.address,
    ) || questionsContactFromPharmacy(canonical.pharmacy_details);

  return {
    documentTitle: carePlanTitle(condition, lang),
    diagnosis: condition ?? '',
    assessment: canonical.assessment.join('\n'),
    treatment: mergeMedicationUseIntoTreatment(
      renderPatientSummaryTreatmentLines(canonical.treatments),
      summary.confirmed_counselling.MEDICATION_USE,
    ),
    expectedResponse: canonical.expected_response.join('\n'),
    selfCare: canonical.self_care.join('\n'),
    seekCare: canonical.seek_care.join('\n'),
    followUp: canonical.follow_up.join('\n'),
    questionsContact,
    handoutLanguage: lang,
    handoutStatus: summary.status,
    handoutSourceHash: hashCanonicalHandout(canonical),
    translationProvider: '',
    translationModel: '',
    translationValidationStatus: lang === 'en' ? 'ok' : 'stale',
    translationRequiresReview: lang === 'en' ? 'false' : 'true',
    translationFallback: 'false',
    translationMessage: '',
    translationStale: lang === 'en' ? 'false' : 'true',
  };
}

export function fieldsFromTranslatedHandout(
  translated: CanonicalHandoutTranslationPayload,
  summary: PatientSummaryPayload,
  meta: {
    sourceHash: string;
    provider: string;
    model: string;
    validation: HandoutTranslationValidation;
  },
): Record<string, string> {
  const lang = normalizeHandoutLanguage(translated.target_language);
  const fallback = meta.validation.status !== 'ok';
  const english = englishHandoutFieldsFromPayload(summary, 'en');
  if (fallback) {
    return {
      ...english,
      handoutLanguage: 'en',
      translationProvider: meta.provider,
      translationModel: meta.model,
      translationValidationStatus: meta.validation.status,
      translationRequiresReview: 'true',
      translationFallback: 'true',
      translationMessage: HANDOUT_TRANSLATION_FALLBACK_MESSAGE,
      translationStale: 'false',
      requestedHandoutLanguage: lang,
    };
  }

  const condition = summary.confirmed_assessment.display_name;
  const questionsContact =
    questionsContactLine(
      translated.pharmacy_details.name,
      translated.pharmacy_details.phone,
      lang,
      translated.pharmacy_details.address ?? summary.pharmacy_details.address,
    ) ||
    translated.pharmacy_details.name ||
    translated.pharmacy_details.phone ||
    '';

  return {
    documentTitle: carePlanTitle(condition, lang),
    diagnosis: condition ?? '',
    assessment: translated.assessment.join('\n'),
    treatment: mergeMedicationUseIntoTreatment(
      translated.treatments
        .map((t) =>
          t.patient_directions
            ? `${t.display_name}: ${t.patient_directions}`
            : t.display_name,
        )
        .join('\n'),
      summary.confirmed_counselling.MEDICATION_USE,
    ),
    expectedResponse: translated.expected_response.join('\n'),
    selfCare: translated.self_care.join('\n'),
    seekCare: translated.seek_care.join('\n'),
    followUp: translated.follow_up.join('\n'),
    questionsContact,
    handoutLanguage: lang,
    handoutStatus: summary.status,
    handoutSourceHash: meta.sourceHash,
    translationProvider: meta.provider,
    translationModel: meta.model,
    translationValidationStatus: 'ok',
    translationRequiresReview: 'true',
    translationFallback: 'false',
    translationMessage: HANDOUT_TRANSLATION_REVIEW_MESSAGE,
    translationStale: 'false',
    requestedHandoutLanguage: lang,
  };
}

export function validateTranslatedHandout(
  source: CanonicalHandoutTranslationPayload,
  translated: CanonicalHandoutTranslationPayload,
): HandoutTranslationValidation {
  const reasons: string[] = [];
  if (!isSupportedHandoutLanguage(translated.target_language)) {
    return {
      ok: false,
      reasons: ['unsupported language'],
      status: 'unsupported_language',
    };
  }
  if (translated.treatments.length !== source.treatments.length) {
    reasons.push(
      `treatment count ${translated.treatments.length} != ${source.treatments.length}`,
    );
  }
  source.treatments.forEach((src, i) => {
    const dst = translated.treatments[i];
    if (!dst) return;
    if (dst.display_name !== src.display_name) {
      reasons.push(`display_name changed for treatment ${i + 1}`);
    }
    if (!sameMultiset(extractNumbers(src.patient_directions), extractNumbers(dst.patient_directions))) {
      reasons.push(`numbers changed for ${src.display_name}`);
    }
    const srcUnits = src.patient_directions.match(DOSE_RE) ?? [];
    for (const unit of srcUnits) {
      if (!dst.patient_directions.includes(unit.replace(/\s+/g, ' ').trim()) &&
          !dst.patient_directions.includes(unit)) {
        const compact = unit.replace(/\s+/g, '');
        if (!dst.patient_directions.replace(/\s+/g, '').includes(compact)) {
          reasons.push(`dose/unit missing for ${src.display_name}: ${unit}`);
        }
      }
    }
  });

  const countCheck = (
    label: string,
    a: string[],
    b: string[],
  ) => {
    if (a.length !== b.length) reasons.push(`${label} count ${b.length} != ${a.length}`);
    if (a.length === 0 && b.some((x) => x.trim())) {
      reasons.push(`${label} invented`);
    }
  };
  countCheck('expected_response', source.expected_response, translated.expected_response);
  countCheck('self_care', source.self_care, translated.self_care);
  countCheck('seek_care', source.seek_care, translated.seek_care);
  countCheck('follow_up', source.follow_up, translated.follow_up);

  if ((source.pharmacy_details.name ?? '') !== (translated.pharmacy_details.name ?? '')) {
    reasons.push('pharmacy name changed');
  }
  if ((source.pharmacy_details.phone ?? '') !== (translated.pharmacy_details.phone ?? '')) {
    reasons.push('pharmacy phone changed');
  }
  if ((source.pharmacy_details.address ?? '') !== (translated.pharmacy_details.address ?? '')) {
    reasons.push('pharmacy address changed');
  }

  const haystack = [
    ...translated.assessment,
    ...translated.treatments.map((t) => t.patient_directions),
    ...translated.expected_response,
    ...translated.self_care,
    ...translated.seek_care,
    ...translated.follow_up,
  ].join('\n');
  if (INTERNAL_META.test(haystack)) reasons.push('internal identifier leaked');
  if (haystack.includes(TOKEN_OPEN) || haystack.includes('[[SS')) {
    reasons.push('unrestored translation token');
  }

  return {
    ok: reasons.length === 0,
    reasons,
    status: reasons.length === 0 ? 'ok' : 'failed_fallback_en',
  };
}

interface TranslateUnit {
  id: string;
  text: string;
  apply: (translated: string) => void;
}

function collectTranslateUnits(
  working: CanonicalHandoutTranslationPayload,
): TranslateUnit[] {
  const names = working.treatments.map((t) => t.display_name).filter(Boolean);
  const phones = working.pharmacy_details.phone
    ? [working.pharmacy_details.phone]
    : [];
  const extras = {
    names,
    phones,
    pharmacyName: working.pharmacy_details.name,
  };
  const units: TranslateUnit[] = [];

  const push = (
    id: string,
    source: string,
    apply: (translated: string) => void,
  ) => {
    const trimmed = source.trim();
    if (!trimmed) return;
    const protectedText = tokenizeProtectedText(trimmed, extras);
    units.push({
      id,
      text: protectedText.text,
      apply: (translated) => {
        apply(
          restoreProtectedTokens(
            translated,
            protectedText.tokens,
            working.target_language,
          ),
        );
      },
    });
  };

  working.assessment.forEach((item, i) => {
    push(`assessment:${i}`, item, (t) => {
      working.assessment[i] = t;
    });
  });
  working.treatments.forEach((item, i) => {
    push(`directions:${i}`, item.patient_directions, (t) => {
      working.treatments[i] = {
        display_name: item.display_name,
        patient_directions: t,
      };
    });
  });
  working.expected_response.forEach((item, i) => {
    push(`expected:${i}`, item, (t) => {
      working.expected_response[i] = t;
    });
  });
  working.self_care.forEach((item, i) => {
    push(`self:${i}`, item, (t) => {
      working.self_care[i] = t;
    });
  });
  working.seek_care.forEach((item, i) => {
    push(`seek:${i}`, item, (t) => {
      working.seek_care[i] = t;
    });
  });
  working.follow_up.forEach((item, i) => {
    push(`follow:${i}`, item, (t) => {
      working.follow_up[i] = t;
    });
  });

  return units;
}

function cloneCanonical(
  payload: CanonicalHandoutTranslationPayload,
  targetLanguage: string,
): CanonicalHandoutTranslationPayload {
  return {
    source_language: 'en',
    target_language: normalizeHandoutLanguage(targetLanguage),
    assessment: [...payload.assessment],
    treatments: payload.treatments.map((t) => ({ ...t })),
    expected_response: [...payload.expected_response],
    self_care: [...payload.self_care],
    seek_care: [...payload.seek_care],
    follow_up: [...payload.follow_up],
    pharmacy_details: { ...payload.pharmacy_details },
  };
}

async function runTranslationPass(
  source: CanonicalHandoutTranslationPayload,
  targetLanguage: string,
  translateTexts: TranslateTextsFn,
): Promise<CanonicalHandoutTranslationPayload> {
  const working = cloneCanonical(source, targetLanguage);
  const units = collectTranslateUnits(working);
  if (!units.length) return working;
  const translated = await translateTexts(
    units.map((u) => u.text),
    googleTranslateLanguageCode(targetLanguage),
  );
  if (translated.length !== units.length) {
    throw new Error('translation unit count mismatch');
  }
  units.forEach((unit, i) => unit.apply(translated[i] ?? ''));
  return working;
}

export async function translateCanonicalHandout(
  source: CanonicalHandoutTranslationPayload,
  targetLanguage: string,
  translateTexts: TranslateTextsFn,
): Promise<{
  payload: CanonicalHandoutTranslationPayload;
  validation: HandoutTranslationValidation;
  retried: boolean;
}> {
  if (!isSupportedHandoutLanguage(targetLanguage)) {
    return {
      payload: cloneCanonical(source, 'en'),
      validation: {
        ok: false,
        reasons: ['unsupported language'],
        status: 'unsupported_language',
      },
      retried: false,
    };
  }
  const lang = normalizeHandoutLanguage(targetLanguage);
  if (lang === 'en') {
    return {
      payload: cloneCanonical(source, 'en'),
      validation: { ok: true, reasons: [], status: 'ok' },
      retried: false,
    };
  }

  let translated = await runTranslationPass(source, lang, translateTexts);
  let validation = validateTranslatedHandout(source, translated);
  let retried = false;
  if (!validation.ok) {
    retried = true;
    translated = await runTranslationPass(source, lang, translateTexts);
    validation = validateTranslatedHandout(source, translated);
  }
  return { payload: translated, validation, retried };
}

export function isReusableHandoutTranslation(
  fields: Record<string, string> | undefined,
  language: string,
  sourceHash: string,
): boolean {
  if (!fields) return false;
  const lang = normalizeHandoutLanguage(language);
  if (lang === 'en') return false;
  return (
    normalizeHandoutLanguage(fields.handoutLanguage) === lang &&
    (fields.handoutSourceHash || '').trim() === sourceHash &&
    fields.translationValidationStatus === 'ok' &&
    fields.translationStale !== 'true' &&
    fields.translationFallback !== 'true'
  );
}

export function cacheableHandoutTranslationFields(
  fields: Record<string, string>,
): Record<string, string> {
  const next = { ...fields };
  delete next.documentHtml;
  return next;
}

export function isHandoutTranslationStale(
  fields: Record<string, string> | undefined,
  currentHash: string,
): boolean {
  if (!fields) return false;
  const lang = normalizeHandoutLanguage(fields.handoutLanguage);
  if (lang === 'en') return false;
  const stored = fields.handoutSourceHash?.trim();
  if (!stored) return true;
  return stored !== currentHash || fields.translationStale === 'true';
}

export const HANDOUT_TRANSLATION_META_KEYS = [
  'handoutSourceHash',
  'translationProvider',
  'translationModel',
  'translationGlossaryVersion',
  'translationValidationStatus',
  'translationRequiresReview',
  'translationFallback',
  'translationMessage',
  'translationStale',
  'requestedHandoutLanguage',
] as const;

export function handoutTranslationBanner(
  fields: Record<string, string> | undefined,
): { tone: 'review' | 'fallback' | 'stale'; message: string } | null {
  if (!fields) return null;
  const lang = normalizeHandoutLanguage(fields.handoutLanguage);
  if (fields.translationFallback === 'true') {
    return { tone: 'fallback', message: HANDOUT_TRANSLATION_FALLBACK_MESSAGE };
  }
  if (fields.translationStale === 'true') {
    return { tone: 'stale', message: HANDOUT_TRANSLATION_STALE_MESSAGE };
  }
  if (lang !== 'en' && fields.translationRequiresReview !== 'false') {
    return { tone: 'review', message: HANDOUT_TRANSLATION_REVIEW_MESSAGE };
  }
  return null;
}

export type { PatientHandoutSectionKey };
