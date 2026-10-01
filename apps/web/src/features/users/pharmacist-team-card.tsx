'use client';

import Link from 'next/link';
import { cn } from '@/lib/utils';
import type { UserListItem } from '@/lib/api-client';

function chipDate(value: string | null | undefined): string {
  if (!value) return 'Never';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value));
}

const cardButtonClass =
  'inline-flex h-10 w-full items-center justify-center rounded-[10px] border border-[#d7e0e3] bg-white px-3 text-[13px] font-semibold text-[#1f3d3a] shadow-none transition-colors hover:bg-[#f4f8f8] hover:text-[#0f3f3c] disabled:pointer-events-none disabled:opacity-50';

interface PharmacistTeamCardProps {
  user: UserListItem;
  basePath: string;
  busy?: boolean;
  onSuspend: (user: UserListItem) => void;
  onRemove: (user: UserListItem) => void;
  onSendReset: (user: UserListItem) => void;
}

export function PharmacistTeamCard({
  user,
  basePath,
  busy,
  onSuspend,
  onRemove,
  onSendReset,
}: PharmacistTeamCardProps) {
  const suspended = user.status === 'SUSPENDED';

  return (
    <article
      className={cn(
        'flex h-full flex-col rounded-2xl border border-[#cfe3e1] bg-[#e7f4f2] p-5 shadow-[0_1px_2px_rgba(15,55,50,0.04)]',
        suspended && 'opacity-90',
      )}
    >
      <div className="min-w-0">
        <Link
          href={`${basePath}/${user.id}`}
          className="block truncate text-[17px] font-bold leading-snug text-[#0f3f3c] hover:underline"
        >
          {user.fullName}
        </Link>
        <p className="mt-0.5 text-[13.5px] font-medium text-[#5b7a76]">
          {user.roleDisplayName || 'Pharmacist'}
        </p>
        <p className="mt-2 truncate text-[13.5px] font-medium text-[#0f3f3c]">{user.email}</p>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <span className="inline-flex items-center rounded-full bg-[#e8ecee] px-3 py-1 text-[12px] font-medium text-[#4b5c59]">
          Joined {chipDate(user.createdAt)}
        </span>
        <span className="inline-flex items-center rounded-full bg-[#e8ecee] px-3 py-1 text-[12px] font-medium text-[#4b5c59]">
          Last Login {chipDate(user.lastLoginAt)}
        </span>
        {user.status !== 'ACTIVE' ? (
          <span className="inline-flex items-center rounded-full bg-white/80 px-3 py-1 text-[12px] font-medium text-[#7a4b00]">
            {user.status === 'SUSPENDED' ? 'Suspended' : 'Pending'}
          </span>
        ) : null}
      </div>

      <div className="mt-5 grid grid-cols-3 gap-2">
        <Link href={`${basePath}/${user.id}/edit`} className={cardButtonClass}>
          Edit
        </Link>
        <button
          type="button"
          className={cardButtonClass}
          disabled={busy}
          onClick={() => onSuspend(user)}
        >
          {suspended ? 'Reactivate' : 'Suspend'}
        </button>
        <button
          type="button"
          className={cn(cardButtonClass, 'text-[#9a3b32] hover:bg-[#fff5f4] hover:text-[#7a2e28]')}
          disabled={busy}
          onClick={() => onRemove(user)}
        >
          Remove
        </button>
      </div>

      <button
        type="button"
        className={cn(cardButtonClass, 'mt-2')}
        disabled={busy}
        onClick={() => onSendReset(user)}
      >
        Send Password Reset Link
      </button>
    </article>
  );
}
