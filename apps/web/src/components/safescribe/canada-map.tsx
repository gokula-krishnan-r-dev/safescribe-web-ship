import Image from 'next/image';
import { cn } from '@/lib/utils';

export function CanadaMap({ className }: { className?: string }) {
  return (
    <div className={cn('relative aspect-[3/2] w-full overflow-hidden', className)}>
      <Image
        src="/landing/canada-map.jpg"
        alt="Map of Canada with SafeScribe based in Edmonton, Alberta"
        fill
        sizes="(max-width: 1023px) 100vw, 360px"
        className="object-contain object-center"
      />
    </div>
  );
}
