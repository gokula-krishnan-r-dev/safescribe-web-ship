'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AccessRequestMatchType,
  AccessRequestStatus,
  AccessRequestTab,
  PaginatedResponse,
} from '@safescript/shared';
import { api } from '@/lib/api-client';

export interface AccessRequestPharmacySnapshot {
  id: string;
  name: string;
  slug: string;
  licenceNumber: string | null;
  phone: string | null;
  phixCustomer: boolean;
  status: string;
  timezone: string;
  userCount: number;
  prescribeActive: boolean;
  prescribeIncluded: number | null;
  networks: Array<{
    id: string;
    ipAddress: string;
    cidr: string;
    label: string | null;
    status: string;
    source: string;
  }>;
  users: Array<{
    id: string;
    fullName: string;
    email: string;
    status: string;
    role: string;
  }>;
}

export interface AccessRequestListItem {
  id: string;
  requestNumber: number;
  requestId: string;
  pharmacyName: string;
  licenceNumber: string;
  province: string;
  contactName: string;
  email: string;
  phone: string | null;
  capturedPublicIp: string;
  status: AccessRequestStatus | string;
  displayStatus: string;
  matchType: AccessRequestMatchType | string;
  matchLabel: string;
  source: string;
  sourceLabel: string;
  submittedAt: string;
  possibleDuplicate: boolean;
  matchedPharmacyId: string | null;
  matchedPharmacyName: string | null;
  pharmacyId: string | null;
  pharmacyNameLinked: string | null;
  preview: string;
}

export interface AccessRequestDetail extends Omit<
  AccessRequestListItem,
  'preview' | 'matchedPharmacyName' | 'pharmacyNameLinked' | 'matchedPharmacyId' | 'pharmacyId'
> {
  submissionPublicIp: string | null;
  ipDiscrepancy: boolean;
  matchConfidence: string | null;
  matchReasons: string[];
  rejectReason: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  userAgent: string | null;
  notes: string | null;
  reviewedAt: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
  createdAt: string;
  updatedAt: string;
  matchedPharmacy: AccessRequestPharmacySnapshot | null;
  pharmacy: AccessRequestPharmacySnapshot | null;
  reviewedBy: { id: string; fullName: string } | null;
  activity: Array<{ at: string; label: string }>;
}

export interface AccessRequestTabCounts {
  all: number;
  pending: number;
  new: number;
  existing: number;
  activated: number;
  rejected: number;
}

export interface AccessRequestSummary {
  pendingReview: number;
  existingMatches: number;
  activatedToday: number;
  newPharmaciesActivated: number;
  rejected: number;
  needsReview: number;
  all: number;
  navBadge: number;
  tabs: AccessRequestTabCounts;
}

export type AccessRequestListResponse = PaginatedResponse<AccessRequestListItem> & {
  counts: AccessRequestTabCounts;
  summary: AccessRequestSummary;
};

export interface AccessRequestListParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  tab?: AccessRequestTab | string;
  matchType?: string;
  source?: string;
  province?: string;
}

function toQuery(params: AccessRequestListParams) {
  const qs = new URLSearchParams();
  qs.set('page', String(params.page ?? 1));
  qs.set('limit', String(params.limit ?? 25));
  if (params.search) qs.set('search', params.search);
  if (params.status) qs.set('status', params.status);
  if (params.tab) qs.set('tab', params.tab);
  if (params.matchType) qs.set('matchType', params.matchType);
  if (params.source) qs.set('source', params.source);
  if (params.province) qs.set('province', params.province);
  return qs.toString();
}

function invalidateAccessRequests(queryClient: ReturnType<typeof useQueryClient>, id?: string) {
  void queryClient.invalidateQueries({ queryKey: ['access-requests'] });
  void queryClient.invalidateQueries({ queryKey: ['access-request-summary'] });
  if (id) void queryClient.invalidateQueries({ queryKey: ['access-request', id] });
}

export function useAccessRequests(params: AccessRequestListParams) {
  return useQuery({
    queryKey: ['access-requests', params],
    queryFn: () => api.get<AccessRequestListResponse>(`/access-requests?${toQuery(params)}`),
  });
}

export function useAccessRequestSummary(enabled = true) {
  return useQuery({
    queryKey: ['access-request-summary'],
    queryFn: () => api.get<AccessRequestSummary>('/access-requests/summary'),
    enabled,
    staleTime: 30_000,
  });
}

export function useAccessRequest(id: string | null) {
  return useQuery({
    queryKey: ['access-request', id],
    queryFn: () => api.get<AccessRequestDetail>(`/access-requests/${id}`),
    enabled: !!id,
  });
}

export function useApproveNewAccessRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: string;
      notes?: string;
      forceCreate?: boolean;
    }) => api.post<AccessRequestDetail>(`/access-requests/${id}/approve-new`, body),
    onSuccess: (data) => {
      invalidateAccessRequests(queryClient, data.id);
      queryClient.setQueryData(['access-request', data.id], data);
    },
  });
}

export function useLinkExistingAccessRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: string;
      pharmacyId?: string;
      notes?: string;
    }) => api.post<AccessRequestDetail>(`/access-requests/${id}/link-existing`, body),
    onSuccess: (data) => {
      invalidateAccessRequests(queryClient, data.id);
      queryClient.setQueryData(['access-request', data.id], data);
    },
  });
}

export function useRejectAccessRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: string;
      reason?: string;
      notes?: string;
    }) => api.post<AccessRequestDetail>(`/access-requests/${id}/reject`, body),
    onSuccess: (data) => {
      invalidateAccessRequests(queryClient, data.id);
      queryClient.setQueryData(['access-request', data.id], data);
    },
  });
}

export function useNeedsReviewAccessRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, notes }: { id: string; notes?: string }) =>
      api.post<AccessRequestDetail>(`/access-requests/${id}/needs-review`, { notes }),
    onSuccess: (data) => {
      invalidateAccessRequests(queryClient, data.id);
      queryClient.setQueryData(['access-request', data.id], data);
    },
  });
}

export function useRecheckAccessRequestMatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<AccessRequestDetail>(`/access-requests/${id}/recheck-match`),
    onSuccess: (data) => {
      invalidateAccessRequests(queryClient, data.id);
      queryClient.setQueryData(['access-request', data.id], data);
    },
  });
}

export function useSaveAccessRequestNotes() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, notes }: { id: string; notes: string }) =>
      api.patch<AccessRequestDetail>(`/access-requests/${id}/notes`, { notes }),
    onSuccess: (data) => {
      queryClient.setQueryData(['access-request', data.id], data);
    },
  });
}

export function accessRequestExportQuery(params: AccessRequestListParams) {
  return toQuery({ ...params, page: undefined, limit: undefined });
}

export function pharmacyManagementHref(tenantId: string) {
  return `/super-admin/management?section=pharmacies&tenant=${encodeURIComponent(tenantId)}`;
}
