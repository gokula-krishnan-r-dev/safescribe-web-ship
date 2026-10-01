import { HttpException, HttpStatus } from '@nestjs/common';
import { ACCESS_REQUEST_ERRORS } from '@safescript/shared';

export class NetworkChangedException extends HttpException {
  constructor() {
    super(
      {
        statusCode: HttpStatus.CONFLICT,
        error: ACCESS_REQUEST_ERRORS.NETWORK_CHANGED,
        message:
          'Your network appears to have changed. Please capture your pharmacy network again.',
      },
      HttpStatus.CONFLICT,
    );
  }
}

export class NetworkUnavailableException extends HttpException {
  constructor() {
    super(
      {
        statusCode: HttpStatus.BAD_REQUEST,
        error: ACCESS_REQUEST_ERRORS.NETWORK_UNAVAILABLE,
        message:
          "We couldn't detect your network. Please try again or contact SafeScribe support.",
      },
      HttpStatus.BAD_REQUEST,
    );
  }
}
