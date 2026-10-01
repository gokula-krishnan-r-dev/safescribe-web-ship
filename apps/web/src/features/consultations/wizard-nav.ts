'use client';

import { createContext, useContext, useEffect, useRef } from 'react';

export type BeforeLeaveFn = () => Promise<void> | void;

export const WizardLeaveContext = createContext<
  (fn: BeforeLeaveFn | null) => void
>(() => {});

/** Persist a draft when the pharmacist leaves the current step (Back, stepper, Continue). */
export function useWizardBeforeLeave(handler: BeforeLeaveFn) {
  const register = useContext(WizardLeaveContext);
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    register(() => handlerRef.current());
    return () => register(null);
  }, [register]);
}
