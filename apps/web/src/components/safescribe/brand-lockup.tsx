import Image from 'next/image';
import { cn } from '@/lib/utils';

interface BrandLockupProps {
  variant?: 'header' | 'card';
  /** Kept for callers; both variants use the approved wordmark. */
  showTagline?: boolean;
  priority?: boolean;
  className?: string;
}

const LOGO_SRC = '/landing/safescribe-logo.png';
const LOGO_WIDTH = 907;
const LOGO_HEIGHT = 248;

export function BrandLockup({
  variant = 'header',
  priority,
  className,
}: BrandLockupProps) {
  if (variant === 'card') {
    return (
      <span className={cn('inline-flex items-center justify-center', className)}>
        <Image
          src={LOGO_SRC}
          alt="SafeScribe"
          width={LOGO_WIDTH}
          height={LOGO_HEIGHT}
          priority={priority}
          quality={90}
          sizes="230px"
          className="ss-brand-logo ss-brand-logo-card block h-auto w-auto object-contain"
        />
      </span>
    );
  }

  return (
    <span className={cn('inline-flex items-center', className)}>
      <Image
        src={LOGO_SRC}
        alt="SafeScribe"
        width={LOGO_WIDTH}
        height={LOGO_HEIGHT}
        priority={priority}
        quality={100}
        sizes="225px"
        className="ss-brand-logo ss-brand-logo-header block h-auto w-auto object-contain object-left"
      />
    </span>
  );
}
