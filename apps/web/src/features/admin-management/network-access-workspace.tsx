'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Building2, Network, Search, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/shared/status-badge';
import { Badge } from '@/components/ui/badge';
import { PharmacyNetworkAccessPanel } from './pharmacy-network-access-panel';
import {
  usePharmacyNetworkSummaries,
  type PharmacyNetworkSummary,
} from './pharmacy-network-hooks';

export function NetworkAccessWorkspace() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedId = searchParams.get('tenant');
  const [search, setSearch] = useState('');
  const { data: pharmacies, isLoading } = usePharmacyNetworkSummaries();

  const filtered = useMemo(() => {
    if (!pharmacies) return [];
    const q = search.trim().toLowerCase();
    if (!q) return pharmacies;
    return pharmacies.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.adminName?.toLowerCase().includes(q) ||
        p.adminEmail?.toLowerCase().includes(q),
    );
  }, [pharmacies, search]);

  useEffect(() => {
    if (!pharmacies?.length) return;
    if (selectedId && pharmacies.some((p) => p.id === selectedId)) return;
    router.replace(`/super-admin/network-access?tenant=${pharmacies[0].id}`);
  }, [pharmacies, selectedId, router]);

  const selected = pharmacies?.find((p) => p.id === selectedId) ?? null;

  const selectPharmacy = (id: string) => {
    router.replace(`/super-admin/network-access?tenant=${id}`);
  };

  return (
    <div className="flex min-h-[calc(100dvh-4.25rem)] flex-col md:min-h-full md:flex-row">
      <aside className="flex w-full shrink-0 flex-col border-b border-border bg-card md:w-80 md:border-b-0 md:border-r">
        <div className="border-b border-border p-4">
          <div className="flex items-center gap-2">
            <Network className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">Network Access</h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Choose a pharmacy to review and edit allowed IPs.
          </p>
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
          {isLoading ? (
            <div className="space-y-2 p-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-16 animate-pulse rounded-xl bg-muted" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              No pharmacies found. Try a different search.
            </p>
          ) : (
            <div className="space-y-1">
              {filtered.map((pharmacy) => (
                <PharmacyNetworkListItem
                  key={pharmacy.id}
                  pharmacy={pharmacy}
                  selected={selectedId === pharmacy.id}
                  onSelect={() => selectPharmacy(pharmacy.id)}
                />
              ))}
            </div>
          )}
        </div>
      </aside>

      <main className="page-gradient min-h-0 flex-1 overflow-auto p-6 sm:p-8">
        {selected ? (
          <PharmacyNetworkAccessPanel
            tenantId={selected.id}
            pharmacyName={selected.name}
            embedded
          />
        ) : (
          <div className="flex min-h-[50vh] flex-col items-center justify-center text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <h1 className="mt-4 text-lg font-semibold">Select a pharmacy</h1>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              Network access is managed per pharmacy. Pick one from the list to add or edit
              allowed IP addresses.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}

function PharmacyNetworkListItem({
  pharmacy,
  selected,
  onSelect,
}: {
  pharmacy: PharmacyNetworkSummary;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-all',
        selected ? 'list-item-active' : 'hover:bg-muted/80',
      )}
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted">
        <Building2 className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{pharmacy.name}</p>
        <p className="truncate text-xs text-muted-foreground">
          {pharmacy.adminName ?? 'No admin assigned yet'}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <StatusBadge status={pharmacy.status} />
          {pharmacy.restrictionActive ? (
            <Badge variant="success" className="px-1.5 py-0 text-[10px] font-medium">
              Restricted · {pharmacy.approvedNetworkCount} IP
              {pharmacy.approvedNetworkCount === 1 ? '' : 's'}
            </Badge>
          ) : pharmacy.networkAccessEnabled === false ? (
            <Badge variant="warning" className="px-1.5 py-0 text-[10px] font-medium">
              Off · any location
            </Badge>
          ) : (
            <Badge variant="outline" className="px-1.5 py-0 text-[10px] font-medium">
              On · no IPs yet
            </Badge>
          )}
          {pharmacy.pendingVerificationCount > 0 ? (
            <Badge variant="warning" className="px-1.5 py-0 text-[10px] font-medium">
              Pending link
            </Badge>
          ) : null}
        </div>
      </div>
    </button>
  );
}
