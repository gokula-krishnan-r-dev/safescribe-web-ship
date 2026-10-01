/**
 * Curated Patient Care Summary languages (Canadian pharmacy consults).
 * Do not use Google Translate’s full language list in the product UI.
 */

import { formatDocumentFaxNumber } from './pcp-communication';

export type HandoutLanguageDir = 'ltr' | 'rtl';
export type HandoutLanguagePhase = 1 | 2;

export type PatientHandoutSectionKey =
  | 'assessment'
  | 'treatment'
  | 'expectedResponse'
  | 'selfCare'
  | 'seekCare'
  | 'followUp'
  | 'questionsContact';

export const PATIENT_HANDOUT_SECTION_KEYS = [
  'assessment',
  'treatment',
  'expectedResponse',
  'selfCare',
  'seekCare',
  'followUp',
  'questionsContact',
] as const satisfies readonly PatientHandoutSectionKey[];

export interface HandoutLanguageOption {
  value: string;
  label: string;
  nativeLabel: string;
  dir: HandoutLanguageDir;
  phase: HandoutLanguagePhase;
  /** BCP-47 / Google Cloud Translation target code */
  googleCode: string;
}

const L = (
  value: string,
  label: string,
  nativeLabel: string,
  dir: HandoutLanguageDir,
  phase: HandoutLanguagePhase,
  googleCode = value,
): HandoutLanguageOption => ({
  value,
  label,
  nativeLabel,
  dir,
  phase,
  googleCode,
});

/**
 * Suggested dropdown order: high-priority Canadian communities, then
 * a “More languages” group for phase 2.
 */
export const HANDOUT_LANGUAGES: readonly HandoutLanguageOption[] = [
  L('en', 'English', 'English', 'ltr', 1),
  L('fr-CA', 'French (Canada)', 'Français (Canada)', 'ltr', 1, 'fr-CA'),
  L('pa', 'Punjabi', 'ਪੰਜਾਬੀ', 'ltr', 1, 'pa'),
  L('zh-CN', 'Chinese (Simplified)', '简体中文', 'ltr', 1, 'zh-CN'),
  L('zh-TW', 'Chinese (Traditional)', '繁體中文', 'ltr', 1, 'zh-TW'),
  L('hi', 'Hindi', 'हिन्दी', 'ltr', 1, 'hi'),
  L('ar', 'Arabic', 'العربية', 'rtl', 1, 'ar'),
  L('ur', 'Urdu', 'اردو', 'rtl', 1, 'ur'),
  L('es', 'Spanish', 'Español', 'ltr', 1, 'es'),
  L('fil', 'Tagalog (Filipino)', 'Tagalog', 'ltr', 1, 'fil'),
  L('ta', 'Tamil', 'தமிழ்', 'ltr', 1, 'ta'),
  L('gu', 'Gujarati', 'ગુજરાતી', 'ltr', 1, 'gu'),
  L('bn', 'Bengali', 'বাংলা', 'ltr', 1, 'bn'),
  L('vi', 'Vietnamese', 'Tiếng Việt', 'ltr', 1, 'vi'),
  L('ko', 'Korean', '한국어', 'ltr', 1, 'ko'),
  L('fa', 'Persian (Farsi)', 'فارسی', 'rtl', 2, 'fa'),
  L('uk', 'Ukrainian', 'Українська', 'ltr', 2, 'uk'),
  L('ru', 'Russian', 'Русский', 'ltr', 2, 'ru'),
  L('pt', 'Portuguese', 'Português', 'ltr', 2, 'pt'),
  L('it', 'Italian', 'Italiano', 'ltr', 2, 'it'),
  L('pl', 'Polish', 'Polski', 'ltr', 2, 'pl'),
];

/** Alias used by Documents / counselling UI. */
export const HANDOUT_LANGUAGE_OPTIONS = HANDOUT_LANGUAGES;

const BY_VALUE = new Map(HANDOUT_LANGUAGES.map((l) => [l.value.toLowerCase(), l]));

const ALIASES: Record<string, string> = {
  en: 'en',
  eng: 'en',
  english: 'en',
  fr: 'fr-CA',
  'fr-ca': 'fr-CA',
  'fr-fr': 'fr-CA',
  french: 'fr-CA',
  es: 'es',
  'es-es': 'es',
  'es-mx': 'es',
  spanish: 'es',
  zh: 'zh-CN',
  'zh-cn': 'zh-CN',
  'zh-hans': 'zh-CN',
  'zh-sg': 'zh-CN',
  chinese: 'zh-CN',
  'chinese (simplified)': 'zh-CN',
  'zh-tw': 'zh-TW',
  'zh-hant': 'zh-TW',
  'zh-hk': 'zh-TW',
  'chinese (traditional)': 'zh-TW',
  pa: 'pa',
  pan: 'pa',
  punjabi: 'pa',
  hi: 'hi',
  hin: 'hi',
  hindi: 'hi',
  ur: 'ur',
  urd: 'ur',
  urdu: 'ur',
  ar: 'ar',
  ara: 'ar',
  arabic: 'ar',
  fil: 'fil',
  tl: 'fil',
  tgl: 'fil',
  tagalog: 'fil',
  filipino: 'fil',
  ta: 'ta',
  tam: 'ta',
  tamil: 'ta',
  gu: 'gu',
  guj: 'gu',
  gujarati: 'gu',
  bn: 'bn',
  ben: 'bn',
  bengali: 'bn',
  bangla: 'bn',
  vi: 'vi',
  vie: 'vi',
  vietnamese: 'vi',
  ko: 'ko',
  kor: 'ko',
  korean: 'ko',
  fa: 'fa',
  fas: 'fa',
  per: 'fa',
  farsi: 'fa',
  persian: 'fa',
  uk: 'uk',
  ukr: 'uk',
  ukrainian: 'uk',
  ru: 'ru',
  rus: 'ru',
  russian: 'ru',
  pt: 'pt',
  por: 'pt',
  portuguese: 'pt',
  it: 'it',
  ita: 'it',
  italian: 'it',
  pl: 'pl',
  pol: 'pl',
  polish: 'pl',
};

export function isSupportedHandoutLanguage(value?: string | null): boolean {
  const raw = (value ?? '').trim().toLowerCase();
  if (!raw) return false;
  if (BY_VALUE.has(raw)) return true;
  if (ALIASES[raw]) return true;
  const prefix = raw.split(/[-_]/)[0];
  return Boolean(ALIASES[prefix]);
}

export function normalizeHandoutLanguage(value?: string | null): string {
  const raw = (value ?? 'en').trim();
  if (!raw) return 'en';
  const lower = raw.toLowerCase();
  if (BY_VALUE.has(lower)) return BY_VALUE.get(lower)!.value;
  if (ALIASES[lower]) return ALIASES[lower];
  const prefix = lower.split(/[-_]/)[0];
  if (ALIASES[prefix]) return ALIASES[prefix];
  return 'en';
}

export function handoutLanguageOption(
  value?: string | null,
): HandoutLanguageOption {
  const code = normalizeHandoutLanguage(value);
  return BY_VALUE.get(code.toLowerCase()) ?? HANDOUT_LANGUAGES[0];
}

export function isRtlHandoutLanguage(value?: string | null): boolean {
  return handoutLanguageOption(value).dir === 'rtl';
}

export function googleTranslateLanguageCode(value?: string | null): string {
  return handoutLanguageOption(value).googleCode;
}

export function handoutLanguagesPhase1(): HandoutLanguageOption[] {
  return HANDOUT_LANGUAGES.filter((l) => l.phase === 1);
}

export function handoutLanguagesPhase2(): HandoutLanguageOption[] {
  return HANDOUT_LANGUAGES.filter((l) => l.phase === 2);
}

export function handoutLanguageMenuLabel(option: HandoutLanguageOption): string {
  if (!option.nativeLabel || option.nativeLabel === option.label) return option.label;
  return `${option.label} — ${option.nativeLabel}`;
}

export interface HandoutChrome {
  carePlanSuffix: string;
  assessmentTemplate: string;
  contactBoth: string;
  contactOne: string;
  /** Intro line for structured pharmacy contact. Falls back to English. */
  contactCallUs?: string;
  /** Phone line, `{phone}` placeholder. Falls back to English `Tel: {phone}`. */
  contactTel?: string;
  sections: Record<PatientHandoutSectionKey, string>;
}

const EN_CHROME: HandoutChrome = {
  carePlanSuffix: 'Your Care Plan',
  assessmentTemplate: 'Your symptoms are consistent with {condition}.',
  contactBoth: 'Contact {name} at {phone}.',
  contactOne: 'Contact {who}.',
  contactCallUs: 'Call us at:',
  contactTel: 'Tel: {phone}',
  sections: {
    assessment: 'Your assessment',
    treatment: 'How to use your medicine',
    expectedResponse: 'What to expect',
    selfCare: 'Self-care & non-drug measures',
    seekCare: 'When to get medical help',
    followUp: 'Follow-up',
    questionsContact: 'Questions?',
  },
};

const CHROME: Record<string, HandoutChrome> = {
  en: EN_CHROME,
  'fr-CA': {
    carePlanSuffix: 'Votre plan de soins',
    assessmentTemplate: 'Vos symptômes correspondent à {condition}.',
    contactBoth: 'Communiquez avec {name} au {phone}.',
    contactOne: 'Communiquez avec {who}.',
    contactCallUs: 'Appelez-nous :',
    contactTel: 'Tél. : {phone}',
    sections: {
      assessment: 'Votre évaluation',
      treatment: 'Votre traitement',
      expectedResponse: 'À quoi s’attendre',
      selfCare: 'Ce que vous pouvez faire',
      seekCare: 'Quand obtenir de l’aide médicale',
      followUp: 'Suivi',
      questionsContact: 'Des questions?',
    },
  },
  es: {
    carePlanSuffix: 'Su plan de atención',
    assessmentTemplate: 'Sus síntomas son compatibles con {condition}.',
    contactBoth: 'Comuníquese con {name} al {phone}.',
    contactOne: 'Comuníquese con {who}.',
    contactCallUs: 'Llámenos:',
    contactTel: 'Tel.: {phone}',
    sections: {
      assessment: 'Su evaluación',
      treatment: 'Su tratamiento',
      expectedResponse: 'Qué esperar',
      selfCare: 'Cosas que puede hacer',
      seekCare: 'Cuándo buscar ayuda médica',
      followUp: 'Seguimiento',
      questionsContact: '¿Preguntas?',
    },
  },
  'zh-CN': {
    carePlanSuffix: '您的护理计划',
    assessmentTemplate: '您的症状符合{condition}。',
    contactBoth: '请联系 {name}（{phone}）。',
    contactOne: '请联系 {who}。',
    sections: {
      assessment: '您的评估',
      treatment: '您的治疗',
      expectedResponse: '预期效果',
      selfCare: '您可以做的事',
      seekCare: '何时寻求医疗帮助',
      followUp: '随访',
      questionsContact: '有疑问？',
    },
  },
  'zh-TW': {
    carePlanSuffix: '您的照護計畫',
    assessmentTemplate: '您的症狀符合{condition}。',
    contactBoth: '請聯絡 {name}（{phone}）。',
    contactOne: '請聯絡 {who}。',
    sections: {
      assessment: '您的評估',
      treatment: '您的治療',
      expectedResponse: '預期效果',
      selfCare: '您可以做的事',
      seekCare: '何時尋求醫療協助',
      followUp: '追蹤',
      questionsContact: '有疑問？',
    },
  },
  pa: {
    carePlanSuffix: 'ਤੁਹਾਡੀ ਦੇਖਭਾਲ ਯੋਜਨਾ',
    assessmentTemplate: 'ਤੁਹਾਡੇ ਲੱਛਣ {condition} ਨਾਲ ਮੇਲ ਖਾਂਦੇ ਹਨ।',
    contactBoth: '{name} ਨਾਲ {phone} ਤੇ ਸੰਪਰਕ ਕਰੋ।',
    contactOne: '{who} ਨਾਲ ਸੰਪਰਕ ਕਰੋ।',
    sections: {
      assessment: 'ਤੁਹਾਡੀ ਮੁਲਾਂਕਣ',
      treatment: 'ਤੁਹਾਡਾ ਇਲਾਜ',
      expectedResponse: 'ਕੀ ਉਮੀਦ ਕਰਨੀ ਹੈ',
      selfCare: 'ਤੁਸੀਂ ਕੀ ਕਰ ਸਕਦੇ ਹੋ',
      seekCare: 'ਮੈਡੀਕਲ ਮਦਦ ਕਦੋਂ ਲੈਣੀ ਹੈ',
      followUp: 'ਫਾਲੋ-ਅੱਪ',
      questionsContact: 'ਸਵਾਲ?',
    },
  },
  hi: {
    carePlanSuffix: 'आपकी देखभाल योजना',
    assessmentTemplate: 'आपके लक्षण {condition} से मेल खाते हैं।',
    contactBoth: '{name} से {phone} पर संपर्क करें।',
    contactOne: '{who} से संपर्क करें।',
    sections: {
      assessment: 'आपका आकलन',
      treatment: 'आपका उपचार',
      expectedResponse: 'क्या अपेक्षा करें',
      selfCare: 'आप क्या कर सकते हैं',
      seekCare: 'चिकित्सा सहायता कब लें',
      followUp: 'फॉलो-अप',
      questionsContact: 'प्रश्न?',
    },
  },
  ar: {
    carePlanSuffix: 'خطة رعايتك',
    assessmentTemplate: 'أعراضك تتوافق مع {condition}.',
    contactBoth: 'تواصل مع {name} على {phone}.',
    contactOne: 'تواصل مع {who}.',
    sections: {
      assessment: 'تقييمك',
      treatment: 'علاجك',
      expectedResponse: 'ما يمكن توقعه',
      selfCare: 'أشياء يمكنك القيام بها',
      seekCare: 'متى تطلب المساعدة الطبية',
      followUp: 'المتابعة',
      questionsContact: 'أسئلة؟',
    },
  },
  ur: {
    carePlanSuffix: 'آپ کا نگہداشت منصوبہ',
    assessmentTemplate: 'آپ کی علامات {condition} سے مطابقت رکھتی ہیں۔',
    contactBoth: '{name} سے {phone} پر رابطہ کریں۔',
    contactOne: '{who} سے رابطہ کریں۔',
    sections: {
      assessment: 'آپ کا جائزہ',
      treatment: 'آپ کا علاج',
      expectedResponse: 'کیا توقع کریں',
      selfCare: 'آپ کیا کر سکتے ہیں',
      seekCare: 'طبی مدد کب لیں',
      followUp: 'فالو اپ',
      questionsContact: 'سوالات؟',
    },
  },
  fil: {
    carePlanSuffix: 'Ang iyong plano sa pangangalaga',
    assessmentTemplate: 'Ang iyong mga sintomas ay tumutugma sa {condition}.',
    contactBoth: 'Makipag-ugnayan kay {name} sa {phone}.',
    contactOne: 'Makipag-ugnayan kay {who}.',
    sections: {
      assessment: 'Ang iyong pagtatasa',
      treatment: 'Ang iyong paggamot',
      expectedResponse: 'Ano ang aasahan',
      selfCare: 'Mga maaari mong gawin',
      seekCare: 'Kailan hihingi ng tulong medikal',
      followUp: 'Follow-up',
      questionsContact: 'Mga tanong?',
    },
  },
  ta: {
    carePlanSuffix: 'உங்கள் பராமரிப்பு திட்டம்',
    assessmentTemplate: 'உங்கள் அறிகுறிகள் {condition} உடன் பொருந்துகின்றன.',
    contactBoth: '{name} ஐ {phone} இல் தொடர்பு கொள்ளவும்.',
    contactOne: '{who} ஐ தொடர்பு கொள்ளவும்.',
    sections: {
      assessment: 'உங்கள் மதிப்பீடு',
      treatment: 'உங்கள் சிகிச்சை',
      expectedResponse: 'என்ன எதிர்பார்க்கலாம்',
      selfCare: 'நீங்கள் செய்யக்கூடியவை',
      seekCare: 'மருத்துவ உதவி எப்போது பெறுவது',
      followUp: 'பின்தொடர்தல்',
      questionsContact: 'கேள்விகள்?',
    },
  },
  gu: {
    carePlanSuffix: 'તમારી સંભાળ યોજના',
    assessmentTemplate: 'તમારા લક્ષણો {condition} સાથે મેળ ખાય છે.',
    contactBoth: '{name} ને {phone} પર સંપર્ક કરો.',
    contactOne: '{who} ને સંપર્ક કરો.',
    sections: {
      assessment: 'તમારું મૂલ્યાંકન',
      treatment: 'તમારી સારવાર',
      expectedResponse: 'શું અપેક્ષા રાખવી',
      selfCare: 'તમે શું કરી શકો',
      seekCare: 'તબીબી મદદ ક્યારે લેવી',
      followUp: 'ફોલો-અપ',
      questionsContact: 'પ્રશ્નો?',
    },
  },
  bn: {
    carePlanSuffix: 'আপনার যত্ন পরিকল্পনা',
    assessmentTemplate: 'আপনার লক্ষণ {condition} এর সাথে মিলে যায়।',
    contactBoth: '{name} এর সাথে {phone} নম্বরে যোগাযোগ করুন।',
    contactOne: '{who} এর সাথে যোগাযোগ করুন।',
    sections: {
      assessment: 'আপনার মূল্যায়ন',
      treatment: 'আপনার চিকিৎসা',
      expectedResponse: 'কী আশা করবেন',
      selfCare: 'আপনি যা করতে পারেন',
      seekCare: 'কখন চিকিৎসা সাহায্য নিতে হবে',
      followUp: 'ফলো-আপ',
      questionsContact: 'প্রশ্ন?',
    },
  },
  vi: {
    carePlanSuffix: 'Kế hoạch chăm sóc của bạn',
    assessmentTemplate: 'Các triệu chứng của bạn phù hợp với {condition}.',
    contactBoth: 'Liên hệ {name} theo số {phone}.',
    contactOne: 'Liên hệ {who}.',
    sections: {
      assessment: 'Đánh giá của bạn',
      treatment: 'Điều trị của bạn',
      expectedResponse: 'Điều cần mong đợi',
      selfCare: 'Những việc bạn có thể làm',
      seekCare: 'Khi nào cần hỗ trợ y tế',
      followUp: 'Tái khám',
      questionsContact: 'Câu hỏi?',
    },
  },
  ko: {
    carePlanSuffix: '귀하의 치료 계획',
    assessmentTemplate: '증상은 {condition}과(와) 일치합니다.',
    contactBoth: '{name}에 {phone}(으)로 문의하세요.',
    contactOne: '{who}에 문의하세요.',
    sections: {
      assessment: '평가',
      treatment: '치료',
      expectedResponse: '예상되는 경과',
      selfCare: '직접 할 수 있는 일',
      seekCare: '진료가 필요할 때',
      followUp: '추적 관찰',
      questionsContact: '문의',
    },
  },
  fa: {
    carePlanSuffix: 'برنامه مراقبت شما',
    assessmentTemplate: 'علائم شما با {condition} مطابقت دارد.',
    contactBoth: 'با {name} به شماره {phone} تماس بگیرید.',
    contactOne: 'با {who} تماس بگیرید.',
    sections: {
      assessment: 'ارزیابی شما',
      treatment: 'درمان شما',
      expectedResponse: 'چه انتظاری داشته باشید',
      selfCare: 'کارهایی که می‌توانید انجام دهید',
      seekCare: 'چه زمانی کمک پزشکی بگیرید',
      followUp: 'پیگیری',
      questionsContact: 'پرسش‌ها؟',
    },
  },
  uk: {
    carePlanSuffix: 'Ваш план догляду',
    assessmentTemplate: 'Ваші симптоми відповідають {condition}.',
    contactBoth: 'Зв’яжіться з {name} за номером {phone}.',
    contactOne: 'Зв’яжіться з {who}.',
    sections: {
      assessment: 'Ваша оцінка',
      treatment: 'Ваше лікування',
      expectedResponse: 'Чого очікувати',
      selfCare: 'Що ви можете зробити',
      seekCare: 'Коли звертатися по медичну допомогу',
      followUp: 'Подальше спостереження',
      questionsContact: 'Запитання?',
    },
  },
  ru: {
    carePlanSuffix: 'Ваш план ухода',
    assessmentTemplate: 'Ваши симптомы соответствуют {condition}.',
    contactBoth: 'Свяжитесь с {name} по телефону {phone}.',
    contactOne: 'Свяжитесь с {who}.',
    sections: {
      assessment: 'Ваша оценка',
      treatment: 'Ваше лечение',
      expectedResponse: 'Чего ожидать',
      selfCare: 'Что вы можете сделать',
      seekCare: 'Когда обращаться за медицинской помощью',
      followUp: 'Наблюдение',
      questionsContact: 'Вопросы?',
    },
  },
  pt: {
    carePlanSuffix: 'O seu plano de cuidados',
    assessmentTemplate: 'Os seus sintomas são compatíveis com {condition}.',
    contactBoth: 'Contacte {name} através do {phone}.',
    contactOne: 'Contacte {who}.',
    sections: {
      assessment: 'A sua avaliação',
      treatment: 'O seu tratamento',
      expectedResponse: 'O que esperar',
      selfCare: 'O que pode fazer',
      seekCare: 'Quando procurar ajuda médica',
      followUp: 'Seguimento',
      questionsContact: 'Perguntas?',
    },
  },
  it: {
    carePlanSuffix: 'Il tuo piano di cura',
    assessmentTemplate: 'I tuoi sintomi sono compatibili con {condition}.',
    contactBoth: 'Contatta {name} al {phone}.',
    contactOne: 'Contatta {who}.',
    sections: {
      assessment: 'La tua valutazione',
      treatment: 'Il tuo trattamento',
      expectedResponse: 'Cosa aspettarsi',
      selfCare: 'Cose che puoi fare',
      seekCare: 'Quando chiedere aiuto medico',
      followUp: 'Follow-up',
      questionsContact: 'Domande?',
    },
  },
  pl: {
    carePlanSuffix: 'Twój plan opieki',
    assessmentTemplate: 'Twoje objawy odpowiadają {condition}.',
    contactBoth: 'Skontaktuj się z {name} pod numerem {phone}.',
    contactOne: 'Skontaktuj się z {who}.',
    sections: {
      assessment: 'Twoja ocena',
      treatment: 'Twoje leczenie',
      expectedResponse: 'Czego się spodziewać',
      selfCare: 'Co możesz zrobić',
      seekCare: 'Kiedy szukać pomocy medycznej',
      followUp: 'Kontynuacja',
      questionsContact: 'Pytania?',
    },
  },
};

export function handoutChrome(language?: string | null): HandoutChrome {
  const code = normalizeHandoutLanguage(language);
  const chrome = CHROME[code] ?? EN_CHROME;
  return {
    ...EN_CHROME,
    ...chrome,
    contactCallUs: chrome.contactCallUs ?? EN_CHROME.contactCallUs,
    contactTel: chrome.contactTel ?? EN_CHROME.contactTel,
    sections: { ...EN_CHROME.sections, ...chrome.sections },
  };
}

export function carePlanTitle(
  condition?: string | null,
  language?: string | null,
): string {
  const suffix = handoutChrome(language).carePlanSuffix;
  const name = condition?.trim();
  return name ? `${name} — ${suffix}` : suffix;
}

export function assessmentSentence(
  condition?: string | null,
  language?: string | null,
): string {
  const name = condition?.trim();
  if (!name) return '';
  const lowered =
    name === name.toUpperCase()
      ? name
      : name.charAt(0).toLowerCase() + name.slice(1);
  const template = handoutChrome(language).assessmentTemplate;
  const lang = normalizeHandoutLanguage(language);
  const useLowered =
    lang === 'en' || lang === 'fr-CA' || lang === 'es' || lang === 'pt' || lang === 'it';
  return template.replace('{condition}', useLowered ? lowered : name);
}

export function questionsContactLine(
  pharmacyName?: string | null,
  pharmacyPhone?: string | null,
  language?: string | null,
  pharmacyAddress?: string | null,
): string {
  const name = pharmacyName?.trim() ?? '';
  const phone = formatHandoutPhone(pharmacyPhone);
  const address = normalizePharmacyAddress(pharmacyAddress);
  if (!name && !phone && !address) return '';

  const chrome = handoutChrome(language);
  const callUs = chrome.contactCallUs ?? 'Call us at:';
  const telTemplate = chrome.contactTel ?? 'Tel: {phone}';
  const identity = formatPharmacyIdentity(name, address);

  const lines: string[] = [];
  if (phone) {
    lines.push(callUs);
    lines.push(telTemplate.replace('{phone}', phone));
  }
  if (identity) lines.push(identity);
  return lines.join('\n');
}

function formatHandoutPhone(raw?: string | null): string {
  const formatted = formatDocumentFaxNumber(raw);
  if (formatted) return formatted;
  return String(raw ?? '').trim();
}

function normalizePharmacyAddress(raw?: string | null): string {
  return (raw ?? '')
    .replace(/\s*\n+\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .replace(/[.,;]+$/, '')
    .trim();
}

function formatPharmacyIdentity(name: string, address: string): string {
  if (name && address) {
    const foldedName = name.toLowerCase();
    const foldedAddr = address.toLowerCase();
    if (foldedAddr === foldedName || foldedAddr.startsWith(`${foldedName},`)) {
      return address;
    }
    return `${name}, ${address}`;
  }
  return name || address;
}

export function handoutSectionLabel(
  key: PatientHandoutSectionKey,
  language?: string | null,
): string {
  return handoutChrome(language).sections[key] ?? EN_CHROME.sections[key];
}
