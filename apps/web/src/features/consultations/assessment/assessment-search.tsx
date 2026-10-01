'use client';

import { Search, X } from 'lucide-react';
import { ASSESSMENT_COPY } from './assessment-copy';

export function AssessmentSearchField({
  value,
  onChange,
  onClear,
}: {
  value: string;
  onChange: (value: string) => void;
  onClear: () => void;
}) {
  return (
    <div>
      <label htmlFor="clinical-assessment-input" className="text-[16px] font-semibold text-[#10233d]">
        {ASSESSMENT_COPY.assessmentLabel}
      </label>
      <div className="relative mt-2.5">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8a97a3]" aria-hidden />
        <input
          id="clinical-assessment-input"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={ASSESSMENT_COPY.placeholder}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          role="searchbox"
          aria-autocomplete="list"
          enterKeyHint="search"
          className="h-12 w-full rounded-[14px] border border-[#d7e2e6] bg-white pl-10 pr-11 text-[15px] text-[#10233d] shadow-none outline-none placeholder:text-[#9aa7b2] focus:border-[#0f6f6b] focus:ring-2 focus:ring-[#0f6f6b]/20"
        />
        {value ? (
          <button
            type="button"
            onClick={onClear}
            className="absolute right-3 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-[#8a97a3] hover:bg-[#eef3f5] hover:text-[#334155]"
            aria-label="Clear clinical assessment"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>
    </div>
  );
}
