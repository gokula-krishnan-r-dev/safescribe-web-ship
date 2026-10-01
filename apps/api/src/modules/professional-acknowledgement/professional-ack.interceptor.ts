import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { from, type Observable } from 'rxjs';
import { mergeMap } from 'rxjs/operators';
import type { Request } from 'express';
import type { RequestUser } from '@/common/decorators/auth.decorator';
import { SKIP_PROFESSIONAL_ACK_KEY } from '@/common/decorators/skip-professional-ack.decorator';
import { ProfessionalAckRequiredException } from '@/common/exceptions/professional-ack-required.exception';
import { isProfessionalAckExemptApiPath, isProfessionalAckRole } from '@safescript/shared';
import { ProfessionalAcknowledgementService } from './professional-acknowledgement.service';

@Injectable()
export class ProfessionalAckInterceptor implements NestInterceptor {
  constructor(
    private reflector: Reflector,
    private acks: ProfessionalAcknowledgementService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_PROFESSIONAL_ACK_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) return next.handle();

    const req = context.switchToHttp().getRequest<Request & { user?: RequestUser }>();
    if (req.method === 'OPTIONS') return next.handle();
    if (isProfessionalAckExemptApiPath(req.originalUrl || req.url || '')) {
      return next.handle();
    }

    const user = req.user;
    // Pharmacists and pharmacy admins must acknowledge before clinical APIs.
    // Return paths stay role-scoped (/pharmacist vs /admin) so the gate cannot
    // bounce pharmacy admins into the pharmacist layout.
    if (!user || !isProfessionalAckRole(user.role)) return next.handle();

    return from(this.acks.hasCurrentAcknowledgement(user.id)).pipe(
      mergeMap((acknowledged) => {
        if (!acknowledged) {
          throw new ProfessionalAckRequiredException();
        }
        return next.handle();
      }),
    );
  }
}
