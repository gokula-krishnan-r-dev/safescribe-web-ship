'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, Languages, Search } from 'lucide-react';
import {
  allWhisperLanguagesSorted,
  isWhisperAutoLanguage,
  normalizeWhisperLanguageCode,
  searchWhisperLanguages,
  whisperLanguageLabel,
  type SttLanguageSettings,
} from '@safescript/shared';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';

const TRANSLATE_KEY = 'safescribe.stt.translateToEnglish';
const LANG_KEY = 'safescribe.stt.sourceLanguage';

export function readSttLanguageSettings(): SttLanguageSettings {
  if (typeof window === 'undefined') {
    return { sourceLanguage: 'auto', translateToEnglish: false };
  }
  try {
    return {
      sourceLanguage: normalizeWhisperLanguageCode(localStorage.getItem(LANG_KEY)),
      translateToEnglish: localStorage.getItem(TRANSLATE_KEY) === 'true',
    };
  } catch {
    return { sourceLanguage: 'auto', translateToEnglish: false };
  }
}

export function persistSttLanguageSettings(next: SttLanguageSettings) {
  try {
    localStorage.setItem(TRANSLATE_KEY, next.translateToEnglish ? 'true' : 'false');
    localStorage.setItem(LANG_KEY, next.sourceLanguage);
  } catch {
    /* private mode */
  }
}

type Props = {
  value: SttLanguageSettings;
  onChange: (next: SttLanguageSettings) => void;
  disabled?: boolean;
};

export function SttLanguagePicker({ value, onChange, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  const matches = useMemo(() => searchWhisperLanguages(query), [query]);
  const featured = useMemo(
    () => allWhisperLanguagesSorted().filter((l) => l.featured),
    [],
  );
  const list = query.trim() ? matches : featured;
  const restCount = query.trim()
    ? 0
    : Math.max(0, allWhisperLanguagesSorted().length - featured.length);

  const spokenLabel = isWhisperAutoLanguage(value.sourceLanguage)
    ? 'Auto-detect'
    : whisperLanguageLabel(value.sourceLanguage);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="outline"
        disabled={disabled}
        aria-pressed={value.translateToEnglish}
        onClick={() =>
          onChange({
            ...value,
            translateToEnglish: !value.translateToEnglish,
            sourceLanguage: value.sourceLanguage || 'auto',
          })
        }
        className={cn(
          'h-[38px] gap-2 rounded-[8px] px-3.5 text-sm font-medium',
          value.translateToEnglish
            ? 'border-[#0F766E] bg-[#E6F5F3] text-[#0F766E] shadow-sm'
            : 'border-[#C8D3D7] bg-white text-[#334155]',
        )}
      >
        <Languages className="h-3.5 w-3.5" aria-hidden />
        Translate
      </Button>

      {value.translateToEnglish && (
        <>
          <DropdownMenu open={open} onOpenChange={setOpen}>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                disabled={disabled}
                className="h-[38px] max-w-[220px] gap-1.5 rounded-[8px] border-[#C8D3D7] bg-white px-3 text-sm font-medium text-[#334155]"
                aria-label="Spoken language"
              >
                <span className="truncate">{spokenLabel}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[280px] p-0">
              <div className="border-b p-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search Whisper languages"
                    className="h-8 pl-8 text-sm"
                    autoFocus
                    onKeyDown={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                  />
                </div>
              </div>
              <div className="max-h-[280px] overflow-y-auto py-1">
                <DropdownMenuItem
                  onSelect={() => {
                    onChange({ ...value, sourceLanguage: 'auto' });
                    setOpen(false);
                  }}
                  className="gap-2"
                >
                  <Check
                    className={cn(
                      'h-3.5 w-3.5',
                      isWhisperAutoLanguage(value.sourceLanguage)
                        ? 'opacity-100'
                        : 'opacity-0',
                    )}
                  />
                  Auto-detect
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {!query.trim() && <DropdownMenuLabel>Common in clinic</DropdownMenuLabel>}
                {list.map((lang) => (
                  <DropdownMenuItem
                    key={lang.code}
                    onSelect={() => {
                      onChange({ ...value, sourceLanguage: lang.code });
                      setOpen(false);
                    }}
                    className="gap-2"
                  >
                    <Check
                      className={cn(
                        'h-3.5 w-3.5 shrink-0',
                        value.sourceLanguage === lang.code ? 'opacity-100' : 'opacity-0',
                      )}
                    />
                    <span className="min-w-0 flex-1 truncate">
                      {lang.name}
                      {lang.nativeName !== lang.name ? (
                        <span className="ml-1 text-muted-foreground">{lang.nativeName}</span>
                      ) : null}
                    </span>
                  </DropdownMenuItem>
                ))}
                {query.trim() && matches.length === 0 && (
                  <p className="px-3 py-2 text-xs text-muted-foreground">
                    No Whisper language matches.
                  </p>
                )}
                {!query.trim() && restCount > 0 && (
                  <p className="px-3 py-1.5 text-[11px] text-muted-foreground">
                    Type to search {restCount} more Whisper languages
                  </p>
                )}
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
          <span className="hidden text-xs font-medium text-[#0F766E] sm:inline">→ English</span>
        </>
      )}
    </div>
  );
}
