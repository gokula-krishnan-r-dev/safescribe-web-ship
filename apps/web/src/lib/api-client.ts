import type { AuthUser } from '@safescript/shared';
import { ACCESS_DENIAL_CODES, professionalAckHref } from '@safescript/shared';
import { getPublicApiUrl } from './api-url';
import { rememberIpAccessDenied } from './ip-access-denied';

function apiBase() {
  return getPublicApiUrl();
}

export interface ApiError {
  statusCode: number;
  message: string | string[] | { code?: string; message?: string };
  error?: string;
  code?: string;
  ipAddress?: string;
  detectedFamily?: 'ipv4' | 'ipv6' | null;
  recommendedCidr?: string | null;
  dualStack?: string;
  errors?: Array<{ sheet: string; row?: number; column?: string; message: string }>;
  checks?: Array<{ id: string; label: string; ok: boolean; detail?: string }>;
  tenants?: Array<{ id: string; name: string }>;
}

class ApiClient {
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  /** Single-flight lock so parallel 401s share one refresh request */
  private refreshPromise: Promise<boolean> | null = null;

  setTokens(access: string, refresh: string) {
    this.accessToken = access;
    this.refreshToken = refresh;
    if (typeof window !== 'undefined') {
      localStorage.setItem('accessToken', access);
      localStorage.setItem('refreshToken', refresh);
    }
  }

  loadTokens() {
    if (typeof window !== 'undefined') {
      this.accessToken = localStorage.getItem('accessToken');
      this.refreshToken = localStorage.getItem('refreshToken');
    }
  }

  clearTokens() {
    this.accessToken = null;
    this.refreshToken = null;
    if (typeof window !== 'undefined') {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
    }
  }

  getAccessToken() {
    if (!this.accessToken && typeof window !== 'undefined') {
      this.accessToken = localStorage.getItem('accessToken');
    }
    return this.accessToken;
  }

  private async refreshAccessToken(): Promise<boolean> {
    if (this.refreshPromise) return this.refreshPromise;

    this.refreshPromise = this.performTokenRefresh().finally(() => {
      this.refreshPromise = null;
    });

    return this.refreshPromise;
  }

  private async performTokenRefresh(): Promise<boolean> {
    this.loadTokens();
    if (!this.refreshToken) return false;

    const presentedRefresh = this.refreshToken;

    try {
      const res = await fetch(`${apiBase()}/api/v1/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: presentedRefresh }),
      });
      if (!res.ok) {
        const error: ApiError = await res.json().catch(() => ({
          statusCode: res.status,
          message: res.statusText,
        }));
        if (error.error === 'IP_ACCESS_DENIED') {
          rememberIpAccessDenied(error);
          this.clearTokens();
          if (typeof window !== 'undefined') {
            window.location.href = '/access-denied';
          }
        }
        // Only clear tokens if this refresh still owns the stored refresh token
        this.loadTokens();
        if (this.refreshToken === presentedRefresh) {
          this.clearTokens();
        }
        return false;
      }
      const data = await res.json();
      this.setTokens(data.accessToken, data.refreshToken);
      return true;
    } catch {
      return false;
    }
  }

  private handleAccessDenied(error: ApiError, path: string) {
    if (
      typeof window !== 'undefined' &&
      error.error === 'IP_ACCESS_DENIED' &&
      !path.startsWith('/auth/login')
    ) {
      rememberIpAccessDenied(error);
      this.clearTokens();
      window.location.href = '/access-denied';
      return;
    }
    this.handleProfessionalAckRequired(error, path);
  }

  private handleProfessionalAckRequired(error: ApiError, path: string) {
    if (typeof window === 'undefined') return;
    if (error.error !== ACCESS_DENIAL_CODES.PROFESSIONAL_ACK_REQUIRED) return;
    if (
      path.startsWith('/professional-use-acknowledgement') ||
      path.startsWith('/auth/')
    ) {
      return;
    }
    const pagePath = window.location.pathname;
    if (
      pagePath.startsWith('/professional-use-acknowledgement') ||
      pagePath === '/terms' ||
      pagePath === '/privacy' ||
      pagePath.startsWith('/login')
    ) {
      return;
    }
    const returnTo = `${pagePath}${window.location.search}`;
    const isAdminPath = pagePath === '/admin' || pagePath.startsWith('/admin/');
    window.location.replace(
      professionalAckHref(
        returnTo,
        isAdminPath ? '/admin' : undefined,
        isAdminPath ? 'PHARMACIST_ADMIN' : 'PHARMACIST',
      ),
    );
  }

  async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    this.loadTokens();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };
    const isPublicNetworkVerify =
      path.startsWith('/network-verify/') || path.startsWith('/public/');
    if (this.accessToken && !isPublicNetworkVerify) {
      headers.Authorization = `Bearer ${this.accessToken}`;
    }

    let res = await fetch(`${apiBase()}/api/v1${path}`, { ...options, headers });

    if (res.status === 401 && this.refreshToken && !isPublicNetworkVerify) {
      const refreshed = await this.refreshAccessToken();
      if (refreshed) {
        headers.Authorization = `Bearer ${this.getAccessToken()}`;
        res = await fetch(`${apiBase()}/api/v1${path}`, { ...options, headers });
      }
    }

    if (!res.ok) {
      const error: ApiError = await res.json().catch(() => ({
        statusCode: res.status,
        message: res.statusText,
      }));
      this.handleAccessDenied(error, path);
      throw error;
    }

    if (res.status === 204) return {} as T;
    return res.json();
  }

  get<T>(path: string) {
    return this.request<T>(path);
  }

  post<T>(path: string, body?: unknown) {
    return this.request<T>(path, { method: 'POST', body: JSON.stringify(body) });
  }

  patch<T>(path: string, body?: unknown) {
    return this.request<T>(path, { method: 'PATCH', body: JSON.stringify(body) });
  }

  put<T>(path: string, body?: unknown) {
    return this.request<T>(path, { method: 'PUT', body: JSON.stringify(body) });
  }

  delete<T>(path: string) {
    return this.request<T>(path, { method: 'DELETE' });
  }

  async upload<T>(path: string, formData: FormData, method: 'POST' | 'PUT' = 'POST'): Promise<T> {
    this.loadTokens();
    const headers: Record<string, string> = {};
    if (this.accessToken) headers.Authorization = `Bearer ${this.accessToken}`;

    let res = await fetch(`${apiBase()}/api/v1${path}`, {
      method,
      headers,
      body: formData,
    });

    if (res.status === 401 && this.refreshToken) {
      const refreshed = await this.refreshAccessToken();
      if (refreshed) {
        headers.Authorization = `Bearer ${this.getAccessToken()}`;
        res = await fetch(`${apiBase()}/api/v1${path}`, { method, headers, body: formData });
      }
    }

    if (!res.ok) {
      const error: ApiError = await res.json().catch(() => ({
        statusCode: res.status,
        message: res.statusText,
      }));
      this.handleAccessDenied(error, path);
      throw error;
    }

    return res.json();
  }

  async download(path: string): Promise<Blob> {
    this.loadTokens();
    const headers: Record<string, string> = {};
    if (this.accessToken) headers.Authorization = `Bearer ${this.accessToken}`;

    let res = await fetch(`${apiBase()}/api/v1${path}`, { headers });

    if (res.status === 401 && this.refreshToken) {
      const refreshed = await this.refreshAccessToken();
      if (refreshed) {
        headers.Authorization = `Bearer ${this.getAccessToken()}`;
        res = await fetch(`${apiBase()}/api/v1${path}`, { headers });
      }
    }

    if (!res.ok) {
      const error: ApiError = await res.json().catch(() => ({
        statusCode: res.status,
        message: res.statusText,
      }));
      throw error;
    }

    return res.blob();
  }
}

export const api = new ApiClient();

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: AuthUser & { firstName: string; lastName: string };
}

export interface PaginatedUsers {
  data: UserListItem[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

export interface UserListItem {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  fullName: string;
  status: string;
  tenantId: string | null;
  organization: string | null;
  role: string;
  roleDisplayName: string;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TenantListItem {
  id: string;
  name: string;
  slug: string;
  status: string;
  faxNumber?: string | null;
  phone?: string | null;
  address?: string | null;
  pharmacyLicenseNumber?: string | null;
  phixCustomer?: boolean;
  phixPharmacyId?: string | null;
  timezone?: string;
  createdAt: string;
  updatedAt: string;
  userCount: number;
  pharmacistCount?: number;
  prescribe?: {
    active: boolean;
    included: number | null;
    period: string;
  } | null;
  admin: {
    id: string;
    fullName: string;
    email: string;
    status: string;
    lastLoginAt: string | null;
  } | null;
}

export interface TenantDetail {
  id: string;
  name: string;
  slug: string;
  status: string;
  faxNumber?: string | null;
  phone?: string | null;
  address?: string | null;
  hasLogo?: boolean;
  createdAt: string;
  updatedAt: string;
  admin: {
    id: string;
    firstName: string;
    lastName: string;
    fullName: string;
    email: string;
    status: string;
    lastLoginAt: string | null;
    createdAt: string;
    emailVerifiedAt: string | null;
  } | null;
  counts: {
    totalUsers: number;
    pharmacists: number;
    admins: number;
  };
  users: Array<{
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    fullName: string;
    status: string;
    role: string;
    roleDisplayName: string;
    lastLoginAt: string | null;
    createdAt: string;
  }>;
}
