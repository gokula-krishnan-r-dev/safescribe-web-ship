'use client';

import Link from 'next/link';
import {
  Eye,
  Pencil,
  Trash2,
  UserCheck,
  UserX,
  MoreHorizontal,
  KeyRound,
  LockKeyhole,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface TableRowActionsProps {
  viewHref: string;
  editHref: string;
  status: string;
  onToggleStatus: () => void;
  onDelete: () => void;
  onChangePassword?: () => void;
  onResetPassword?: () => void;
  isStatusPending?: boolean;
}

export function TableRowActions({
  viewHref,
  editHref,
  status,
  onToggleStatus,
  onDelete,
  onChangePassword,
  onResetPassword,
  isStatusPending,
}: TableRowActionsProps) {
  const isActive = status === 'ACTIVE';

  return (
    <div className="flex justify-end">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9 rounded-lg border-border/80 bg-white shadow-none"
            aria-label="User actions"
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52 rounded-xl p-1.5">
          <DropdownMenuItem asChild>
            <Link href={viewHref} className="flex items-center gap-2">
              <Eye className="h-4 w-4" />
              View profile
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href={editHref} className="flex items-center gap-2">
              <Pencil className="h-4 w-4" />
              Edit details
            </Link>
          </DropdownMenuItem>
          {onChangePassword ? (
            <DropdownMenuItem onSelect={onChangePassword}>
              <LockKeyhole className="h-4 w-4" />
              Change password
            </DropdownMenuItem>
          ) : null}
          {onResetPassword ? (
            <DropdownMenuItem onSelect={onResetPassword}>
              <KeyRound className="h-4 w-4" />
              Reset password
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={isStatusPending} onSelect={onToggleStatus}>
            {isActive ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
            {isActive ? 'Deactivate' : 'Activate'}
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={onDelete}
            className="text-destructive focus:bg-destructive/10 focus:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
            Remove
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
