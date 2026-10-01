/** Timing and copy for the Confirm treatment plan professional-judgment tooltip. */

export const CONFIRM_PLAN_TOOLTIP_OPEN_DELAY_MS = 300;
export const CONFIRM_PLAN_TOOLTIP_VISIBLE_MS = 5000;

export const CONFIRM_TREATMENT_PLAN_LABEL = 'Confirm treatment plan';

export const CONFIRM_TREATMENT_PLAN_HELPER =
  'Confirm treatment to generate counselling and follow-up in this session.';

/** Removed from Treatment Options per surgical update — do not show as hover attestation. */
export const CONFIRM_TREATMENT_PLAN_JUDGMENT = '';

export type JudgmentTooltipPhase = 'idle' | 'delay' | 'visible' | 'suppressed';

export interface JudgmentTooltipMachine {
  enter: () => void;
  leave: () => void;
  dismiss: () => void;
  reset: () => void;
  getPhase: () => JudgmentTooltipPhase;
  isOpen: () => boolean;
}

/**
 * Hover/focus reminder: 300 ms delay, 5 s auto-hide, no reopen until leave/blur.
 * Viewing the tooltip is not an acknowledgement.
 */
export function createJudgmentTooltipMachine(options: {
  onOpenChange: (open: boolean) => void;
  openDelayMs?: number;
  visibleDurationMs?: number;
  schedule?: (fn: () => void, ms: number) => unknown;
  cancel?: (handle: unknown) => void;
}): JudgmentTooltipMachine {
  const openDelayMs = options.openDelayMs ?? CONFIRM_PLAN_TOOLTIP_OPEN_DELAY_MS;
  const visibleDurationMs = options.visibleDurationMs ?? CONFIRM_PLAN_TOOLTIP_VISIBLE_MS;
  const schedule = options.schedule ?? ((fn, ms) => setTimeout(fn, ms));
  const cancel =
    options.cancel ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));

  let phase: JudgmentTooltipPhase = 'idle';
  let openTimer: unknown = null;
  let closeTimer: unknown = null;
  let open = false;

  const clearTimers = () => {
    if (openTimer != null) cancel(openTimer);
    if (closeTimer != null) cancel(closeTimer);
    openTimer = null;
    closeTimer = null;
  };

  const setOpen = (next: boolean) => {
    if (open === next) return;
    open = next;
    options.onOpenChange(next);
  };

  const becomeVisible = () => {
    phase = 'visible';
    setOpen(true);
    closeTimer = schedule(() => {
      closeTimer = null;
      phase = 'suppressed';
      setOpen(false);
    }, visibleDurationMs);
  };

  const enter = () => {
    if (phase === 'delay' || phase === 'visible' || phase === 'suppressed') return;
    phase = 'delay';
    openTimer = schedule(() => {
      openTimer = null;
      becomeVisible();
    }, openDelayMs);
  };

  const leave = () => {
    clearTimers();
    phase = 'idle';
    setOpen(false);
  };

  return {
    enter,
    leave,
    dismiss: leave,
    reset: leave,
    getPhase: () => phase,
    isOpen: () => open,
  };
}

export interface TooltipAnchorRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface TooltipBoxSize {
  width: number;
  height: number;
}

export interface ViewportSize {
  width: number;
  height: number;
}

/** Place a top-centred tooltip over a button, flipping below when space is tight. */
export function placeJudgmentTooltip({
  anchor,
  tooltip,
  viewport,
  gap = 10,
  padding = 8,
}: {
  anchor: TooltipAnchorRect;
  tooltip: TooltipBoxSize;
  viewport: ViewportSize;
  gap?: number;
  padding?: number;
}): { top: number; left: number; side: 'top' | 'bottom'; arrowLeft: number } {
  const width = Math.max(1, tooltip.width);
  const height = Math.max(1, tooltip.height);
  const anchorCenter = anchor.left + anchor.width / 2;
  let left = anchorCenter - width / 2;
  left = Math.min(Math.max(left, padding), Math.max(padding, viewport.width - width - padding));

  const spaceAbove = anchor.top - padding;
  const preferTop = spaceAbove >= height + gap;
  const side: 'top' | 'bottom' = preferTop ? 'top' : 'bottom';
  const top = preferTop
    ? anchor.top - height - gap
    : anchor.top + anchor.height + gap;

  const arrowLeft = Math.min(Math.max(anchorCenter - left, 12), width - 12);

  return { top, left, side, arrowLeft };
}
