import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { Resend } from 'resend';
import {
  isRetryableMailError,
  resolveResendConfig,
  sleep,
  stripEnvQuotes,
  verifyResendWebhookSignature,
} from './mail.util';

export interface SendMailOptions {
  to: string;
  replyTo?: string;
  subject: string;
  text: string;
  html?: string;
  /** Stable key so Retries do not duplicate the same message. */
  idempotencyKey?: string;
  tags?: Array<{ name: string; value: string }>;
}

const MAX_ATTEMPTS = 3;

@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);
  private transporter: Transporter | null = null;
  private resend: Resend | null = null;
  private from = 'Safescript <noreply@phix.now>';
  private provider: 'resend' | 'smtp' | 'disabled' = 'disabled';

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const resend = resolveResendConfig({
      RESEND_ENABLED: this.config.get<string>('RESEND_ENABLED'),
      RESEND_API_KEY: this.config.get<string>('RESEND_API_KEY'),
      RESEND_FROM_EMAIL: this.config.get<string>('RESEND_FROM_EMAIL'),
      SMTP_FROM: this.config.get<string>('SMTP_FROM'),
      RESEND_WEBHOOK_SECRET: this.config.get<string>('RESEND_WEBHOOK_SECRET'),
    });
    if (resend.from) this.from = resend.from;

    if (resend.enabled && resend.apiKey.startsWith('re_')) {
      this.resend = new Resend(resend.apiKey);
      this.provider = 'resend';
      this.logger.log(`Email provider: Resend (${resend.fromEmail})`);
      return;
    }

    if (resend.enabled && !resend.apiKey.startsWith('re_')) {
      this.logger.error(
        'RESEND_ENABLED is true but RESEND_API_KEY is missing or invalid — outbound email is disabled',
      );
      this.provider = 'disabled';
      return;
    }

    const host = this.config.get<string>('SMTP_HOST', 'localhost');
    const port = Number(this.config.get('SMTP_PORT') ?? 1025);
    const user = stripEnvQuotes(this.config.get<string>('SMTP_USER'));
    const pass = stripEnvQuotes(this.config.get<string>('SMTP_PASS'));
    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: user && pass ? { user, pass } : undefined,
    });
    this.provider = 'smtp';
    this.logger.log(`Email provider: SMTP ${host}:${port} (${this.from})`);
  }

  getProvider() {
    return this.provider;
  }

  async send(options: SendMailOptions): Promise<boolean> {
    if (this.provider === 'resend' && this.resend) {
      return this.sendWithResend(options);
    }
    if (this.provider === 'smtp' && this.transporter) {
      return this.sendWithSmtp(options);
    }
    this.logger.warn('Email send skipped — no provider configured');
    return false;
  }

  verifyWebhook(input: {
    payload: string;
    id?: string;
    timestamp?: string;
    signature?: string;
  }): boolean {
    return verifyResendWebhookSignature({
      ...input,
      secret: stripEnvQuotes(this.config.get<string>('RESEND_WEBHOOK_SECRET')),
    });
  }

  private async sendWithResend(options: SendMailOptions): Promise<boolean> {
    const client = this.resend;
    if (!client) return false;

    let lastMessage = 'unknown error';
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const payload = {
          from: this.from,
          to: [options.to],
          subject: options.subject,
          text: options.text,
          html: options.html ?? options.text.replace(/\n/g, '<br />'),
          ...(options.replyTo ? { replyTo: options.replyTo } : {}),
          ...(options.tags?.length ? { tags: options.tags } : {}),
        };
        const { data, error } = await client.emails.send(
          payload,
          options.idempotencyKey
            ? { idempotencyKey: options.idempotencyKey }
            : undefined,
        );

        if (!error) {
          this.logger.log(
            `Resend accepted email id=${data?.id ?? 'unknown'} to=${options.to}`,
          );
          return true;
        }

        lastMessage = error.message || `status ${error.statusCode ?? 'n/a'}`;
        if (!isRetryableMailError(error.statusCode) || attempt === MAX_ATTEMPTS) {
          this.logger.error(`Resend send failed: ${lastMessage}`);
          return false;
        }
      } catch (err) {
        lastMessage = err instanceof Error ? err.message : 'unknown error';
        if (attempt === MAX_ATTEMPTS) {
          this.logger.error(`Resend send failed: ${lastMessage}`);
          return false;
        }
      }
      await sleep(250 * 2 ** (attempt - 1));
    }

    this.logger.error(`Resend send failed after retries: ${lastMessage}`);
    return false;
  }

  private async sendWithSmtp(options: SendMailOptions): Promise<boolean> {
    if (!this.transporter) return false;
    try {
      await this.transporter.sendMail({
        from: this.from,
        to: options.to,
        replyTo: options.replyTo,
        subject: options.subject,
        text: options.text,
        html: options.html,
      });
      return true;
    } catch (err) {
      this.logger.warn(
        `SMTP send failed: ${err instanceof Error ? err.message : 'unknown error'}`,
      );
      return false;
    }
  }
}
