'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { PaletteId } from '@/lib/theme-presets';
import { DEFAULT_PALETTE_ID } from '@/lib/theme-presets';

interface ColorPaletteState {
  paletteId: PaletteId;
  setPaletteId: (id: PaletteId) => void;
}

export const useColorPaletteStore = create<ColorPaletteState>()(
  persist(
    (set) => ({
      paletteId: DEFAULT_PALETTE_ID,
      setPaletteId: (paletteId) => set({ paletteId }),
    }),
    // New key so the Cyan Brand (#155E75) default applies site-wide
    { name: 'safescript-palette-v2' },
  ),
);
