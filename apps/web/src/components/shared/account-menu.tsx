'use client';

import Link from 'next/link';
import { ChevronUp, KeyRound, LogOut, Settings } from 'lucide-react';
import { UserAvatar } from '@/components/shared/user-avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface AccountMenuProps {
  name: string;
  email?: string | null;
  roleLabel: string;
  settingsHref?: string | null;
  collapsed?: boolean;
  onChangePassword?: () => void;
  onLogout: () => void;
}

export function AccountMenu({
  name,
  email,
  roleLabel,
  settingsHref,
  collapsed = false,
  onChangePassword,
  onLogout,
}: AccountMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {collapsed ? (
          <button
            type="button"
            title={name}
            aria-label={`Account menu for ${name}`}
            className="flex h-9 w-9 items-center justify-center rounded-full outline-none ring-offset-background hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <UserAvatar name={name} size="sm" className="h-8 w-8 ring-0 shadow-none" />
          </button>
        ) : (
          <button
            type="button"
            aria-label="Open account menu"
            className="flex w-full items-center gap-3 rounded-lg px-1 py-1 text-left outline-none transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <UserAvatar name={name} size="sm" className="h-9 w-9 ring-0 shadow-none" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold leading-tight text-foreground">
                {name}
              </p>
              <p className="mt-0.5 truncate text-xs leading-tight text-muted-foreground">
                {email}
              </p>
            </div>
            <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          </button>
        )}
      </DropdownMenuTrigger>

      <DropdownMenuContent
        side="top"
        align={collapsed ? 'center' : 'start'}
        sideOffset={8}
        className="w-[240px] p-1.5"
      >
        <div className="flex items-center gap-2.5 px-2 py-2">
          <UserAvatar name={name} size="sm" className="h-9 w-9 ring-0 shadow-none" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">{name}</p>
            <p className="truncate text-[11px] text-muted-foreground">{email}</p>
            <p className="mt-0.5 text-[11px] font-medium text-[#0f7e99]">{roleLabel}</p>
          </div>
        </div>

        <DropdownMenuSeparator />

        {settingsHref ? (
          <DropdownMenuItem asChild className="cursor-pointer gap-2">
            <Link href={settingsHref}>
              <Settings className="h-4 w-4 text-muted-foreground" />
              Settings
            </Link>
          </DropdownMenuItem>
        ) : null}
        {onChangePassword ? (
          <DropdownMenuItem className="cursor-pointer gap-2" onSelect={onChangePassword}>
            <KeyRound className="h-4 w-4 text-muted-foreground" />
            Change password
          </DropdownMenuItem>
        ) : null}

        <DropdownMenuSeparator />

        <DropdownMenuItem
          className="cursor-pointer gap-2 text-[#b4232a] focus:bg-[#fff5f5] focus:text-[#b4232a]"
          onSelect={onLogout}
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
