import { create } from 'zustand';
import type { AuthUser, LoginChannel, LoginEmail2faChallengeResponse } from '@safescript/shared';
import { LOGIN_CHANNELS } from '@safescript/shared';
import { api } from '@/lib/api-client';

interface AuthState {
  user: (AuthUser & { firstName?: string; lastName?: string }) | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  email2fa: LoginEmail2faChallengeResponse | null;
  setUser: (user: AuthState['user']) => void;
  clearEmail2fa: () => void;
  login: (
    email: string,
    password: string,
    rememberMe?: boolean,
    loginChannel?: LoginChannel,
    tenantId?: string,
  ) => Promise<'authenticated' | 'email_2fa'>;
  verifyLoginEmail: (token: string) => Promise<void>;
  resendLoginEmail: () => Promise<LoginEmail2faChallengeResponse>;
  logout: (opts?: { source?: string }) => Promise<void>;
  fetchMe: () => Promise<void>;
  initialize: () => Promise<void>;
}

type LoginApiResponse =
  | {
      accessToken: string;
      refreshToken: string;
      user: AuthState['user'];
      requiresEmailVerification?: false;
    }
  | LoginEmail2faChallengeResponse;

function isEmail2faChallenge(res: LoginApiResponse): res is LoginEmail2faChallengeResponse {
  return (
    typeof res === 'object' &&
    res !== null &&
    'requiresEmailVerification' in res &&
    res.requiresEmailVerification === true
  );
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isLoading: true,
  isAuthenticated: false,
  email2fa: null,

  setUser: (user) => set({ user, isAuthenticated: !!user }),

  clearEmail2fa: () => set({ email2fa: null }),

  login: async (email, password, rememberMe, loginChannel = LOGIN_CHANNELS.PHARMACY, tenantId) => {
    const res = await api.post<LoginApiResponse>('/auth/login', {
      email,
      password,
      rememberMe,
      loginChannel,
      tenantId,
    });

    if (isEmail2faChallenge(res)) {
      set({ email2fa: res, user: null, isAuthenticated: false });
      return 'email_2fa';
    }

    api.setTokens(res.accessToken, res.refreshToken);
    set({ user: res.user, isAuthenticated: true, email2fa: null });
    return 'authenticated';
  },

  verifyLoginEmail: async (token) => {
    const res = await api.post<{
      accessToken: string;
      refreshToken: string;
      user: AuthState['user'];
    }>('/auth/verify-login-email', { token });
    api.setTokens(res.accessToken, res.refreshToken);
    set({ user: res.user, isAuthenticated: true, email2fa: null });
  },

  resendLoginEmail: async () => {
    const challengeId = get().email2fa?.challengeId;
    if (!challengeId) {
      throw new Error('No pending verification');
    }
    const res = await api.post<LoginEmail2faChallengeResponse>('/auth/resend-login-email', {
      challengeId,
    });
    set({ email2fa: res });
    return res;
  },

  logout: async (opts) => {
    try {
      const refreshToken = localStorage.getItem('refreshToken');
      await api.post('/auth/logout', { refreshToken, source: opts?.source });
    } catch {
      // ignore
    }
    api.clearTokens();
    set({ user: null, isAuthenticated: false, email2fa: null });
  },

  fetchMe: async () => {
    const user = await api.get<AuthState['user']>('/auth/me');
    set({ user, isAuthenticated: true });
  },

  initialize: async () => {
    api.loadTokens();
    if (!api.getAccessToken()) {
      set({ isLoading: false, isAuthenticated: false });
      return;
    }
    try {
      await get().fetchMe();
    } catch {
      api.clearTokens();
      set({ user: null, isAuthenticated: false });
    } finally {
      set({ isLoading: false });
    }
  },
}));
