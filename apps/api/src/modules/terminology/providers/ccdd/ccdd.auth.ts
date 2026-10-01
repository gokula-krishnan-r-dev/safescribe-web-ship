import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DrugSearchCache } from '../../cache/drug-search.cache';
import { INFOWAY_TOKEN_URL } from './ccdd.constants';

interface TokenResponse {
  access_token: string;
  expires_in: number;
  token_type?: string;
}

/**
 * OAuth2 client-credentials for Infoway Terminology Server.
 * Tokens are cached in Redis (shared) with a safety buffer before expiry.
 */
@Injectable()
export class CcdDAuthService {
  private readonly logger = new Logger(CcdDAuthService.name);
  private inflight: Promise<string> | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly cache: DrugSearchCache,
  ) {}

  get credentialsConfigured(): boolean {
    return Boolean(this.clientId && this.clientSecret);
  }

  private get clientId(): string {
    return this.config.get<string>('INFOWAY_CLIENT_ID')?.trim() ?? '';
  }

  private get clientSecret(): string {
    return this.config.get<string>('INFOWAY_CLIENT_SECRET')?.trim() ?? '';
  }

  async getAccessToken(): Promise<string> {
    if (!this.credentialsConfigured) {
      throw new Error('INFOWAY_CLIENT_ID / INFOWAY_CLIENT_SECRET are not configured');
    }

    const cacheKey = `drug-search:infoway:token:${this.clientId}`;
    const cached = await this.cache.getJson<{ token: string }>(cacheKey);
    if (cached?.token) return cached.token;

    // Single-flight: concurrent searches share one token request
    if (!this.inflight) {
      this.inflight = this.fetchAndCacheToken(cacheKey).finally(() => {
        this.inflight = null;
      });
    }
    return this.inflight;
  }

  private async fetchAndCacheToken(cacheKey: string): Promise<string> {
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: this.clientId,
      client_secret: this.clientSecret,
    });

    const res = await fetch(INFOWAY_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      this.logger.error(`Infoway token request failed (${res.status}): ${text.slice(0, 200)}`);
      throw new Error(`Infoway OAuth failed (${res.status})`);
    }

    const data = (await res.json()) as TokenResponse;
    if (!data.access_token) {
      throw new Error('Infoway OAuth response missing access_token');
    }

    // Refresh 60s early; never cache longer than expires_in
    const ttl = Math.max(30, (data.expires_in ?? 300) - 60);
    await this.cache.setJson(cacheKey, { token: data.access_token }, ttl);
    return data.access_token;
  }
}
