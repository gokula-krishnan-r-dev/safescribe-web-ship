import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Storage } from '@google-cloud/storage';
import { createReadStream, existsSync, mkdirSync, unlinkSync, writeFileSync } from 'fs';
import { isAbsolute, join } from 'path';
import { Readable } from 'stream';

export type StorageProvider = 'gcs' | 'local';

export interface StoredObject {
  /** Absolute or relative key used to locate the object later */
  storageKey: string;
  provider: StorageProvider;
  /** Public/static URL when applicable; otherwise empty (serve via API) */
  publicUrl?: string;
}

export interface ObjectReadResult {
  stream: Readable;
  contentType: string;
  contentLength?: number;
}

@Injectable()
export class ObjectStorageService implements OnModuleInit {
  private readonly logger = new Logger(ObjectStorageService.name);
  private storage: Storage | null = null;
  private bucketName = '';
  private uploadsDir = '';
  private provider: StorageProvider = 'local';

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    this.uploadsDir = this.resolveUploadsDir(this.config.get<string>('UPLOAD_DIR', './uploads'));
    if (!existsSync(this.uploadsDir)) {
      mkdirSync(this.uploadsDir, { recursive: true });
    }

    const bucket = (this.config.get<string>('GCS_BUCKET') || '').trim();
    if (!bucket) {
      this.provider = 'local';
      this.logger.log(`Attachment storage: local (${this.uploadsDir})`);
      return;
    }

    this.bucketName = bucket;
    const projectId = (this.config.get<string>('GCS_PROJECT_ID') || '').trim() || undefined;
    const keyFilename = (this.config.get<string>('GOOGLE_APPLICATION_CREDENTIALS') || '').trim();

    try {
      this.storage = new Storage({
        projectId,
        ...(keyFilename ? { keyFilename } : {}),
      });
      this.provider = 'gcs';
      this.logger.log(`Attachment storage: GCS bucket gs://${this.bucketName}`);
    } catch (err) {
      this.provider = 'local';
      this.logger.warn(
        `GCS init failed — falling back to local uploads: ${(err as Error).message}`,
      );
    }
  }

  get activeProvider(): StorageProvider {
    return this.provider;
  }

  /**
   * Persist a buffer under a tenant/consultation-scoped object key.
   * Falls back to local disk when GCS is unavailable or permission is denied
   * (critical for SafeScribe Mic audio parts on staging VMs).
   */
  async upload(params: {
    buffer: Buffer;
    contentType: string;
    objectKey: string;
    /** Skip GCS (used for SafeScribe Mic parts on single-node deploys). */
    preferLocal?: boolean;
  }): Promise<StoredObject> {
    if (params.preferLocal) {
      return this.uploadLocal(params);
    }

    if (this.provider === 'gcs' && this.storage) {
      try {
        const file = this.storage.bucket(this.bucketName).file(params.objectKey);
        await file.save(params.buffer, {
          contentType: params.contentType,
          resumable: false,
          metadata: {
            cacheControl: 'private, max-age=0, no-transform',
          },
        });
        return {
          storageKey: params.objectKey,
          provider: 'gcs',
        };
      } catch (err) {
        this.logger.warn(
          `GCS upload failed for ${params.objectKey} — falling back to local: ${(err as Error).message}`,
        );
      }
    }

    return this.uploadLocal(params);
  }

  private uploadLocal(params: {
    buffer: Buffer;
    contentType: string;
    objectKey: string;
  }): StoredObject {
    // Keep unique flat names (mic paths include /) so concurrent sessions do not collide.
    const fileName =
      params.objectKey.includes('/')
        ? params.objectKey.replace(/\//g, '__')
        : params.objectKey;
    if (!existsSync(this.uploadsDir)) {
      mkdirSync(this.uploadsDir, { recursive: true });
    }
    const absolute = join(this.uploadsDir, fileName);
    writeFileSync(absolute, params.buffer);
    return {
      storageKey: fileName,
      provider: 'local',
      publicUrl: `/uploads/${fileName}`,
    };
  }

  async delete(storageKey: string, provider?: StorageProvider): Promise<void> {
    const mode = provider || this.inferProvider(storageKey);
    try {
      if (mode === 'gcs' && this.storage && storageKey.includes('/') && !storageKey.includes('__')) {
        await this.storage.bucket(this.bucketName).file(storageKey).delete({ ignoreNotFound: true });
        return;
      }
      const name = storageKey.includes('__')
        ? storageKey
        : storageKey.includes('/')
          ? storageKey.split('/').pop()!
          : storageKey;
      const absolute = join(this.uploadsDir, name);
      if (existsSync(absolute)) unlinkSync(absolute);
    } catch (err) {
      this.logger.warn(`Failed to delete ${storageKey}: ${(err as Error).message}`);
    }
  }

  async open(
    storageKey: string,
    mimeType: string,
    provider?: StorageProvider,
  ): Promise<ObjectReadResult> {
    // Local keys may contain __ instead of / after GCS→local fallback
    const localName = storageKey.includes('__')
      ? storageKey
      : storageKey.replace(/^\/?uploads\//, '').split('/').pop()!;
    const localAbsolute = join(this.uploadsDir, localName);
    if (existsSync(localAbsolute)) {
      return {
        stream: createReadStream(localAbsolute),
        contentType: mimeType,
      };
    }

    const mode = provider || this.inferProvider(storageKey);
    if (mode === 'gcs' && this.storage) {
      try {
        const file = this.storage.bucket(this.bucketName).file(storageKey);
        const [meta] = await file.getMetadata();
        return {
          stream: file.createReadStream(),
          contentType: (meta.contentType as string) || mimeType,
          contentLength: meta.size ? Number(meta.size) : undefined,
        };
      } catch (err) {
        this.logger.warn(`GCS open failed for ${storageKey}: ${(err as Error).message}`);
      }
    }

    throw new Error(`Attachment missing: ${storageKey}`);
  }

  private inferProvider(storageKey: string): StorageProvider {
    // Flat local keys (no path slashes, or escaped mic keys with __)
    if (!storageKey.includes('/') || storageKey.includes('__')) {
      return 'local';
    }
    if (this.provider === 'gcs') return 'gcs';
    return 'local';
  }

  private resolveUploadsDir(dir: string): string {
    return isAbsolute(dir) ? dir : join(process.cwd(), dir);
  }
}
