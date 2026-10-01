import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { getClientInfo } from '@/common/utils/client-info';
import { ContactService } from './contact.service';
import { CreateContactInquiryDto } from './dto/contact.dto';

@ApiTags('contact')
@Controller('contact')
export class ContactController {
  constructor(private readonly contact: ContactService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @Throttle({ short: { ttl: 60000, limit: 5 } })
  @ApiOperation({ summary: 'Submit a public Contact Us inquiry' })
  create(@Body() dto: CreateContactInquiryDto, @Req() req: Request) {
    return this.contact.create(dto, getClientInfo(req));
  }

  @Post('webhooks/resend')
  @HttpCode(HttpStatus.OK)
  @SkipThrottle()
  @ApiOperation({ summary: 'Resend delivery-status webhook' })
  handleResendWebhook(
    @Req() req: Request & { rawBody?: Buffer },
    @Headers('svix-id') svixId: string | undefined,
    @Headers('svix-timestamp') svixTimestamp: string | undefined,
    @Headers('svix-signature') svixSignature: string | undefined,
    @Body() body: unknown,
  ) {
    const payload =
      req.rawBody?.toString('utf8') ??
      (typeof body === 'string' ? body : JSON.stringify(body ?? {}));
    return this.contact.handleResendWebhook(payload, {
      id: svixId,
      timestamp: svixTimestamp,
      signature: svixSignature,
    });
  }
}
