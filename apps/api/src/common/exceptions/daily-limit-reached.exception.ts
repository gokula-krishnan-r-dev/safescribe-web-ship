import { HttpException, HttpStatus } from '@nestjs/common';
import type { EntitlementUsageSnapshot } from '@safescript/shared';
import { ACCESS_DENIAL_CODES, moduleLabel } from '@safescript/shared';

export class DailyLimitReachedException extends HttpException {
  constructor(snapshot: EntitlementUsageSnapshot) {
    const label = moduleLabel(snapshot.module);
    const usedLabel =
      snapshot.included == null
        ? `${snapshot.used} used`
        : `${snapshot.used} of ${snapshot.included} assessments used today.`;
    super(
      {
        statusCode: HttpStatus.FORBIDDEN,
        error: ACCESS_DENIAL_CODES.DAILY_LIMIT_REACHED,
        message: `Today's included ${label} assessments have been used.`,
        used: snapshot.used,
        included: snapshot.included,
        remaining: snapshot.remaining,
        resetsAt: snapshot.resetsAt,
        module: snapshot.module,
        detail: usedLabel,
      },
      HttpStatus.FORBIDDEN,
    );
  }
}

export class ModuleNotEntitledException extends HttpException {
  constructor(module = 'prescribe') {
    super(
      {
        statusCode: HttpStatus.FORBIDDEN,
        error: ACCESS_DENIAL_CODES.MODULE_NOT_ENTITLED,
        message: `${moduleLabel(module)} is not available for this pharmacy.`,
        module,
      },
      HttpStatus.FORBIDDEN,
    );
  }
}
