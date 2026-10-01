import { HttpException, HttpStatus } from '@nestjs/common';
import { ACCESS_DENIAL_CODES } from '@safescript/shared';

export class ProfessionalAckRequiredException extends HttpException {
  constructor() {
    super(
      {
        statusCode: HttpStatus.FORBIDDEN,
        error: ACCESS_DENIAL_CODES.PROFESSIONAL_ACK_REQUIRED,
        message: 'Professional use acknowledgement is required before using SafeScribe.',
      },
      HttpStatus.FORBIDDEN,
    );
  }
}
