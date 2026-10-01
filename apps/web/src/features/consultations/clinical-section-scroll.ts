/**
 * Accordion section focus for the consultation wizard scroll pane.
 * Pins the section title to the top of `[data-consult-scroll]` with a single
 * settle pass — no smooth/instant fight that makes the workspace shake.
 */

let focusGeneration = 0;
let answerPinGeneration = 0;

/** Cancel any in-flight section title snap (answer clicks must win). */
export function cancelClinicalSectionFocus(): void {
  focusGeneration += 1;
}

export function getConsultScrollParent(el: HTMLElement | null): HTMLElement | null {
  const marked = document.querySelector('[data-consult-scroll]');
  if (marked instanceof HTMLElement) {
    if (!el || marked.contains(el)) return marked;
  }

  let node = el?.parentElement ?? null;
  while (node) {
    const { overflowY } = window.getComputedStyle(node);
    if (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') {
      return node;
    }
    node = node.parentElement;
  }
  return marked instanceof HTMLElement ? marked : null;
}

function resolveFocusTarget(el: HTMLElement): HTMLElement {
  return el.querySelector<HTMLElement>('[data-clinical-section-title]') ?? el;
}

export function clampConsultScrollTop(
  scrollHeight: number,
  clientHeight: number,
  nextTop: number,
): number {
  const maxTop = Math.max(0, scrollHeight - clientHeight);
  return Math.min(maxTop, Math.max(0, nextTop));
}

function clampScrollTop(scrollParent: HTMLElement, nextTop: number): number {
  return clampConsultScrollTop(
    scrollParent.scrollHeight,
    scrollParent.clientHeight,
    nextTop,
  );
}

function readAlignTop(el: HTMLElement, scrollParent: HTMLElement, offset: number): number {
  const parentRect = scrollParent.getBoundingClientRect();
  const elRect = el.getBoundingClientRect();
  return clampScrollTop(
    scrollParent,
    scrollParent.scrollTop + (elRect.top - parentRect.top) - offset,
  );
}

/** Skip micro-adjustments that read as viewport shake. */
const ALIGN_EPSILON_PX = 4;

/** Hold long enough to cover React commit + autosave layout (Saving… flash). */
const DEFAULT_ANSWER_PIN_MS = 1800;

export type ScrollConsultChildOptions = {
  block?: 'nearest' | 'start';
  behavior?: ScrollBehavior;
  offset?: number;
};

/**
 * Scroll a child into the consult pane only.
 * Never call element.scrollIntoView() here — browsers also scroll the window,
 * which shifts the h-dvh dashboard and leaves a blank band under the form.
 */
export function scrollConsultChildIntoView(
  el: HTMLElement | null,
  options: ScrollConsultChildOptions = {},
): void {
  if (!el?.isConnected) return;
  // Never fight an active Yes/No answer pin.
  if (answerPinGeneration > 0 && answerPinActiveUntil > performance.now()) return;

  const pane = getConsultScrollParent(el);
  if (!pane) return;

  const offset = options.offset ?? 12;
  const parentRect = pane.getBoundingClientRect();
  const elRect = el.getBoundingClientRect();
  let nextTop = pane.scrollTop;

  if (options.block === 'start') {
    nextTop = pane.scrollTop + (elRect.top - parentRect.top) - offset;
  } else if (elRect.top < parentRect.top + offset) {
    nextTop = pane.scrollTop + (elRect.top - parentRect.top) - offset;
  } else if (elRect.bottom > parentRect.bottom - offset) {
    nextTop = pane.scrollTop + (elRect.bottom - parentRect.bottom) + offset;
  } else {
    return;
  }

  const clamped = clampScrollTop(pane, nextTop);
  if (Math.abs(pane.scrollTop - clamped) < ALIGN_EPSILON_PX) return;
  pane.scrollTo({
    top: clamped,
    behavior: options.behavior ?? 'auto',
  });
}

let answerPinActiveUntil = 0;

/** Keep the document itself pinned so nested scrollIntoView cannot shift the shell. */
export function lockConsultPageScroll(): () => void {
  const html = document.documentElement;
  const body = document.body;
  const prevHtml = html.style.overflow;
  const prevBody = body.style.overflow;
  html.style.overflow = 'hidden';
  body.style.overflow = 'hidden';
  const pin = () => {
    if (window.scrollX !== 0 || window.scrollY !== 0) {
      window.scrollTo(0, 0);
    }
  };
  pin();
  window.addEventListener('scroll', pin, { passive: true });
  return () => {
    window.removeEventListener('scroll', pin);
    html.style.overflow = prevHtml;
    body.style.overflow = prevBody;
  };
}

export type FocusClinicalSectionOptions = {
  behavior?: ScrollBehavior;
  /** Gap below the top of the scroll pane (px). */
  offset?: number;
  /** How long to wait for accordion height settle before a final snap. */
  settleMs?: number;
};

/**
 * Scroll so the section title sits at the top of the consult scroll pane.
 * Cancels any in-flight focus from a previous call. Returns a cancel fn.
 *
 * Uses instant positioning by default. One optional settle pass after layout
 * finishes — no smooth→auto thrash or ResizeObserver ping-pong.
 */
export function focusClinicalSection(
  el: HTMLElement | null,
  options: FocusClinicalSectionOptions = {},
): () => void {
  if (!el) return () => {};
  // Answering Yes/No owns the viewport — do not yank to a section title mid-click.
  if (answerPinActiveUntil > performance.now()) return () => {};

  const gen = ++focusGeneration;
  const behavior = options.behavior ?? 'auto';
  const offset = options.offset ?? 8;
  const settleMs = options.settleMs ?? 200;

  const align = (scrollBehavior: ScrollBehavior) => {
    if (gen !== focusGeneration || !el.isConnected) return;
    if (answerPinActiveUntil > performance.now()) return;

    const scrollParent = getConsultScrollParent(el);
    const target = resolveFocusTarget(el);

    if (!scrollParent) return;

    const nextTop = readAlignTop(target, scrollParent, offset);
    if (Math.abs(scrollParent.scrollTop - nextTop) < ALIGN_EPSILON_PX) return;

    scrollParent.scrollTo({ top: nextTop, behavior: scrollBehavior });
  };

  const raf = requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (gen !== focusGeneration) return;
      align(behavior);
    });
  });

  // Optional single settle after expand/collapse CSS — skip when settleMs is 0
  // so confirm→assessment does not double-snap (that read as top/bottom shake).
  const settleTimer =
    settleMs > 0
      ? window.setTimeout(() => {
          if (gen !== focusGeneration) return;
          align('auto');
        }, settleMs)
      : null;

  return () => {
    cancelAnimationFrame(raf);
    if (settleTimer != null) clearTimeout(settleTimer);
    if (gen === focusGeneration) focusGeneration += 1;
  };
}

/** Focus after the next macrotask (typical post-setState usage). */
export function focusClinicalSectionSoon(
  getEl: () => HTMLElement | null,
  options?: FocusClinicalSectionOptions,
): () => void {
  let cancel: (() => void) | undefined;
  const t = window.setTimeout(() => {
    cancel = focusClinicalSection(getEl(), options);
  }, 0);
  return () => {
    clearTimeout(t);
    cancel?.();
  };
}

export type PinConsultScrollOptions = {
  /** How long to hold the pane still (ms). Default covers autosave UI flash. */
  holdMs?: number;
};

/**
 * Keep the consult pane scrollTop stable after a Yes/No (or similar) answer.
 * Cancels in-flight section focus so title-snaps cannot fight the pin (that
 * fight is what made Presentation Review shake top/bottom after ~3 answers).
 * Releases immediately if the pharmacist scrolls intentionally.
 */
export function pinConsultScroll(options: PinConsultScrollOptions = {}): () => void {
  if (typeof document === 'undefined') return () => {};
  const pane = document.querySelector('[data-consult-scroll]');
  if (!(pane instanceof HTMLElement)) return () => {};

  cancelClinicalSectionFocus();

  const gen = ++answerPinGeneration;
  const holdMs = options.holdMs ?? DEFAULT_ANSWER_PIN_MS;
  answerPinActiveUntil = performance.now() + holdMs;

  const top = pane.scrollTop;
  let cancelled = false;
  let restoring = false;

  const restore = () => {
    if (cancelled || gen !== answerPinGeneration || !pane.isConnected) return;
    if (Math.abs(pane.scrollTop - top) < 1) return;
    restoring = true;
    pane.scrollTop = top;
    // Allow the scroll event from our own write to be ignored.
    requestAnimationFrame(() => {
      restoring = false;
    });
  };

  const onPaneScroll = () => {
    if (cancelled || gen !== answerPinGeneration || restoring) return;
    restore();
  };

  const onUserIntent = () => {
    cleanup();
  };

  const cleanup = () => {
    if (cancelled) return;
    cancelled = true;
    if (gen === answerPinGeneration) {
      answerPinActiveUntil = 0;
    }
    pane.removeEventListener('scroll', onPaneScroll);
    pane.removeEventListener('wheel', onUserIntent);
    pane.removeEventListener('touchmove', onUserIntent);
    pane.removeEventListener('pointerdown', onUserIntent);
    pane.removeEventListener('keydown', onKeyIntent);
    clearInterval(pulse);
    clearTimeout(endTimer);
  };

  const onKeyIntent = (e: KeyboardEvent) => {
    if (
      e.key === 'ArrowUp' ||
      e.key === 'ArrowDown' ||
      e.key === 'PageUp' ||
      e.key === 'PageDown' ||
      e.key === 'Home' ||
      e.key === 'End' ||
      e.key === ' '
    ) {
      onUserIntent();
    }
  };

  pane.addEventListener('scroll', onPaneScroll, { passive: true });
  // Any pharmacist interaction ends the pin so we never fight intentional scrolling.
  pane.addEventListener('wheel', onUserIntent, { passive: true });
  pane.addEventListener('touchmove', onUserIntent, { passive: true });
  pane.addEventListener('pointerdown', onUserIntent, { passive: true });
  pane.addEventListener('keydown', onKeyIntent, { passive: true });

  restore();
  const pulse = window.setInterval(restore, 32);
  const endTimer = window.setTimeout(cleanup, holdMs);

  return cleanup;
}
