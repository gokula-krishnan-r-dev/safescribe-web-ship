import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'crypto';
import type { Request } from 'express';
import { PrismaService } from '@/prisma/prisma.service';
import {
  MIC_COOKIE_NAME,
  MicSessionState,
} from './mic.types';

export type MicAuthContext = {
  micSessionId: string;
  consultationId: string;
  tenantId: string | null;
  pairingId: string;
  createdById: string;
};

@Injectable()
export class MicAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  hashToken(raw: string): string {
    const secret = this.config.get<string>('JWT_ACCESS_SECRET', 'mic');
    return createHash('sha256').update(`${secret}:${raw}`).digest('hex');
  }

  generateOpaqueToken(bytes = 32): string {
    return randomBytes(bytes).toString('base64url');
  }

  extractCredential(req: Request): string | null {
    const cookie = req.cookies?.[MIC_COOKIE_NAME] as string | undefined;
    if (cookie) return cookie;
    const auth = req.headers.authorization;
    if (auth?.startsWith('Bearer mic_')) {
      return auth.slice('Bearer mic_'.length);
    }
    if (auth?.startsWith('Bearer ')) {
      const token = auth.slice(7);
      if (token.startsWith('mic_')) return token.slice(4);
      // Flutter may send raw session token
      return token;
    }
    const header = req.headers['x-mic-session-token'];
    if (typeof header === 'string' && header) return header;
    return null;
  }

  async resolveFromRequest(req: Request, micSessionId?: string): Promise<MicAuthContext> {
    const raw = this.extractCredential(req);
    if (!raw) {
      throw new UnauthorizedException({
        error: {
          code: 'MIC_AUTH_REQUIRED',
          message: 'SafeScribe Mic session credential is required.',
          retryable: false,
        },
      });
    }
    const credentialHash = this.hashToken(raw);
    const session = await this.prisma.micSession.findFirst({
      where: { credentialHash },
      include: { pairing: true },
    });
    if (!session || !session.credentialHash) {
      throw new UnauthorizedException({
        error: {
          code: 'MIC_SESSION_INVALID',
          message: 'This SafeScribe Mic link is no longer active.',
          retryable: false,
        },
      });
    }
    if (micSessionId && session.id !== micSessionId) {
      throw new ForbiddenException({
        error: {
          code: 'MIC_SESSION_MISMATCH',
          message: 'This SafeScribe Mic link is no longer active.',
          retryable: false,
        },
      });
    }
    if (session.credentialExpiresAt && session.credentialExpiresAt < new Date()) {
      throw new UnauthorizedException({
        error: {
          code: 'MIC_SESSION_EXPIRED',
          message: 'This SafeScribe Mic link is no longer active.',
          retryable: false,
        },
      });
    }
    const terminal: MicSessionState[] = [
      'COMPLETED',
      'FAILED',
      'EXPIRED',
      'CANCELLED',
    ];
    if (terminal.includes(session.state as MicSessionState)) {
      throw new UnauthorizedException({
        error: {
          code: 'MIC_SESSION_CLOSED',
          message: 'This SafeScribe Mic link is no longer active.',
          retryable: false,
        },
      });
    }
    return {
      micSessionId: session.id,
      consultationId: session.consultationId,
      tenantId: session.tenantId,
      pairingId: session.pairingId,
      createdById: session.pairing.createdById,
    };
  }
}
