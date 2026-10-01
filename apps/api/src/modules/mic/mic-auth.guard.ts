import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { MicAuthService, type MicAuthContext } from './mic-auth.service';

export const MIC_AUTH_REQUEST_KEY = 'micAuth';

@Injectable()
export class MicAuthGuard implements CanActivate {
  constructor(private readonly micAuth: MicAuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & { [MIC_AUTH_REQUEST_KEY]?: MicAuthContext; params?: { micSessionId?: string } }>();
    const micSessionId = req.params?.micSessionId;
    const auth = await this.micAuth.resolveFromRequest(req, micSessionId);
    req[MIC_AUTH_REQUEST_KEY] = auth;
    return true;
  }
}

export function getMicAuth(req: { [MIC_AUTH_REQUEST_KEY]?: MicAuthContext }): MicAuthContext {
  const auth = req[MIC_AUTH_REQUEST_KEY];
  if (!auth) {
    throw new UnauthorizedException('Mic authentication required');
  }
  return auth;
}
