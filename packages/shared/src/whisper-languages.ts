/**
 * Whisper-supported spoken languages (OpenAI Whisper / Large v3).
 * Translation target is always English — Whisper's translations API only
 * emits English.
 */

export const WHISPER_TRANSLATION_TARGET = 'en' as const;
export const WHISPER_AUTO_LANGUAGE = 'auto' as const;

export type WhisperLanguageCode = string;

export interface WhisperLanguageOption {
  /** ISO 639-1 (or 639-3 for haw/yue) as accepted by Whisper */
  code: string;
  name: string;
  nativeName: string;
  /** BCP-47 tag for Web Speech / device recognizers */
  bcp47: string;
  /** speech_to_text / Android localeId (underscore) */
  localeId: string;
  rtl?: boolean;
  /** Shown first in Canadian pharmacy consults */
  featured?: boolean;
}

const L = (
  code: string,
  name: string,
  nativeName: string,
  bcp47: string,
  extra?: { rtl?: boolean; featured?: boolean },
): WhisperLanguageOption => ({
  code,
  name,
  nativeName,
  bcp47,
  localeId: bcp47.replace(/-/g, '_'),
  rtl: extra?.rtl,
  featured: extra?.featured,
});

/**
 * Official Whisper language set (tokenizer LANGUAGES + Cantonese).
 * Do not add codes Whisper cannot decode.
 */
export const WHISPER_LANGUAGES: readonly WhisperLanguageOption[] = [
  L('en', 'English', 'English', 'en-CA', { featured: true }),
  L('fr', 'French', 'Français', 'fr-CA', { featured: true }),
  L('pa', 'Punjabi', 'ਪੰਜਾਬੀ', 'pa-IN', { featured: true }),
  L('hi', 'Hindi', 'हिन्दी', 'hi-IN', { featured: true }),
  L('zh', 'Chinese (Mandarin)', '中文', 'zh-CN', { featured: true }),
  L('yue', 'Cantonese', '粵語', 'zh-HK', { featured: true }),
  L('ar', 'Arabic', 'العربية', 'ar-SA', { rtl: true, featured: true }),
  L('es', 'Spanish', 'Español', 'es-ES', { featured: true }),
  L('tl', 'Tagalog', 'Tagalog', 'fil-PH', { featured: true }),
  L('uk', 'Ukrainian', 'Українська', 'uk-UA', { featured: true }),
  L('ur', 'Urdu', 'اردو', 'ur-PK', { rtl: true, featured: true }),
  L('fa', 'Persian', 'فارسی', 'fa-IR', { rtl: true, featured: true }),
  L('ko', 'Korean', '한국어', 'ko-KR', { featured: true }),
  L('vi', 'Vietnamese', 'Tiếng Việt', 'vi-VN', { featured: true }),
  L('de', 'German', 'Deutsch', 'de-DE', { featured: true }),
  L('it', 'Italian', 'Italiano', 'it-IT', { featured: true }),
  L('pt', 'Portuguese', 'Português', 'pt-BR', { featured: true }),
  L('pl', 'Polish', 'Polski', 'pl-PL', { featured: true }),
  L('ru', 'Russian', 'Русский', 'ru-RU', { featured: true }),
  L('so', 'Somali', 'Soomaali', 'so-SO', { featured: true }),
  L('am', 'Amharic', 'አማርኛ', 'am-ET', { featured: true }),
  L('bn', 'Bengali', 'বাংলা', 'bn-IN', { featured: true }),
  L('ta', 'Tamil', 'தமிழ்', 'ta-IN', { featured: true }),
  L('gu', 'Gujarati', 'ગુજરાતી', 'gu-IN'),
  L('mr', 'Marathi', 'मराठी', 'mr-IN'),
  L('kn', 'Kannada', 'ಕನ್ನಡ', 'kn-IN'),
  L('te', 'Telugu', 'తెలుగు', 'te-IN'),
  L('ml', 'Malayalam', 'മലയാളം', 'ml-IN'),
  L('af', 'Afrikaans', 'Afrikaans', 'af-ZA'),
  L('as', 'Assamese', 'অসমীয়া', 'as-IN'),
  L('az', 'Azerbaijani', 'Azərbaycan', 'az-AZ'),
  L('ba', 'Bashkir', 'Башҡорт', 'ba-RU'),
  L('be', 'Belarusian', 'Беларуская', 'be-BY'),
  L('bg', 'Bulgarian', 'Български', 'bg-BG'),
  L('bo', 'Tibetan', 'བོད་ཡིག', 'bo-CN'),
  L('br', 'Breton', 'Brezhoneg', 'br-FR'),
  L('bs', 'Bosnian', 'Bosanski', 'bs-BA'),
  L('ca', 'Catalan', 'Català', 'ca-ES'),
  L('cs', 'Czech', 'Čeština', 'cs-CZ'),
  L('cy', 'Welsh', 'Cymraeg', 'cy-GB'),
  L('da', 'Danish', 'Dansk', 'da-DK'),
  L('el', 'Greek', 'Ελληνικά', 'el-GR'),
  L('et', 'Estonian', 'Eesti', 'et-EE'),
  L('eu', 'Basque', 'Euskara', 'eu-ES'),
  L('fi', 'Finnish', 'Suomi', 'fi-FI'),
  L('fo', 'Faroese', 'Føroyskt', 'fo-FO'),
  L('gl', 'Galician', 'Galego', 'gl-ES'),
  L('ha', 'Hausa', 'Hausa', 'ha-NG'),
  L('haw', 'Hawaiian', 'ʻŌlelo Hawaiʻi', 'haw-US'),
  L('he', 'Hebrew', 'עברית', 'he-IL', { rtl: true }),
  L('hr', 'Croatian', 'Hrvatski', 'hr-HR'),
  L('ht', 'Haitian Creole', 'Kreyòl ayisyen', 'ht-HT'),
  L('hu', 'Hungarian', 'Magyar', 'hu-HU'),
  L('hy', 'Armenian', 'Հայերեն', 'hy-AM'),
  L('id', 'Indonesian', 'Bahasa Indonesia', 'id-ID'),
  L('is', 'Icelandic', 'Íslenska', 'is-IS'),
  L('ja', 'Japanese', '日本語', 'ja-JP'),
  L('jw', 'Javanese', 'Basa Jawa', 'jv-ID'),
  L('ka', 'Georgian', 'ქართული', 'ka-GE'),
  L('kk', 'Kazakh', 'Қазақ', 'kk-KZ'),
  L('km', 'Khmer', 'ខ្មែរ', 'km-KH'),
  L('la', 'Latin', 'Latina', 'la'),
  L('lb', 'Luxembourgish', 'Lëtzebuergesch', 'lb-LU'),
  L('ln', 'Lingala', 'Lingála', 'ln-CD'),
  L('lo', 'Lao', 'ລາວ', 'lo-LA'),
  L('lt', 'Lithuanian', 'Lietuvių', 'lt-LT'),
  L('lv', 'Latvian', 'Latviešu', 'lv-LV'),
  L('mg', 'Malagasy', 'Malagasy', 'mg-MG'),
  L('mi', 'Māori', 'Te Reo Māori', 'mi-NZ'),
  L('mk', 'Macedonian', 'Македонски', 'mk-MK'),
  L('mn', 'Mongolian', 'Монгол', 'mn-MN'),
  L('ms', 'Malay', 'Bahasa Melayu', 'ms-MY'),
  L('mt', 'Maltese', 'Malti', 'mt-MT'),
  L('my', 'Myanmar', 'မြန်မာ', 'my-MM'),
  L('ne', 'Nepali', 'नेपाली', 'ne-NP'),
  L('nl', 'Dutch', 'Nederlands', 'nl-NL'),
  L('nn', 'Nynorsk', 'Nynorsk', 'nn-NO'),
  L('no', 'Norwegian', 'Norsk', 'nb-NO'),
  L('oc', 'Occitan', 'Occitan', 'oc-FR'),
  L('ps', 'Pashto', 'پښتو', 'ps-AF', { rtl: true }),
  L('ro', 'Romanian', 'Română', 'ro-RO'),
  L('sa', 'Sanskrit', 'संस्कृतम्', 'sa-IN'),
  L('sd', 'Sindhi', 'سنڌي', 'sd-PK', { rtl: true }),
  L('si', 'Sinhala', 'සිංහල', 'si-LK'),
  L('sk', 'Slovak', 'Slovenčina', 'sk-SK'),
  L('sl', 'Slovenian', 'Slovenščina', 'sl-SI'),
  L('sn', 'Shona', 'chiShona', 'sn-ZW'),
  L('sq', 'Albanian', 'Shqip', 'sq-AL'),
  L('sr', 'Serbian', 'Српски', 'sr-RS'),
  L('su', 'Sundanese', 'Basa Sunda', 'su-ID'),
  L('sv', 'Swedish', 'Svenska', 'sv-SE'),
  L('sw', 'Swahili', 'Kiswahili', 'sw-KE'),
  L('tg', 'Tajik', 'Тоҷикӣ', 'tg-TJ'),
  L('th', 'Thai', 'ไทย', 'th-TH'),
  L('tk', 'Turkmen', 'Türkmen', 'tk-TM'),
  L('tr', 'Turkish', 'Türkçe', 'tr-TR'),
  L('tt', 'Tatar', 'Татар', 'tt-RU'),
  L('uz', 'Uzbek', 'Oʻzbek', 'uz-UZ'),
  L('yi', 'Yiddish', 'ייִדיש', 'yi', { rtl: true }),
  L('yo', 'Yoruba', 'Yorùbá', 'yo-NG'),
] as const;

const BY_CODE = new Map(WHISPER_LANGUAGES.map((l) => [l.code, l]));

/** Aliases pharmacists / browsers may send. */
const ALIASES: Record<string, string> = {
  'zh-cn': 'zh',
  'zh-tw': 'zh',
  'zh-hans': 'zh',
  'zh-hant': 'zh',
  cmn: 'zh',
  'zh-hk': 'yue',
  'zh-yue': 'yue',
  fil: 'tl',
  filipino: 'tl',
  iw: 'he',
  nb: 'no',
  nn: 'nn',
  'pt-br': 'pt',
  'pt-pt': 'pt',
  'en-us': 'en',
  'en-gb': 'en',
  'en-ca': 'en',
  'fr-ca': 'fr',
  'fr-fr': 'fr',
  pan: 'pa',
  'pa-in': 'pa',
  'pa-pk': 'pa',
};

export function isWhisperAutoLanguage(code?: string | null): boolean {
  const v = (code ?? '').trim().toLowerCase();
  return !v || v === WHISPER_AUTO_LANGUAGE || v === 'detect' || v === 'und';
}

export function normalizeWhisperLanguageCode(code?: string | null): string {
  if (isWhisperAutoLanguage(code)) return WHISPER_AUTO_LANGUAGE;
  const raw = code!.trim().toLowerCase().replace(/_/g, '-');
  if (BY_CODE.has(raw)) return raw;
  if (ALIASES[raw]) return ALIASES[raw];
  const base = raw.split('-')[0] ?? raw;
  if (BY_CODE.has(base)) return base;
  if (ALIASES[base]) return ALIASES[base];
  return WHISPER_AUTO_LANGUAGE;
}

export function getWhisperLanguage(
  code?: string | null,
): WhisperLanguageOption | undefined {
  const normalized = normalizeWhisperLanguageCode(code);
  if (normalized === WHISPER_AUTO_LANGUAGE) return undefined;
  return BY_CODE.get(normalized);
}

export function whisperLanguageLabel(code?: string | null): string {
  if (isWhisperAutoLanguage(code)) return 'Auto-detect';
  const lang = getWhisperLanguage(code);
  return lang ? lang.name : 'Auto-detect';
}

export function whisperBcp47(code?: string | null): string | undefined {
  if (isWhisperAutoLanguage(code)) return undefined;
  return getWhisperLanguage(code)?.bcp47;
}

export function whisperLocaleId(code?: string | null): string | undefined {
  if (isWhisperAutoLanguage(code)) return undefined;
  return getWhisperLanguage(code)?.localeId;
}

export function featuredWhisperLanguages(): WhisperLanguageOption[] {
  const seen = new Set<string>();
  const out: WhisperLanguageOption[] = [];
  for (const lang of WHISPER_LANGUAGES) {
    if (!lang.featured || seen.has(lang.code)) continue;
    seen.add(lang.code);
    out.push(lang);
  }
  return out;
}

export function allWhisperLanguagesSorted(): WhisperLanguageOption[] {
  const featured = featuredWhisperLanguages();
  const featuredCodes = new Set(featured.map((l) => l.code));
  const rest = WHISPER_LANGUAGES.filter((l) => !featuredCodes.has(l.code)).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  return [...featured, ...rest];
}

export function searchWhisperLanguages(query: string): WhisperLanguageOption[] {
  const q = query.trim().toLowerCase();
  const list = allWhisperLanguagesSorted();
  if (!q) return list;
  return list.filter(
    (l) =>
      l.name.toLowerCase().includes(q) ||
      l.nativeName.toLowerCase().includes(q) ||
      l.code.toLowerCase().includes(q),
  );
}

export interface SttLanguageSettings {
  sourceLanguage: string;
  translateToEnglish: boolean;
}

export function normalizeSttLanguageSettings(input?: {
  sourceLanguage?: string | null;
  translateToEnglish?: boolean | null;
  languageCode?: string | null;
}): SttLanguageSettings {
  return {
    sourceLanguage: normalizeWhisperLanguageCode(
      input?.sourceLanguage ?? input?.languageCode,
    ),
    translateToEnglish: Boolean(input?.translateToEnglish),
  };
}
