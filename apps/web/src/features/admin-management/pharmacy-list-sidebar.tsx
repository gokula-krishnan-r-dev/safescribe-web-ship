'use client';

import { useMemo, useState } from 'react';
import { Building2, Search, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/shared/status-badge';
import { useTenants } from './hooks';
import type { AdminSection } from './admin-management-page';

interface PharmacyListSidebarProps {
  section: AdminSection;
  selectedTenantId: string;
  onSelectTenant: (tenantId: string) => void;
}

export function PharmacyListSidebar({ section, selectedTenantId, onSelectTenant }: PharmacyListSidebarProps) {
  const [search, setSearch] = useState('');
  const { data: tenants, isLoading } = useTenants();

  const filtered = useMemo(() => {
    if (!tenants) return [];
    if (!search.trim()) return tenants;
    const q = search.toLowerCase();
    return tenants.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.admin?.fullName.toLowerCase().includes(q) ||
        t.admin?.email.toLowerCase().includes(q),
    );
  }, [tenants, search]);

  const title = section === 'pharmacies' ? 'Pharmacies' : 'Filter by pharmacy';

  return (
    <aside className="flex w-72 shrink-0 flex-col border-r border-border bg-card">
      <div className="border-b border-border p-4">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        <div className="relative mt-3">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search pharmacies…"
            className="border-border/80 bg-background pl-9 shadow-none"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        <button
          type="button"
          onClick={() => onSelectTenant('all')}
          className={cn(
            'mb-2 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-all',
            selectedTenantId === 'all' ? 'list-item-active' : 'hover:bg-muted/80',
          )}
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
            <Building2 className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p>All pharmacies</p>
            <p className="text-xs font-normal text-muted-foreground">
              {tenants?.length ?? 0} on the platform
            </p>
          </div>
        </button>

        {section === 'users' && (
          <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Or pick a pharmacy
          </p>
        )}

        {isLoading ? (
          <div className="space-y-2 p-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-14 animate-pulse rounded-xl bg-muted" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">No pharmacies found. Try a different search.</p>
        ) : (
          <div className="space-y-1">
            {filtered.map((tenant) => (
              <button
                key={tenant.id}
                type="button"
                onClick={() => onSelectTenant(tenant.id)}
                className={cn(
                  'flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-all',
                  selectedTenantId === tenant.id ? 'list-item-active' : 'hover:bg-muted/80',
                )}
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{tenant.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {tenant.admin?.fullName ?? 'No admin assigned yet'}
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    <StatusBadge status={tenant.status} />
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Users className="h-3 w-3" />
                      {tenant.userCount}
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
