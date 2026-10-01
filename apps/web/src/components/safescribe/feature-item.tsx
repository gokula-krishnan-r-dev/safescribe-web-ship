import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface FeatureItemProps {
  icon: ReactNode;
  title: string;
  description: string;
  className?: string;
}

export function FeatureItem({ icon, title, description, className }: FeatureItemProps) {
  return (
    <div className={cn('ss-feature-item', className)}>
      <span className="ss-feature-icon" aria-hidden>
        {icon}
      </span>
      <div className="ss-feature-copy-wrap">
        <p className="ss-feature-title">{title}</p>
        <p className="ss-feature-copy">{description}</p>
      </div>
    </div>
  );
}
