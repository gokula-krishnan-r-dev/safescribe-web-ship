'use client';

import { useQuery } from '@tanstack/react-query';
import { api, type PaginatedUsers, type TenantDetail, type TenantListItem, type UserListItem } from '@/lib/api-client';

export function useTenants() {
  return useQuery({
    queryKey: ['tenants'],
    queryFn: () => api.get<TenantListItem[]>('/tenants'),
  });
}

export function useTenant(id: string | null) {
  return useQuery({
    queryKey: ['tenant', id],
    queryFn: () => api.get<TenantDetail>(`/tenants/${id}`),
    enabled: !!id,
  });
}

export interface AllUsersParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  tenantId?: string;
  roleFilter?: 'all' | 'owners' | 'users';
  sortOrder?: 'asc' | 'desc';
}

function buildListQuery(
  params: AllUsersParams,
  overrides?: { limit?: number; page?: number },
): URLSearchParams {
  const qs = new URLSearchParams();
  qs.set('page', String(overrides?.page ?? params.page ?? 1));
  qs.set('limit', String(overrides?.limit ?? params.limit ?? 50));
  if (params.search) qs.set('search', params.search);
  if (params.status) qs.set('status', params.status);
  if (params.sortOrder) qs.set('sortOrder', params.sortOrder);
  qs.set('sortBy', 'createdAt');
  if (params.tenantId) qs.set('tenantId', params.tenantId);
  return qs;
}

function paginateClient(data: UserListItem[], page: number, limit: number): PaginatedUsers {
  const start = (page - 1) * limit;
  return {
    data: data.slice(start, start + limit),
    meta: {
      total: data.length,
      page,
      limit,
      totalPages: Math.ceil(data.length / limit) || 1,
    },
  };
}

export function useAllPlatformUsers(params: AllUsersParams) {
  return useQuery({
    queryKey: ['all-platform-users', params],
    queryFn: async () => {
      const page = params.page ?? 1;
      const limit = params.limit ?? 12;

      if (params.roleFilter === 'owners') {
        return api.get<PaginatedUsers>(`/users/pharmacist-admins?${buildListQuery(params)}`);
      }

      if (params.roleFilter === 'users') {
        return api.get<PaginatedUsers>(`/users/pharmacists?${buildListQuery(params)}`);
      }

      // All users — fetch both roles (single limit param per request)
      const fetchQs = buildListQuery(params, { limit: 100, page: 1 });

      const [admins, pharmacists] = await Promise.all([
        api.get<PaginatedUsers>(`/users/pharmacist-admins?${fetchQs}`),
        api.get<PaginatedUsers>(`/users/pharmacists?${fetchQs}`),
      ]);

      let combined: UserListItem[] = [...admins.data, ...pharmacists.data];

      combined.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );

      if (params.search) {
        const q = params.search.toLowerCase();
        combined = combined.filter(
          (u) =>
            u.fullName.toLowerCase().includes(q) ||
            u.email.toLowerCase().includes(q),
        );
      }

      if (params.status) {
        combined = combined.filter((u) => u.status === params.status);
      }

      return paginateClient(combined, page, limit);
    },
  });
}
