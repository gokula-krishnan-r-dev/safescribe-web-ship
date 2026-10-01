import {
  Body,
  Controller,
  Get,
  MessageEvent,
  Param,
  Post,
  Sse,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Observable } from 'rxjs';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { CurrentUser, type RequestUser } from '@/common/decorators/auth.decorator';
import { MicService } from './mic.service';
import { MicEventsService } from './mic-events.service';
import { CreateMicPairingDto, MicCommandDto, MicSttSettingsDto } from './dto/mic.dto';

@ApiTags('SafeScribe Mic (Desktop)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@SkipThrottle()
@Controller('consultations/:consultationId/mic')
export class MicDesktopController {
  constructor(
    private readonly mic: MicService,
    private readonly micEvents: MicEventsService,
  ) {}

  @Post('pairings')
  @ApiOperation({ summary: 'Create a single-use SafeScribe Mic pairing (QR)' })
  createPairing(
    @Param('consultationId') consultationId: string,
    @CurrentUser() user: RequestUser,
    @Body() body: CreateMicPairingDto = {},
  ) {
    return this.mic.createPairing(consultationId, user, body);
  }

  @Post('session/stt-settings')
  @ApiOperation({ summary: 'Update spoken language / translate settings before recording' })
  updateSttSettings(
    @Param('consultationId') consultationId: string,
    @CurrentUser() user: RequestUser,
    @Body() body: MicSttSettingsDto,
  ) {
    return this.mic.updateSttSettings(consultationId, user, body);
  }

  @Get('session')
  @ApiOperation({ summary: 'Get sanitized Mic session state' })
  getSession(
    @Param('consultationId') consultationId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.mic.getSessionForDesktop(consultationId, user);
  }

  @Post('session/commands')
  @ApiOperation({ summary: 'Send Mic control command from desktop' })
  async command(
    @Param('consultationId') consultationId: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: MicCommandDto,
  ) {
    await this.mic.assertConsultationAccess(consultationId, user);
    const session = await this.mic.getSessionForDesktop(consultationId, user);
    if (!session) {
      return { error: { code: 'NO_MIC_SESSION', message: 'No active Mic session' } };
    }
    return this.mic.applyCommand({
      micSessionId: session.micSessionId,
      command: dto.command,
      expectedStateVersion: dto.expectedStateVersion,
      idempotencyKey: dto.idempotencyKey,
      actorUserId: user.id,
    });
  }

  @Sse('session/events')
  @ApiOperation({ summary: 'SSE stream of sanitized Mic state + live preview' })
  events(
    @Param('consultationId') consultationId: string,
    @CurrentUser() user: RequestUser,
  ): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      let unsub: (() => void) | null = null;
      let cancelled = false;

      void (async () => {
        try {
          await this.mic.assertConsultationAccess(consultationId, user);
          if (cancelled) return;
          const current = await this.mic.getSessionForDesktop(consultationId, user);
          if (current) {
            subscriber.next({
              data: {
                type: 'MIC_STATE_CHANGED',
                micSessionId: current.micSessionId,
                state: current.state,
                stateVersion: current.stateVersion,
                recordingStartedAt: current.recordingStartedAt,
                lastHeartbeatAt: current.lastHeartbeatAt,
                upload: current.upload,
                failureCode: current.failureCode,
              },
            });
          }
          unsub = this.micEvents.subscribe(consultationId, (payload) => {
            subscriber.next({ data: payload });
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
}
