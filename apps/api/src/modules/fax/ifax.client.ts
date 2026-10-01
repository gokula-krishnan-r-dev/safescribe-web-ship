import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type IfaxFaxQuality = 'Low' | 'Standard' | 'HD';

export interface IfaxSendAttachment {
  fileName: string;
  /** Raw PDF bytes — encoded to base64 for iFax `fileData`. */
  pdfBuffer: Buffer;
}

export interface IfaxSendInput {
  faxNumber: string;
  attachment: IfaxSendAttachment;
  /** Intentionally omitted cover fields (subject / names / message). */
  faxQuality?: IfaxFaxQuality;
  callerId?: string;
}

export interface IfaxSendResult {
  jobId: string;
  raw: Record<string, unknown>;
}

@Injectable()
export class IfaxClient {
  private readonly logger = new Logger(IfaxClient.name);

  constructor(private readonly config: ConfigService) {}

  isEnabled(): boolean {
    const flag = (this.config.get<string>('IFAX_ENABLED') ?? 'true').toLowerCase();
    return flag !== 'false' && flag !== '0' && flag !== 'off';
  }

  private baseUrl(): string {
    return (this.config.get<string>('IFAX_BASE_URL') ?? 'https://api.ifaxapp.com/v1').replace(
      /\/$/,
      '',
    );
  }

  private apiKey(): string {
    return (this.config.get<string>('IFAX_API_KEY') ?? '').trim();
  }

  private quality(): IfaxFaxQuality {
    const q = (this.config.get<string>('IFAX_FAX_QUALITY') ?? 'HD').trim();
    if (q === 'Low' || q === 'Standard' || q === 'HD') return q;
    return 'HD';
  }

  async sendFax(input: IfaxSendInput): Promise<IfaxSendResult> {
    if (!this.isEnabled()) {
      throw new ServiceUnavailableException('IFAX_DISABLED');
    }

    const apiKey = this.apiKey();
    if (!apiKey) {
      throw new ServiceUnavailableException('iFax is not configured (missing IFAX_API_KEY)');
    }

    const callerId =
      (input.callerId ?? this.config.get<string>('IFAX_CALLER_ID') ?? '').trim() || undefined;

    // No cover page: do not send subject, from_name, to_name, message, or templateId.
    const body: Record<string, unknown> = {
      faxNumber: input.faxNumber,
      faxQuality: input.faxQuality ?? this.quality(),
      faxData: [
        {
          fileName: input.attachment.fileName.endsWith('.pdf')
            ? input.attachment.fileName
            : `${input.attachment.fileName}.pdf`,
          fileData: input.attachment.pdfBuffer.toString('base64'),
        },
      ],
    };
    if (callerId) body.callerId = callerId;

    const url = `${this.baseUrl()}/customer/fax-send`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90_000);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          accessToken: apiKey,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      const text = await res.text();
      let json: Record<string, unknown> = {};
      try {
        json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
      } catch {
        json = { message: text.slice(0, 500) };
      }

      if (!res.ok) {
        const msg =
          typeof json.message === 'string'
            ? json.message
            : `iFax HTTP ${res.status}`;
        this.logger.warn(`iFax send failed: ${msg}`);
        throw new ServiceUnavailableException(msg);
      }

      const status = json.status;
      if (status === -1 || status === -2 || status === -3 || status === -4 || status === -5) {
        const msg =
          typeof json.message === 'string' ? json.message : `iFax rejected fax (status ${status})`;
        throw new ServiceUnavailableException(msg);
      }

      const data = (json.data ?? {}) as Record<string, unknown>;
      const jobId = data.jobId != null ? String(data.jobId) : '';
      if (!jobId) {
        this.logger.warn(`iFax response missing jobId: ${text.slice(0, 300)}`);
        throw new ServiceUnavailableException('iFax did not return a job id');
      }

      return { jobId, raw: json };
    } catch (err) {
      if (err instanceof ServiceUnavailableException) throw err;
      const message = err instanceof Error ? err.message : 'iFax request failed';
      this.logger.error(`iFax send error: ${message}`);
      throw new ServiceUnavailableException(message);
    } finally {
      clearTimeout(timeout);
    }
  }
}
