'use client';

import { useState, type KeyboardEvent } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { PATHWAY_ROUTING_LIMITS, normalizeRoutingTags } from '@safescript/shared';

interface TagInputProps {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  maxItems?: number;
  maxLength?: number;
  /** Lowercase keys of tags that were AI-suggested and not yet saved */
  suggestedKeys?: Set<string>;
  'aria-label'?: string;
}

/**
 * Free-form multi-tag input for pathway matching terms.
 * Enter / comma commits; case-insensitive dedupe; preserves display casing.
 */
export function TagInput({
  value,
  onChange,
  placeholder = 'Type a term and press Enter',
  disabled,
  maxItems = PATHWAY_ROUTING_LIMITS.aliasMax,
  maxLength = PATHWAY_ROUTING_LIMITS.tagMaxLength,
  suggestedKeys,
  'aria-label': ariaLabel,
}: TagInputProps) {
  const [draft, setDraft] = useState('');

  const commit = (raw: string) => {
    const parts = raw
      .split(/[,;]+/)
      .map((p) => p.trim())
      .filter(Boolean);
    if (!parts.length) return;
    onChange(normalizeRoutingTags([...value, ...parts], maxItems, maxLength));
    setDraft('');
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      commit(draft);
      return;
    }
    if (e.key === 'Backspace' && !draft && value.length) {
      onChange(value.slice(0, -1));
    }
  };

  const remove = (tag: string) => {
    onChange(value.filter((t) => t.toLowerCase() !== tag.toLowerCase()));
  };

  return (
    <div
      className={cn(
        'flex min-h-10 flex-wrap items-center gap-1.5 rounded-lg border border-input bg-background px-2 py-1.5',
        disabled && 'opacity-70 pointer-events-none',
      )}
    >
      {value.map((tag) => {
        const isSuggested = suggestedKeys?.has(tag.toLowerCase());
        return (
          <span
            key={tag.toLowerCase()}
            className={cn(
              'inline-flex max-w-full items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium',
              isSuggested
                ? 'border-amber-300/80 bg-amber-50 text-amber-950'
                : 'border-border/70 bg-muted/40 text-foreground',
            )}
          >
            <span className="truncate">{tag}</span>
            {!disabled && (
              <button
                type="button"
                aria-label={`Remove ${tag}`}
                className="rounded p-0.5 text-muted-foreground hover:bg-background hover:text-foreground"
                onClick={() => remove(tag)}
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </span>
        );
      })}
      {!disabled && value.length < maxItems && (
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => {
            if (draft.trim()) commit(draft);
          }}
          placeholder={value.length ? '' : placeholder}
          aria-label={ariaLabel}
          className="h-7 min-w-[8rem] flex-1 border-0 bg-transparent px-1 shadow-none focus-visible:ring-0"
          maxLength={maxLength}
        />
      )}
    </div>
  );
}
