import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private client: Redis;

  constructor(private config: ConfigService) {
    this.client = new Redis(this.config.get<string>('REDIS_URL') ?? 'redis://localhost:6379');
  }

  getClient(): Redis {
    return this.client;
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds) {
      await this.client.set(key, value, 'EX', ttlSeconds);
    } else {
      await this.client.set(key, value);
    }
  }

  /** SET key NX EX ttl. Returns true when the key was created. */
  async setNx(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    const result = await this.client.set(key, value, 'EX', ttlSeconds, 'NX');
    return result === 'OK';
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  /** Atomically read and delete a key (Redis GETDEL). Falls back to GET+DEL. */
  async getDel(key: string): Promise<string | null> {
    try {
      return await this.client.getdel(key);
    } catch {
      const value = await this.client.get(key);
      if (value !== null) await this.client.del(key);
      return value;
    }
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  async exists(key: string): Promise<boolean> {
    return (await this.client.exists(key)) === 1;
  }

  async publish(channel: string, message: string): Promise<number> {
    return this.client.publish(channel, message);
  }

  /** Subscriber connection — caller must disconnect. */
  duplicate(): Redis {
    return this.client.duplicate();
  }

  onModuleDestroy() {
    this.client.disconnect();
  }
}
