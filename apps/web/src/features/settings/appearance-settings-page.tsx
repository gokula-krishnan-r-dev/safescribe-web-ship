'use client';

import { useEffect, useState } from 'react';
import { Check, Palette, Sun } from 'lucide-react';
import { toast } from '@/lib/notify';
import { cn } from '@/lib/utils';
import { THEME_PALETTES, type PaletteId } from '@/lib/theme-presets';
import { useColorPaletteStore } from '@/features/settings/color-palette-store';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export function AppearanceSettingsPage({ basePath }: { basePath: string }) {
  const { paletteId, setPaletteId } = useColorPaletteStore();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const handlePaletteSelect = (id: PaletteId) => {
    setPaletteId(id);
    toast.success(`Colour theme updated to ${THEME_PALETTES.find((p) => p.id === id)?.name}`);
  };

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <PageHeader
        title="Appearance"
        description="SafeScribe uses light mode by default. Pick a colour theme that suits your pharmacy."
        breadcrumbs={[{ label: 'Settings', href: `${basePath}/settings` }, { label: 'Appearance' }]}
      />

   

      <Card className="border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Palette className="h-4 w-4 text-primary" />
            Colour theme
          </CardTitle>
          <CardDescription>
            Pick a professional palette. Your choice is saved on this device and applies everywhere.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          {THEME_PALETTES.map((palette) => {
            const active = mounted && paletteId === palette.id;
            const tokens = palette.light;
            return (
              <button
                key={palette.id}
                type="button"
                onClick={() => handlePaletteSelect(palette.id)}
                className={cn(
                  'relative rounded-xl border p-4 text-left transition-all',
                  active
                    ? 'border-primary ring-2 ring-primary/20'
                    : 'border-border hover:border-primary/30 hover:shadow-sm',
                )}
                style={{ background: tokens.card }}
              >
                <div className="mb-3 flex gap-1.5">
                  {palette.swatches.map((color) => (
                    <span
                      key={color}
                      className="h-8 flex-1 rounded-md border border-black/5 shadow-sm"
                      style={{ background: color }}
                    />
                  ))}
                </div>
                <p className="font-semibold" style={{ color: tokens.foreground }}>
                  {palette.name}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {palette.description}
                </p>
                <div className="mt-3 flex items-center gap-2">
                  <span
                    className="inline-flex h-7 items-center rounded-md px-2.5 text-xs font-medium text-white"
                    style={{ background: tokens.primary }}
                  >
                    Primary
                  </span>
                  <span
                    className="inline-flex h-7 items-center rounded-md border px-2.5 text-xs font-medium"
                    style={{
                      background: tokens.muted,
                      color: tokens.foreground,
                      borderColor: tokens.border,
                    }}
                  >
                    Background
                  </span>
                </div>
                {active && (
                  <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-white">
                    <Check className="h-3 w-3" />
                  </span>
                )}
              </button>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
