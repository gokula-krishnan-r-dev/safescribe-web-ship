import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '@/redis/redis.service';

/**
 * Two-tier cache: in-process L1 (sub-ms) + Redis L2 (shared across instances).
 * Keeps Infoway $expand latency off the hot path for repeated queries.
 */
@Injectable()
export class DrugSearchCache {
  private readonly logger = new Logger(DrugSearchCache.name);
  private readonly memory = new Map<string, { expiresAt: number; value: string }>();
  private readonly maxMemoryEntries: number;

  constructor(
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {
    this.maxMemoryEntries = this.config.get<number>('DRUG_SEARCH_CACHE_MEMORY_MAX') ?? 500;
  }

  async getJson<T>(key: string): Promise<T | null> {
    const mem = this.memory.get(key);
    if (mem && mem.expiresAt > Date.now()) {
      try {
        return JSON.parse(mem.value) as T;
      } catch {
        this.memory.delete(key);
      }
    } else if (mem) {
      this.memory.delete(key);
    }

    try {
      const raw = await this.redis.get(key);
      if (!raw) return null;
      this.setMemory(key, raw, 60);
      return JSON.parse(raw) as T;
    } catch (err) {
      this.logger.warn(`Cache get failed for ${key}`, err);
      return null;
    }
  }

  async setJson(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    const raw = JSON.stringify(value);
    const l1Ttl = Math.min(ttlSeconds, 120);
    this.setMemory(key, raw, l1Ttl);

    try {
      await this.redis.set(key, raw, ttlSeconds);
    } catch (err) {
      this.logger.warn(`Cache set failed for ${key}`, err);
    }
  }

  private setMemory(key: string, value: string, ttlSeconds: number): void {
    if (this.memory.size >= this.maxMemoryEntries) {
      // Evict oldest ~10%
      const drop = Math.max(1, Math.floor(this.maxMemoryEntries * 0.1));
      const keys = this.memory.keys();
      for (let i = 0; i < drop; i++) {
        const next = keys.next();
        if (next.done) break;
        this.memory.delete(next.value);
      }
    }
    this.memory.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }
}
