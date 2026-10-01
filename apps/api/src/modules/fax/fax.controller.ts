import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Request } from 'express';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { CurrentUser } from '@/common/decorators/auth.decorator';
import type { RequestUser } from '@/common/decorators/auth.decorator';
import { FaxService } from './fax.service';
import { SendConsultationFaxDto } from './dto/send-fax.dto';

@ApiTags('Fax')
@Controller()
export class FaxController {
  constructor(private readonly faxService: FaxService) {}

  @Post('consultations/:id/fax')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @SkipThrottle()
  @ApiOperation({
    summary: 'Send a consultation document PDF via iFax (no cover page)',
  })
  sendConsultationFax(
    @Param('id') id: string,
    @Body() dto: SendConsultationFaxDto,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.faxService.sendConsultationDocument(id, dto, user, req);
  }

  /** iFax delivery status webhook (configure URL in iFax dashboard). */
  @Post('fax/webhooks/ifax')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'iFax fax status webhook' })
  handleWebhook(
    @Req() req: Request & { rawBody?: Buffer },
    @Headers('x-ifax-signature') signature: string | undefined,
    @Body() body: Record<string, unknown>,
  ) {
    const raw =
      req.rawBody ??
      Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
    return this.faxService.handleIfaxWebhook(raw, signature);
  }
}
