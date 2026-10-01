import type { ReactNode } from 'react';

export function RenewSectionLegend({
  n,
  children,
  description,
}: {
  n: number;
  children: ReactNode;
  description?: ReactNode;
}) {
  return (
    <div className="mb-3">
      <div className="flex items-center gap-2.5">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
          {n}
        </span>
        <h2 className="text-sm font-semibold text-foreground">{children}</h2>
      </div>
      {description ? (
        <p className="mt-1 pl-[2.125rem] text-sm text-muted-foreground">{description}</p>
      ) : null}
    </div>
  );
}
