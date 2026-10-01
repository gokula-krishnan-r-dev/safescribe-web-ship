import Image from 'next/image';
import { cn } from '@/lib/utils';

interface SafeScribeMarkProps {
  size?: number;
  className?: string;
  priority?: boolean;
  /** Empty when the mark is decorative beside a wordmark. */
  alt?: string;
}

/** Calligraphic SafeScribe "S" on a transparent ground — for light surfaces. */
export function SafeScribeMark({
  size = 44,
  className,
  priority,
  alt = '',
}: SafeScribeMarkProps) {
  return (
    <Image
      src="/safescribe-mark.png"
      alt={alt}
      width={size}
      height={size}
      priority={priority}
      className={cn('shrink-0 object-contain', className)}
    />
  );
}

/** Large faint S used as a page watermark. */
export function SafeScribeWatermark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 140"
      fill="none"
      aria-hidden
      className={cn('text-[#0795C8]', className)}
    >
      <path
        d="M78 22c-3.5-10-16-17.5-30-14.5C29 11 19 26 22.5 42c3.2 14.5 16 21 36 28 16.5 5.8 27 14.5 24 28.5-3.2 15-18.5 23.5-35.5 20.5-13.5-2.4-24-12-24-22.5"
        stroke="currentColor"
        strokeWidth="14"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
