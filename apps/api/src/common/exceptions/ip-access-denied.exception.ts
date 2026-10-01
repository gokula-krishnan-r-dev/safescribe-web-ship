import { HttpException, HttpStatus } from '@nestjs/common';

export class IpAccessDeniedException extends HttpException {
  constructor(details?: {
    family?: 'ipv4' | 'ipv6' | null;
    recommendedCidr?: string | null;
  }) {
    const family = details?.family ?? null;
    super(
      {
        statusCode: HttpStatus.FORBIDDEN,
        error: 'IP_ACCESS_DENIED',
        message:
          "SafeScribe clinical services can only be accessed from your pharmacy's registered network.",
        detectedFamily: family,
        recommendedCidr: details?.recommendedCidr ?? null,
        dualStack:
          family === 'ipv6'
            ? 'This device connected over IPv6. Registering only an IPv4 address is not enough.'
            : undefined,
      },
      HttpStatus.FORBIDDEN,
    );
  }
}
