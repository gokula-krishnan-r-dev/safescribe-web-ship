import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { EventEmitter } from 'events';
import { RedisService } from '@/redis/redis.service';
import type { MicEventPayload } from './mic.types';

const CHANNEL_PREFIX = 'mic:events:';

@Injectable()
export class MicEventsService implements OnModuleDestroy {
  private readonly local = new EventEmitter();
  private sub: ReturnType<RedisService['duplicate']> | null = null;
  private subscribed = false;

  constructor(private readonly redis: RedisService) {
    this.local.setMaxListeners(100);
  }

  private channel(consultationId: string) {
    return `${CHANNEL_PREFIX}${consultationId}`;
  }

  async ensureSubscriber() {
    if (this.subscribed) return;
    this.subscribed = true;
    try {
      this.sub = this.redis.duplicate();
      await this.sub.subscribe(...[]); // lazy — subscribe per channel on demand
      this.sub.on('message', (channel: string, message: string) => {
        if (!channel.startsWith(CHANNEL_PREFIX)) return;
        const consultationId = channel.slice(CHANNEL_PREFIX.length);
        try {
          const payload = JSON.parse(message) as MicEventPayload;
          this.local.emit(consultationId, payload);
        } catch {
          /* ignore malformed */
        }
      });
    } catch {
      // Redis pub/sub optional — local events still work single-process
      this.sub = null;
    }
  }

  private watched = new Set<string>();

  async watchConsultation(consultationId: string) {
    await this.ensureSubscriber();
    if (this.watched.has(consultationId)) return;
    this.watched.add(consultationId);
    if (this.sub) {
      try {
        await this.sub.subscribe(this.channel(consultationId));
      } catch {
        /* ignore */
      }
    }
  }

  async publish(consultationId: string, payload: MicEventPayload) {
    this.local.emit(consultationId, payload);
    try {
      await this.redis.publish(this.channel(consultationId), JSON.stringify(payload));
    } catch {
      /* single-node fallback */
    }
  }

  subscribe(
    consultationId: string,
    listener: (payload: MicEventPayload) => void,
  ): () => void {
    void this.watchConsultation(consultationId);
    this.local.on(consultationId, listener);
    return () => {
      this.local.off(consultationId, listener);
    };
  }

  onModuleDestroy() {
    try {
      this.sub?.disconnect();
    } catch {
      /* ignore */
    }
  }
}
