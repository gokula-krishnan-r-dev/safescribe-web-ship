'use client';

import { useQuery } from '@tanstack/react-query';
import { api, type PaginatedUsers, type UserListItem } from '@/lib/api-client';
import type { UserModuleConfig } from './config';

export interface UserListParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export function useUsersList(config: UserModuleConfig, params: UserListParams) {
  return useQuery({
    queryKey: [config.listEndpoint, params],
    queryFn: () => {
      const qs = new URLSearchParams();
      qs.set('page', String(params.page ?? 1));
      qs.set('limit', String(params.limit ?? 10));
      if (params.search) qs.set('search', params.search);
      if (params.status) qs.set('status', params.status);
      if (params.sortBy) qs.set('sortBy', params.sortBy);
      if (params.sortOrder) qs.set('sortOrder', params.sortOrder);
      return api.get<PaginatedUsers>(`${config.listEndpoint}?${qs}`);
    },
  });
}

export function useUser(id: string) {
  return useQuery({
    queryKey: ['user', id],
    queryFn: () => api.get<UserListItem & { updatedAt: string }>(`/users/${id}`),
    enabled: !!id,
  });
}

export function useLoginHistory(id: string) {
  return useQuery({
    queryKey: ['login-history', id],
    queryFn: () =>
      api.get<Array<{ id: string; success: boolean; ipAddress: string | null; userAgent: string | null; createdAt: string }>>(
        `/users/${id}/login-history`,
      ),
    enabled: !!id,
  });
}

export function useUserAuditLogs(userId: string) {
  return useQuery({
    queryKey: ['audit-logs', 'user', userId],
    queryFn: () =>
      api.get<{ data: AuditLogItem[] }>(`/audit-logs?userId=${userId}&limit=20`),
    enabled: !!userId,
  });
}

export interface AuditLogItem {
  id: string;
  action: string;
  module: string;
  ipAddress: string | null;
  userAgent: string | null;
  deviceInfo: string | null;
  browser: string | null;
  previousValue: unknown;
  newValue: unknown;
  metadata: unknown;
  createdAt: string;
  status: string;
  userName: string | null;
  userEmail: string | null;
  userRole: string | null;
  organization: string | null;
  tenantId: string | null;
  userId: string | null;
}

export interface PaginatedAuditLogs {
  data: AuditLogItem[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

export function useAuditLogs(params: Record<string, string | number | undefined>) {
  return useQuery({
    queryKey: ['audit-logs', params],
    queryFn: () => {
      const qs = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== '') qs.set(k, String(v));
      });
      return api.get<PaginatedAuditLogs>(`/audit-logs?${qs}`);
    },
  });
}

export function useAuditLog(id: string) {
  return useQuery({
    queryKey: ['audit-log', id],
    queryFn: () => api.get<AuditLogItem>(`/audit-logs/${id}`),
    enabled: !!id,
  });
}
