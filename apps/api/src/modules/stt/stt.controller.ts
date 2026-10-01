import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  MessageEvent,
  NotFoundException,
  Param,
  Post,
  Req,
  Sse,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';
import { Observable } from 'rxjs';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { CurrentUser, type RequestUser } from '@/common/decorators/auth.decorator';
import { PrismaService } from '@/prisma/prisma.service';
import { SttService } from './stt.service';

class CreateSttSessionDto {
  @IsOptional()
  @IsString()
  @IsIn(['whisper', 'google-medical'])
  provider?: string;

  @IsOptional()
  @IsString()
  languageCode?: string;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  translateToEnglish?: boolean;

  /** Whisper family model (e.g. whisper-1, whisper-large-v3) */
  @IsOptional()
  @IsString()
  @IsIn([
    'whisper-1',
    'gpt-4o-transcribe',
    'gpt-4o-mini-transcribe',
    'whisper-large-v3',
    'whisper-large-v3-turbo',
  ])
  whisperModel?: string;
}

class SttControlDto {
  @IsString()
  @IsIn(['pause', 'resume', 'stop'])
  action!: 'pause' | 'resume' | 'stop';
}

@ApiTags('Speech-to-Text')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@SkipThrottle()
@Controller('consultations/:consultationId/stt')
export class SttController {
  constructor(
    private readonly stt: SttService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('providers')
  @ApiOperation({ summary: 'List available STT providers for this environment' })
  async providers(
    @Param('consultationId') consultationId: string,
    @CurrentUser() user: RequestUser,
  ) {
    await this.assertConsultationAccess(consultationId, user);
    return this.stt.listProviders();
  }

  @Post('transcribe')
  @ApiOperation({
    summary: 'Record-then-transcribe: upload a complete recording. Optional translate-to-English.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'Multipart field "audio" (WAV preferred). Optional "provider".',
  })
  @UseInterceptors(FileInterceptor('audio'))
  async transcribe(
    @Param('consultationId') consultationId: string,
    @CurrentUser() user: RequestUser,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body()
    body: {
      provider?: string;
      languageCode?: string;
      whisperModel?: string;
      translateToEnglish?: string | boolean;
      preview?: string | boolean;
    },
  ) {
    await this.assertConsultationAccess(consultationId, user);
    if (!file?.buffer?.length) {
      throw new BadRequestException('Missing audio recording');
    }
    const asBool = (v: unknown) => v === true || v === 'true' || v === '1';
    return this.stt.transcribeRecording({
      audio: file.buffer,
      filename: file.originalname || 'dictation.wav',
      mimeType: file.mimetype,
      provider: body.provider,
      languageCode: body.languageCode,
      whisperModel: body.whisperModel,
      translateToEnglish: asBool(body.translateToEnglish),
      preview: asBool(body.preview),
    });
  }

  @Post('sessions')
  @ApiOperation({ summary: 'Start a live STT session (Whisper or Google Medical)' })
  async createSession(
    @Param('consultationId') consultationId: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateSttSessionDto,
  ) {
    await this.assertConsultationAccess(consultationId, user);
    return this.stt.createSession({
      consultationId,
      tenantId: user.tenantId ?? null,
      userId: user.id,
      provider: dto.provider,
      languageCode: dto.languageCode,
      whisperModel: dto.whisperModel,
      translateToEnglish: dto.translateToEnglish,
    });
  }

  @Sse('sessions/:sessionId/events')
  @ApiOperation({ summary: 'SSE stream of live transcript events' })
  events(
    @Param('consultationId') consultationId: string,
    @Param('sessionId') sessionId: string,
    @CurrentUser() user: RequestUser,
  ): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      let unsub: (() => void) | null = null;
      let cancelled = false;

      void (async () => {
        try {
          await this.assertConsultationAccess(consultationId, user);
          if (cancelled) return;
          const session = this.stt.getSession(sessionId, user.id, consultationId);
          unsub = this.stt.subscribe(sessionId, user.id, consultationId, (event) => {
            subscriber.next({ data: event });
          });
          subscriber.next({
            data: {
              type: 'status',
              status: 'listening',
              provider: session.provider,
            },
          });
        } catch (err) {
          subscriber.error(err);
        }
      })();

      return () => {
        cancelled = true;
        unsub?.();
      };
    });
  }

  @Post('sessions/:sessionId/audio')
  @ApiOperation({ summary: 'Push LINEAR16 PCM audio chunk (16 kHz mono)' })
  @ApiConsumes('application/octet-stream', 'multipart/form-data')
  @ApiBody({
    description: 'Raw PCM bytes or multipart file field "audio"',
  })
  @UseInterceptors(FileInterceptor('audio'))
  async pushAudio(
    @Param('consultationId') consultationId: string,
    @Param('sessionId') sessionId: string,
    @CurrentUser() user: RequestUser,
    @Req() req: { body?: Buffer | Record<string, unknown> },
    @Headers('content-type') contentType: string | undefined,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    await this.assertConsultationAccess(consultationId, user);

    let pcm: Buffer | null = null;
    if (file?.buffer?.length) {
      pcm = file.buffer;
    } else if (Buffer.isBuffer(req.body)) {
      pcm = req.body;
    } else if (contentType?.includes('application/octet-stream') && Buffer.isBuffer(req.body)) {
      pcm = req.body;
    }

    if (!pcm?.length) {
      return { ok: false, error: 'Empty audio chunk' };
    }

    return this.stt.pushAudio(sessionId, user.id, consultationId, pcm);
  }

  @Post('sessions/:sessionId/control')
  @ApiOperation({ summary: 'Pause, resume, or stop an STT session' })
  async control(
    @Param('consultationId') consultationId: string,
    @Param('sessionId') sessionId: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: SttControlDto,
  ) {
    await this.assertConsultationAccess(consultationId, user);
    if (dto.action === 'pause') return this.stt.pause(sessionId, user.id, consultationId);
    if (dto.action === 'resume') return this.stt.resume(sessionId, user.id, consultationId);
    return this.stt.stop(sessionId, user.id, consultationId);
  }

  private async assertConsultationAccess(consultationId: string, user: RequestUser) {
    const consultation = await this.prisma.consultation.findUnique({
      where: { id: consultationId },
      select: { id: true, tenantId: true, pharmacistId: true },
    });
    if (!consultation) throw new NotFoundException('Consultation not found');

    if (user.role === 'SUPER_ADMIN') return consultation;

    if (user.tenantId && consultation.tenantId && user.tenantId !== consultation.tenantId) {
      throw new ForbiddenException('Cross-tenant access denied');
    }

    // Pharmacists can only access their own consults unless admin
    if (
      user.role === 'PHARMACIST' &&
      consultation.pharmacistId &&
      consultation.pharmacistId !== user.id
    ) {
      throw new ForbiddenException('You do not have access to this consultation');
    }

    return consultation;
  }
}
