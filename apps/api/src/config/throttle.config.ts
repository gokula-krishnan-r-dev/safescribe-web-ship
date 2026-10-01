import { ConfigService } from '@nestjs/config';
import type { ThrottlerModuleOptions } from '@nestjs/throttler';

function int(config: ConfigService, key: string, fallback: number): number {
  const raw = config.get<string | number>(key);
  const n = typeof raw === 'number' ? raw : parseInt(String(raw ?? ''), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * Global API rate limits (NestJS @nestjs/throttler).
 * Auth endpoints apply stricter per-route overrides via @Throttle().
 * Clinical workflows use @SkipThrottle() — they are JWT-protected and bursty by design.
 */
export function buildThrottlerOptions(config: ConfigService): ThrottlerModuleOptions {
  return [
    {
      name: 'short',
      ttl: int(config, 'THROTTLE_SHORT_TTL_MS', 1000),
      limit: int(config, 'THROTTLE_SHORT_LIMIT', 25),
    },
    {
      name: 'medium',
      ttl: int(config, 'THROTTLE_MEDIUM_TTL_MS', 10_000),
      limit: int(config, 'THROTTLE_MEDIUM_LIMIT', 150),
    },
    {
      name: 'long',
      ttl: int(config, 'THROTTLE_LONG_TTL_MS', 60_000),
      limit: int(config, 'THROTTLE_LONG_LIMIT', 500),
    },
  ];
}
