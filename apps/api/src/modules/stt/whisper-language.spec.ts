import {
  WHISPER_AUTO_LANGUAGE,
  WHISPER_LANGUAGES,
  isWhisperAutoLanguage,
  normalizeSttLanguageSettings,
  normalizeWhisperLanguageCode,
  whisperLanguageLabel,
  whisperLocaleId,
} from '@safescript/shared';

describe('Whisper language catalog', () => {
  it('includes auto-detect plus official Whisper codes', () => {
    const codes = new Set(WHISPER_LANGUAGES.map((l) => l.code));
    expect(codes.has('en')).toBe(true);
    expect(codes.has('fr')).toBe(true);
    expect(codes.has('pa')).toBe(true);
    expect(codes.has('hi')).toBe(true);
    expect(codes.has('zh')).toBe(true);
    expect(codes.has('yue')).toBe(true);
    expect(codes.has('ar')).toBe(true);
    expect(WHISPER_LANGUAGES.length).toBeGreaterThanOrEqual(90);
  });

  it('normalizes aliases and BCP-47 tags to Whisper ISO codes', () => {
    expect(normalizeWhisperLanguageCode('en-CA')).toBe('en');
    expect(normalizeWhisperLanguageCode('fr_CA')).toBe('fr');
    expect(normalizeWhisperLanguageCode('zh-HK')).toBe('yue');
    expect(normalizeWhisperLanguageCode('fil')).toBe('tl');
    expect(normalizeWhisperLanguageCode('pa-IN')).toBe('pa');
    expect(normalizeWhisperLanguageCode('auto')).toBe(WHISPER_AUTO_LANGUAGE);
    expect(normalizeWhisperLanguageCode('')).toBe(WHISPER_AUTO_LANGUAGE);
    expect(normalizeWhisperLanguageCode('not-a-lang')).toBe(WHISPER_AUTO_LANGUAGE);
  });

  it('exposes device locales for phone recognition', () => {
    expect(whisperLocaleId('pa')).toBe('pa_IN');
    expect(whisperLocaleId('fr')).toBe('fr_CA');
    expect(whisperLocaleId('auto')).toBeUndefined();
    expect(isWhisperAutoLanguage('detect')).toBe(true);
    expect(whisperLanguageLabel('hi')).toBe('Hindi');
  });

  it('normalizes STT settings for translate-to-English', () => {
    expect(
      normalizeSttLanguageSettings({
        languageCode: 'pa-IN',
        translateToEnglish: true,
      }),
    ).toEqual({ sourceLanguage: 'pa', translateToEnglish: true });
  });
});
