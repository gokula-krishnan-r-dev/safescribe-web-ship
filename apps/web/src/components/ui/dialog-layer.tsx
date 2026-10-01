'use client';

import * as React from 'react';

/** Overlay host inside DialogContent so portaled comboboxes stay in the focus trap. */
export const DialogLayerContext = React.createContext<HTMLElement | null>(null);

export function useDialogLayer() {
  return React.useContext(DialogLayerContext);
}
