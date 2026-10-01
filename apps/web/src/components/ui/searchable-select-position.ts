export type SearchableSelectPanelBox = {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
};

type Rect = { top: number; bottom: number; left: number; width: number };
type Viewport = { width: number; height: number };

/** Viewport or dialog-local coordinates for a portaled combobox panel. */
export function computeSearchableSelectPosition(
  trigger: Rect,
  viewport: Viewport,
  container?: { top: number; left: number } | null,
): SearchableSelectPanelBox {
  const spaceBelow = viewport.height - trigger.bottom - 12;
  const spaceAbove = trigger.top - 12;
  const placeBelow = spaceBelow >= 180 || spaceBelow >= spaceAbove;
  const maxHeight = Math.min(360, Math.max(160, placeBelow ? spaceBelow : spaceAbove));
  const width = Math.min(Math.max(trigger.width, 280), Math.max(viewport.width - 16, 160));
  const viewportLeft = Math.min(Math.max(8, trigger.left), Math.max(8, viewport.width - width - 8));
  const viewportTop = placeBelow ? trigger.bottom + 6 : Math.max(8, trigger.top - maxHeight - 6);
  if (!container) {
    return { top: viewportTop, left: viewportLeft, width, maxHeight };
  }
  return {
    top: viewportTop - container.top,
    left: viewportLeft - container.left,
    width,
    maxHeight,
  };
}

export function isSearchableSelectQueryKey(key: string, modifiers: boolean): boolean {
  if (modifiers) return false;
  if (key === 'Backspace') return true;
  return key.length === 1;
}

export function applySearchableSelectQuery(query: string, key: string): string {
  if (key === 'Backspace') return query.slice(0, -1);
  if (key.length === 1) return `${query}${key}`;
  return query;
}
