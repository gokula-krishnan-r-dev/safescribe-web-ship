'use client';

import Link from 'next/link';
import { Pencil, Trash2, KeyRound, UserX, UserCheck, Eye } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { StatusBadge } from '@/components/shared/status-badge';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export interface PharmacyUserCardData {
  id: string;
  fullName: string;
  email: string;
  role: string;
  roleDisplayName: string;
  status: string;
  createdAt: string;
  lastLoginAt?: string | null;
  organization?: string | null;
}

interface PharmacyUserCardProps {
  user: PharmacyUserCardData;
  tenantId?: string;
  onSuspend?: (user: PharmacyUserCardData) => void;
  onDelete?: (user: PharmacyUserCardData) => void;
  onResetPassword?: (user: PharmacyUserCardData) => void;
  compact?: boolean;
}

export function PharmacyUserCard({
  user,
  tenantId,
  onSuspend,
  onDelete,
  onResetPassword,
  compact = false,
}: PharmacyUserCardProps) {
  const isOwner = user.role === 'PHARMACIST_ADMIN';
  const viewHref =
    user.role === 'PHARMACIST_ADMIN'
      ? `/super-admin/pharmacist-admins/${user.id}`
      : `/super-admin/management?section=users&tenant=${tenantId ?? ''}`;
  const editHref =
    user.role === 'PHARMACIST_ADMIN'
      ? `/super-admin/pharmacist-admins/${user.id}/edit`
      : `/super-admin/pharmacist-admins/create`;

  return (
    <div className="flex h-full flex-col rounded-xl border border-primary/10 bg-primary/[0.06] p-5 shadow-sm transition-all hover:border-primary/25 hover:shadow-md">
      <div className="mb-4">
        <h3 className="text-base font-semibold text-primary">{user.fullName}</h3>
        <p className="text-sm font-medium text-primary">{user.roleDisplayName}</p>
        {user.organization && (
          <p className="mt-0.5 text-xs text-muted-foreground">{user.organization}</p>
        )}
        <p className="mt-1 text-sm text-muted-foreground">{user.email}</p>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <Badge variant="success">Joined {formatDate(user.createdAt).split(',')[0]}</Badge>
        {user.lastLoginAt && (
          <Badge variant="outline">Last sign-in {formatDate(user.lastLoginAt).split(',')[0]}</Badge>
        )}
        <StatusBadge status={user.status} />
        {isOwner && <Badge className="bg-primary/10 text-primary">Pharmacy owner</Badge>}
      </div>

      <div className="mt-auto space-y-2">
        {compact ? (
          <div className="grid grid-cols-2 gap-2">
            <Link href={viewHref}>
              <Button variant="outline" size="sm" className="w-full">
                <Eye className="h-3.5 w-3.5" />
                View
              </Button>
            </Link>
            <Link href={editHref}>
              <Button variant="outline" size="sm" className="w-full">
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </Button>
            </Link>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2">
              <Link href={editHref} className="col-span-1">
                <Button variant="outline" size="sm" className="w-full bg-white">
                  <Pencil className="h-3.5 w-3.5" />
                  Edit
                </Button>
              </Link>
              {onSuspend && (
                <Button variant="outline" size="sm" className="bg-white" onClick={() => onSuspend(user)}>
                  {user.status === 'ACTIVE' ? (
                    <><UserX className="h-3.5 w-3.5" /> Suspend</>
                  ) : (
                    <><UserCheck className="h-3.5 w-3.5" /> Reactivate</>
                  )}
                </Button>
              )}
              {onDelete && (
                <Button
                  variant="outline"
                  size="sm"
                  className="bg-white text-destructive hover:text-destructive"
                  onClick={() => onDelete(user)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Remove
                </Button>
              )}
            </div>
            {onResetPassword && (
              <Button variant="outline" size="sm" className="w-full bg-white" onClick={() => onResetPassword(user)}>
                <KeyRound className="h-3.5 w-3.5" />
                Send Password Reset Link
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
