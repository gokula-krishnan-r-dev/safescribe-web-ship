import Image from 'next/image';
import { cn } from '@/lib/utils';

const sizeMap = {
  sm: 28,
  md: 36,
  lg: 56,
} as const;

interface BrandMarkProps {
  size?: keyof typeof sizeMap;
  className?: string;
  priority?: boolean;
}

/**
 * SafeScribe app-icon mark (the "S" glyph). Rendered as a rounded tile so it
 * reads as a brand badge on both light and dark surfaces. Sourced from the
 * shared logo so it stays in sync with the favicon.
 */
export function BrandMark({ size = 'md', className, priority }: BrandMarkProps) {
  const px = sizeMap[size];
  return (
    <div
      className={cn(
        'relative shrink-0 overflow-hidden rounded-xl bg-black shadow-sm ring-1 ring-border/50',
        className,
      )}
      style={{ width: px, height: px }}
    >
      <Image
        src="/safescribe-mark.png"
        alt="SafeScribe"
        fill
        sizes={`${px}px`}
        className="object-cover"
        priority={priority}
      />
    </div>
  );
}
