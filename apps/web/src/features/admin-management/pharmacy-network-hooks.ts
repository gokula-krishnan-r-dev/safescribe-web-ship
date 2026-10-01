'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { discoverPublicIpv4 } from './discover-public-ipv4';

export interface PharmacyNetworkRow {
  id: string;
  tenantId: string;
  ipAddress: string;
  cidr: string;
  label: string | null;
  status: 'PENDING' | 'APPROVED' | 'DISABLED';
  source: 'MANUAL' | 'VERIFICATION_LINK';
  createdAt: string;
  approvedAt: string | null;
  lastVerifiedAt: string | null;
  matchesCurrentRequest?: boolean;
}

export interface PharmacyVerificationRow {
  id: string;
  email: string;
  status: 'SENT' | 'OPENED' | 'CONFIRMED' | 'APPROVED' | 'EXPIRED' | 'CANCELLED' | 'REJECTED';
  detectedIp: string | null;
  expiresAt: string;
  createdAt: string;
}

export interface PharmacyNetworkOverview {
  pharmacy: { id: string; name: string; status: string; email: string | null };
  networkAccessEnabled?: boolean;
  restrictionActive: boolean;
  networks: PharmacyNetworkRow[];
  verifications: PharmacyVerificationRow[];
}

export interface PharmacyNetworkSummary {
  id: string;
  name: string;
  status: string;
  adminName: string | null;
  adminEmail: string | null;
  approvedNetworkCount: number;
  pendingVerificationCount: number;
  networkAccessEnabled?: boolean;
  restrictionActive: boolean;
}

const SUMMARIES_KEY = ['pharmacy-network-summaries'] as const;
const CURRENT_IP_KEY = ['pharmacy-network-current-ip'] as const;
const CURRENT_IPV4_KEY = ['pharmacy-network-public-ipv4'] as const;
const key = (tenantId: string) => ['pharmacy-networks', tenantId] as const;

export interface DetectedPublicIp {
  ipAddress: string | null;
  family?: 'ipv4' | 'ipv6' | null;
  recommendedCidr?: string | null;
  ipv4Address?: string | null;
  isPrivate: boolean;
  isCloudflare?: boolean;
  usable?: boolean;
}

export function networkMatchesIp(network: PharmacyNetworkRow, ip: string) {
  if (network.matchesCurrentRequest) return true;
  const needle = ip.trim().toLowerCase();
  if (!needle) return false;
  return (
    network.ipAddress.toLowerCase() === needle ||
    network.cidr.toLowerCase() === needle ||
    network.cidr.toLowerCase() === `${needle}/32` ||
    network.cidr.toLowerCase() === `${needle}/48` ||
    network.cidr.toLowerCase() === `${needle}/56` ||
    network.cidr.toLowerCase() === `${needle}/64` ||
    network.cidr.toLowerCase() === `${needle}/128`
  );
}

function hasOpenVerification(data: PharmacyNetworkOverview | undefined) {
  return Boolean(
    data?.verifications.some((v) => v.status === 'SENT' || v.status === 'OPENED'),
  );
}

export function usePharmacyNetworkSummaries() {
  return useQuery({
    queryKey: SUMMARIES_KEY,
    queryFn: () => api.get<PharmacyNetworkSummary[]>('/ip-access/pharmacies'),
    staleTime: 30_000,
  });
}

export function useCurrentPublicIp(enabled = true) {
  const server = useQuery({
    queryKey: CURRENT_IP_KEY,
    queryFn: () => api.get<DetectedPublicIp>('/ip-access/current-ip'),
    enabled,
    staleTime: 60_000,
    retry: 1,
  });
  const ipv4 = useQuery({
    queryKey: CURRENT_IPV4_KEY,
    queryFn: () => discoverPublicIpv4(),
    enabled: enabled && server.data?.family === 'ipv6' && server.data.usable !== false,
    staleTime: 60_000,
    retry: 0,
  });

  const ipv4Address =
    server.data?.family === 'ipv4' ? server.data.ipAddress : (ipv4.data ?? null);

  const data: DetectedPublicIp | undefined = server.data
    ? { ...server.data, ipv4Address }
    : undefined;

  return {
    ...server,
    isFetching: server.isFetching || (ipv4.isFetching && !ipv4.data),
    data,
  };
}

export function usePharmacyNetworkOverview(tenantId: string, enabled = true) {
  return useQuery({
    queryKey: key(tenantId),
    queryFn: () => api.get<PharmacyNetworkOverview>(`/ip-access/pharmacies/${tenantId}`),
    enabled: Boolean(tenantId) && enabled,
    refetchInterval: (query) =>
      enabled && hasOpenVerification(query.state.data) ? 8_000 : false,
  });
}

export function usePharmacyNetworkMutations(tenantId: string) {
  const qc = useQueryClient();
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: key(tenantId) });
    void qc.invalidateQueries({ queryKey: SUMMARIES_KEY });
  };

  const add = useMutation({
    mutationFn: (data: { cidr: string; label?: string }) =>
      api.post(`/ip-access/pharmacies/${tenantId}/networks`, data),
    onSuccess: invalidate,
  });
  const update = useMutation({
    mutationFn: ({ id, ...data }: { id: string; cidr?: string; label?: string }) =>
      api.patch(`/ip-access/networks/${id}`, data),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/ip-access/networks/${id}`),
    onSuccess: invalidate,
  });
  const approve = useMutation({
    mutationFn: (id: string) => api.post(`/ip-access/networks/${id}/approve`),
    onSuccess: invalidate,
  });
  const reject = useMutation({
    mutationFn: (id: string) => api.post(`/ip-access/networks/${id}/reject`),
    onSuccess: invalidate,
  });
  const sendLink = useMutation({
    mutationFn: (email: string) =>
      api.post(`/ip-access/pharmacies/${tenantId}/verifications`, { email }),
    onSuccess: invalidate,
  });
  const setEnabled = useMutation({
    mutationFn: (networkAccessEnabled: boolean) =>
      api.patch(`/ip-access/pharmacies/${tenantId}`, { networkAccessEnabled }),
    onSuccess: invalidate,
  });
  const cancelLink = useMutation({
    mutationFn: (id: string) => api.post(`/ip-access/verifications/${id}/cancel`),
    onSuccess: invalidate,
  });

  return { add, update, remove, approve, reject, sendLink, setEnabled, cancelLink };
}
