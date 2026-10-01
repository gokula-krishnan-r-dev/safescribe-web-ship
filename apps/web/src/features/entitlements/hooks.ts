'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import type { EntitlementUsageSnapshot, PharmacyUsageHealth } from '@safescript/shared';
import { ACCESS_DENIAL_CODES } from '@safescript/shared';
import { getErrorCode } from '@/lib/errors';

export const entitlementKeys = {
  all: ['entitlements'] as const,
  usage: (module?: string) => [...entitlementKeys.all, 'usage', module ?? 'prescribe'] as const,
  pharmacy: (tenantId: string) => [...entitlementKeys.all, 'pharmacy', tenantId] as const,
  platformOverview: (module?: string) =>
    [...entitlementKeys.all, 'platform-overview', module ?? 'prescribe'] as const,
  pharmacyAnalysis: (tenantId: string, module?: string) =>
    [...entitlementKeys.all, 'pharmacy-analysis', tenantId, module ?? 'prescribe'] as const,
};

export interface MyEntitlementUsage {
  timezone: string | null;
  current: EntitlementUsageSnapshot | null;
}

export interface PharmacyEntitlementsResponse {
  timezone: string;
  entitlements: EntitlementUsageSnapshot[];
}

export function usePrescribeUsage(opts: { enabled?: boolean } = {}) {
  return useModuleUsage('prescribe', opts);
}

export function useRenewUsage(opts: { enabled?: boolean } = {}) {
  return useModuleUsage('renew', opts);
}

function useModuleUsage(module: string, opts: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: entitlementKeys.usage(module),
    queryFn: () => api.get<MyEntitlementUsage>(`/entitlements/usage?module=${module}`),
    enabled: opts.enabled !== false,
    staleTime: 15_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
}

export function usePharmacyEntitlements(tenantId: string | null) {
  return useQuery({
    queryKey: entitlementKeys.pharmacy(tenantId ?? ''),
    queryFn: () => api.get<PharmacyEntitlementsResponse>(`/entitlements/pharmacy/${tenantId}`),
    enabled: Boolean(tenantId),
  });
}

export function useUpdatePharmacyEntitlements(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      timezone?: string;
      items?: Array<{
        module: string;
        includedQuantity?: number | null;
        period?: string;
        active?: boolean;
      }>;
    }) => api.put<PharmacyEntitlementsResponse>(`/entitlements/pharmacy/${tenantId}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: entitlementKeys.all });
      qc.invalidateQueries({ queryKey: ['tenant', tenantId] });
    },
  });
}

export function isDailyLimitReached(error: unknown): boolean {
  return getErrorCode(error) === ACCESS_DENIAL_CODES.DAILY_LIMIT_REACHED;
}

export interface PharmacyUsageOverviewRow {
  tenantId: string;
  name: string;
  status: string;
  timezone: string;
  adminName: string | null;
  pharmacistCount: number;
  snapshot: EntitlementUsageSnapshot;
  health: PharmacyUsageHealth;
  utilizationPct: number | null;
}

export interface PharmacyUsageOverview {
  generatedAt: string;
  module: string;
  moduleLabel: string;
  summary: {
    pharmacyCount: number;
    activeCount: number;
    inactiveCount: number;
    assessmentsToday: number;
    atLimitCount: number;
    nearingLimitCount: number;
  };
  pharmacies: PharmacyUsageOverviewRow[];
}

export interface PharmacyUsageAnalysis {
  pharmacy: { id: string; name: string; status: string; timezone: string };
  snapshot: EntitlementUsageSnapshot;
  pharmacists: Array<{
    userId: string;
    fullName: string;
    role: string;
    status: string;
    used: number;
  }>;
  trend: Array<{ date: string; used: number }>;
}

export function usePharmacyUsageOverview() {
  return useQuery({
    queryKey: entitlementKeys.platformOverview('prescribe'),
    queryFn: () =>
      api.get<PharmacyUsageOverview>('/entitlements/platform/overview?module=prescribe'),
    staleTime: 20_000,
    refetchInterval: 60_000,
  });
}

export function usePharmacyUsageAnalysis(tenantId: string | null) {
  return useQuery({
    queryKey: entitlementKeys.pharmacyAnalysis(tenantId ?? ''),
    queryFn: () =>
      api.get<PharmacyUsageAnalysis>(
        `/entitlements/pharmacy/${tenantId}/analysis?module=prescribe`,
      ),
    enabled: Boolean(tenantId),
    staleTime: 15_000,
  });
}
