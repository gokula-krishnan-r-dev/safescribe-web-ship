import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { MicService } from './mic.service';
import { MicAuthGuard, getMicAuth, MIC_AUTH_REQUEST_KEY } from './mic-auth.guard';
import type { MicAuthContext } from './mic-auth.service';
import {
  ClaimPairingDto,
  CompleteUploadDto,
  HeartbeatDto,
  LivePreviewDto,
  MicCommandDto,
  MicConsentDto,
} from './dto/mic.dto';
import { MIC_COOKIE_NAME } from './mic.types';

@ApiTags('SafeScribe Mic (Phone)')
@SkipThrottle()
@Controller('mic')
export class MicPhoneController {
  constructor(
    private readonly mic: MicService,
    private readonly config: ConfigService,
  ) {}

  @Post('pairings/claim')
  @ApiOperation({ summary: 'Claim pairing token from phone (no login)' })
  async claim(
    @Body() body: ClaimPairingDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.mic.claimPairing(body.pairToken);
    const isProd = this.config.get('NODE_ENV') === 'production';
    // Cross-site phone page (WEB_URL) → API domain needs SameSite=None + Secure.
    res.cookie(MIC_COOKIE_NAME, result.sessionToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? 'none' : 'lax',
      maxAge: Number(this.config.get('MIC_SESSION_MAX_SECONDS', 5400)) * 1000,
      path: '/',
    });
    return result;
  }

  @Get('sessions/:micSessionId')
  @UseGuards(MicAuthGuard)
  @ApiOperation({ summary: 'Get phone session state' })
  getSession(
    @Param('micSessionId') micSessionId: string,
    @Req() req: Request & { [MIC_AUTH_REQUEST_KEY]?: MicAuthContext },
  ) {
    getMicAuth(req);
    return this.mic.getPhoneSession(micSessionId);
  }

  @Post('sessions/:micSessionId/consent')
  @UseGuards(MicAuthGuard)
  async consent(
    @Param('micSessionId') micSessionId: string,
    @Req() req: Request & { [MIC_AUTH_REQUEST_KEY]?: MicAuthContext },
    @Body() body: MicConsentDto,
  ) {
    getMicAuth(req);
    return this.mic.recordConsent({
      micSessionId,
      consentObtained: body.consentObtained,
      method: body.method,
      noticeVersion: body.noticeVersion,
      expectedStateVersion: body.expectedStateVersion,
      idempotencyKey: body.idempotencyKey,
    });
  }

  @Post('sessions/:micSessionId/commands')
  @UseGuards(MicAuthGuard)
  async command(
    @Param('micSessionId') micSessionId: string,
    @Req() req: Request & { [MIC_AUTH_REQUEST_KEY]?: MicAuthContext },
    @Body() dto: MicCommandDto,
  ) {
    getMicAuth(req);
    return this.mic.applyCommand({
      micSessionId,
      command: dto.command,
      expectedStateVersion: dto.expectedStateVersion,
      idempotencyKey: dto.idempotencyKey,
    });
  }

  @Post('sessions/:micSessionId/heartbeat')
  @UseGuards(MicAuthGuard)
  async heartbeat(
    @Param('micSessionId') micSessionId: string,
    @Req() req: Request & { [MIC_AUTH_REQUEST_KEY]?: MicAuthContext },
    @Body() _body: HeartbeatDto,
  ) {
    getMicAuth(req);
    return this.mic.heartbeat(micSessionId);
  }

  @Post('sessions/:micSessionId/live-preview')
  @UseGuards(MicAuthGuard)
  async livePreview(
    @Param('micSessionId') micSessionId: string,
    @Req() req: Request & { [MIC_AUTH_REQUEST_KEY]?: MicAuthContext },
    @Body() body: LivePreviewDto,
  ) {
    getMicAuth(req);
    return this.mic.livePreview(micSessionId, body.text ?? '', body.isFinal);
  }

  @Post('sessions/:micSessionId/parts')
  @UseGuards(MicAuthGuard)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('audio'))
  async uploadPart(
    @Param('micSessionId') micSessionId: string,
    @Req() req: Request & { [MIC_AUTH_REQUEST_KEY]?: MicAuthContext },
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body()
    body: {
      segmentNumber?: string;
      sequenceNumber?: string;
      checksumSha256?: string;
    },
  ) {
    getMicAuth(req);
    if (!file?.buffer?.length) {
      return {
        error: {
          code: 'MISSING_AUDIO',
          message: 'Missing audio part',
          retryable: true,
        },
      };
    }
    return this.mic.uploadPart({
      micSessionId,
      segmentNumber: Number(body.segmentNumber ?? 0),
      sequenceNumber: Number(body.sequenceNumber ?? 0),
      contentType: file.mimetype || 'audio/webm',
      buffer: file.buffer,
      checksumSha256: body.checksumSha256,
    });
  }

  @Post('sessions/:micSessionId/complete')
  @UseGuards(MicAuthGuard)
  async complete(
    @Param('micSessionId') micSessionId: string,
    @Req() req: Request & { [MIC_AUTH_REQUEST_KEY]?: MicAuthContext },
    @Body() body: CompleteUploadDto,
  ) {
    getMicAuth(req);
    return this.mic.completeUpload({
      micSessionId,
      expectedStateVersion: body.expectedStateVersion,
      idempotencyKey: body.idempotencyKey,
      clientMimeType: body.clientMimeType,
      durationSeconds: body.durationSeconds,
    });
  }
}
