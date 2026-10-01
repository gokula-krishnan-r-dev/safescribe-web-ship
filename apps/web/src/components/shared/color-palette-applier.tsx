'use client';

import { useEffect } from 'react';
import { useTheme } from 'next-themes';
import { applyPaletteTokens, getPaletteById } from '@/lib/theme-presets';
import { useColorPaletteStore } from '@/features/settings/color-palette-store';

export function ColorPaletteApplier() {
  const paletteId = useColorPaletteStore((s) => s.paletteId);
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    const root = document.documentElement;
    const palette = getPaletteById(paletteId);
    const mode = resolvedTheme === 'dark' ? 'dark' : 'light';
    applyPaletteTokens(palette[mode], root);
    root.setAttribute('data-palette', paletteId);
  }, [paletteId, resolvedTheme]);

  return null;
}
