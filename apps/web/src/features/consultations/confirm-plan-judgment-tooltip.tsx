'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import {
  CONFIRM_TREATMENT_PLAN_JUDGMENT,
  createJudgmentTooltipMachine,
  placeJudgmentTooltip,
  type JudgmentTooltipMachine,
} from './confirm-plan-judgment';

export function useJudgmentTooltip(enabled: boolean) {
  const [open, setOpen] = useState(false);
  const onOpenChange = useRef(setOpen);
  onOpenChange.current = setOpen;
  const machineRef = useRef<JudgmentTooltipMachine | null>(null);

  if (machineRef.current == null) {
    machineRef.current = createJudgmentTooltipMachine({
      onOpenChange: (next) => onOpenChange.current(next),
    });
  }

  const machine = machineRef.current;

  useEffect(() => () => machine.reset(), [machine]);

  useEffect(() => {
    if (!enabled) machine.reset();
  }, [enabled, machine]);

  const onPointerEnter = useCallback(() => {
    if (enabled) machine.enter();
  }, [enabled, machine]);

  const onPointerLeave = useCallback(() => {
    machine.leave();
  }, [machine]);

  const onFocus = useCallback(() => {
    if (enabled) machine.enter();
  }, [enabled, machine]);

  const onBlur = useCallback(() => {
    machine.leave();
  }, [machine]);

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>) => {
      if (event.key === 'Escape' && machine.isOpen()) {
        event.stopPropagation();
        machine.dismiss();
      }
    },
    [machine],
  );

  const dismiss = useCallback(() => {
    machine.dismiss();
  }, [machine]);

  return {
    open: enabled && open,
    dismiss,
    triggerProps: {
      onPointerEnter,
      onPointerLeave,
      onFocus,
      onBlur,
      onKeyDown,
    },
  };
}

interface BubbleProps {
  open: boolean;
  anchor: HTMLElement | null;
}

export function ConfirmPlanJudgmentTooltip({ open, anchor }: BubbleProps) {
  const bubbleRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{
    top: number;
    left: number;
    side: 'top' | 'bottom';
    arrowLeft: number;
  } | null>(null);

  const update = useCallback(() => {
    const el = bubbleRef.current;
    if (!open || !anchor || !el) return;
    const rect = anchor.getBoundingClientRect();
    const box = el.getBoundingClientRect();
    setCoords(
      placeJudgmentTooltip({
        anchor: {
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
        },
        tooltip: {
          width: box.width || 400,
          height: box.height || 52,
        },
        viewport: { width: window.innerWidth, height: window.innerHeight },
      }),
    );
  }, [open, anchor]);

  useLayoutEffect(() => {
    if (!open) {
      setCoords(null);
      return;
    }
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [open, update]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={bubbleRef}
      role="presentation"
      aria-hidden="true"
      className={cn(
        'pointer-events-none fixed z-[80] w-max max-w-[min(420px,calc(100vw-1rem))] rounded-[10px] px-4 py-3',
        'bg-[#0F2A44] text-center text-[14px] font-medium leading-[1.4] text-white',
        'shadow-[0_10px_28px_rgba(15,42,68,0.28)]',
        'motion-safe:transition-opacity motion-safe:duration-150',
        coords ? 'opacity-100' : 'opacity-0',
        'motion-reduce:transition-none',
      )}
      style={
        coords
          ? { top: coords.top, left: coords.left }
          : { top: 0, left: 0, visibility: 'hidden' }
      }
    >
      {CONFIRM_TREATMENT_PLAN_JUDGMENT}
      <span
        className={cn(
          'absolute left-0 h-0 w-0 border-[7px] border-solid border-transparent',
          coords?.side === 'bottom'
            ? '-top-[7px] border-b-[#0F2A44] border-t-0'
            : '-bottom-[7px] border-t-[#0F2A44] border-b-0',
        )}
        style={{
          left: coords ? coords.arrowLeft : '50%',
          transform: 'translateX(-50%)',
        }}
      />
    </div>,
    document.body,
  );
}
