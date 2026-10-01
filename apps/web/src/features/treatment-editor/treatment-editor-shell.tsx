'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { editorPanelClass } from './editor-styles';

/** Unified panel shell matching the approved selected-treatment mock. */
export function TreatmentEditorPanel({
  header,
  children,
  safety,
  footer,
  className,
}: {
  header: ReactNode;
  children: ReactNode;
  safety?: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('space-y-4', className)}>
      <div className={editorPanelClass}>
        <div className="border-b border-[#e6ecee] px-5 py-4 sm:px-6">{header}</div>
        <div className="space-y-4 px-5 py-4 sm:px-6 sm:py-5">{children}</div>
        {safety ? (
          <div className="border-t border-[#e6ecee] px-5 py-3 sm:px-6">{safety}</div>
        ) : null}
      </div>
      {footer ? <div>{footer}</div> : null}
    </div>
  );
}
