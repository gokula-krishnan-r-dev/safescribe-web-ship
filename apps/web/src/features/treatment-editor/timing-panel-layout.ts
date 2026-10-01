export type TimingSurface = 'menu' | 'more' | 'hourly' | 'custom';

export function isNestedTimingSurface(surface: TimingSurface): boolean {
  return surface !== 'menu';
}

/**
 * Nested catalogue / custom forms need a definite height so flex-1
 * scroll regions do not collapse to 0px inside a max-height-only panel.
 */
export function timingPanelBox(
  surface: TimingSurface,
  maxHeight: number,
): { height?: number; minHeight?: number; maxHeight: number } {
  if (!isNestedTimingSurface(surface)) return { maxHeight };
  const height = Math.max(220, maxHeight);
  return {
    height,
    minHeight: Math.min(280, height),
    maxHeight: height,
  };
}
