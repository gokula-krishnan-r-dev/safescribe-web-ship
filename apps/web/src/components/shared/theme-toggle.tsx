'use client';

import { useEffect, useRef, useState } from 'react';
import { useTheme } from 'next-themes';
import { Monitor, Moon, Sun, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

type ThemeOption = 'light' | 'dark' | 'system';

const options: { value: ThemeOption; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
];

interface ThemeToggleProps {
  variant?: 'default' | 'sidebar' | 'admin';
  className?: string;
}

export function ThemeToggle({ variant = 'default', className }: ThemeToggleProps) {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (!mounted) {
    return (
      <Button
        variant="outline"
        size="icon"
        className={cn('h-9 w-9 shrink-0', className)}
        aria-label="Theme"
        disabled
      />
    );
  }

  const current = (theme as ThemeOption) ?? 'system';
  const Icon = resolvedTheme === 'dark' ? Moon : Sun;

  const triggerClass = cn(
    'h-9 shrink-0 gap-2 shadow-none',
    variant === 'sidebar' && 'w-full justify-start border-border/80 bg-muted/30',
    variant === 'admin' && 'w-full justify-start border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white',
    variant === 'default' && 'w-9 px-0',
    className,
  );

  return (
    <div className="relative" ref={ref}>
      <Button
        type="button"
        variant="outline"
        size={variant === 'default' ? 'icon' : 'sm'}
        className={triggerClass}
        onClick={() => setOpen(!open)}
        aria-label="Toggle theme"
        aria-expanded={open}
      >
        <Icon className="h-4 w-4" />
        {variant !== 'default' && (
          <span className="text-sm font-medium">
            {options.find((o) => o.value === current)?.label ?? 'Theme'}
          </span>
        )}
      </Button>

      {open && (
        <div
          className={cn(
            'absolute z-50 min-w-[148px] overflow-hidden rounded-xl border border-border bg-card p-1 shadow-lg',
            variant === 'default' ? 'right-0 top-full mt-2' : 'bottom-full left-0 mb-2 w-full',
          )}
        >
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                setTheme(opt.value);
                setOpen(false);
              }}
              className={cn(
                'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors',
                current === opt.value
                  ? 'bg-primary/10 font-medium text-primary'
                  : 'text-foreground hover:bg-muted',
              )}
            >
              <opt.icon className="h-4 w-4 shrink-0" />
              <span className="flex-1 text-left">{opt.label}</span>
              {current === opt.value && <Check className="h-4 w-4 shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
