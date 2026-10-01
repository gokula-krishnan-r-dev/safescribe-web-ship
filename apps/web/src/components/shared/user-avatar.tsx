import { cn, getInitials } from '@/lib/utils';

const sizeMap = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-12 w-12 text-base',
} as const;

interface UserAvatarProps {
  name: string;
  size?: keyof typeof sizeMap;
  className?: string;
}

export function UserAvatar({ name, size = 'md', className }: UserAvatarProps) {
  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/90 font-semibold text-white shadow-sm ring-2 ring-card',
        sizeMap[size],
        className,
      )}
      aria-hidden
    >
      {getInitials(name)}
    </div>
  );
}
