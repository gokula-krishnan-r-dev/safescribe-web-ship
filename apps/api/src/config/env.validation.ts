import { plainToInstance, Type } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';
import { assertResendConfig, resolveResendConfig } from '@/modules/contact/mail.util';

const INSECURE_JWT_SECRETS = new Set([
  'change-me-access-secret-min-32-chars-long',
  'change-me-refresh-secret-min-32-chars-long',
]);

enum NodeEnv {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

export class EnvironmentVariables {
  @IsEnum(NodeEnv)
  @IsOptional()
  NODE_ENV: NodeEnv = NodeEnv.Development;

  @IsString()
  @IsNotEmpty()
  DATABASE_URL!: string;

  @IsString()
  @IsNotEmpty()
  REDIS_URL!: string;

  @IsString()
  @MinLength(32)
  JWT_ACCESS_SECRET!: string;

  @IsString()
  @MinLength(32)
  JWT_REFRESH_SECRET!: string;

  @IsString()
  @IsOptional()
  JWT_ACCESS_EXPIRES_IN = '15m';

  @IsString()
  @IsOptional()
  JWT_REFRESH_EXPIRES_IN = '7d';

  @IsEmail()
  @IsOptional()
  SUPER_ADMIN_EMAIL = 'admin@safescript.com';

  @IsString()
  @MinLength(8)
  @IsOptional()
  SUPER_ADMIN_PASSWORD = 'SuperAdmin123!';

  @IsEmail()
  @IsOptional()
  SUPER_ADMIN_PHARMACY_EMAIL = 'pharmacy-admin@safescript.com';

  @IsEmail()
  @IsOptional()
  SUPER_ADMIN_CLINICAL_EMAIL = 'clinical-admin@safescript.com';

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  API_PORT = 3001;

  @IsUrl({ require_tld: false })
  @IsOptional()
  API_URL = 'http://localhost:3001';

  @IsUrl({ require_tld: false })
  @IsOptional()
  WEB_URL = 'http://localhost:3000';

  /** Extra browser origins (comma-separated) allowed to call the API with cookies. */
  @IsString()
  @IsOptional()
  CORS_ORIGINS = '';

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  MAX_LOGIN_ATTEMPTS = 5;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  LOCKOUT_DURATION_MINUTES = 15;

  @IsString()
  @IsOptional()
  SMTP_HOST = 'localhost';

  @Type(() => Number)
  @IsInt()
  @IsOptional()
  SMTP_PORT = 1025;

  @IsEmail()
  @IsOptional()
  SMTP_FROM = 'noreply@safescript.com';

  @IsString()
  @IsOptional()
  SMTP_USER = '';

  @IsString()
  @IsOptional()
  SMTP_PASS = '';

  /** Use Resend for transactional email when true and RESEND_API_KEY is set. */
  @IsString()
  @IsOptional()
  RESEND_ENABLED = 'false';

  @IsString()
  @IsOptional()
  RESEND_API_KEY = '';

  /** Display From, e.g. `Safescript <noreply@phix.now>` */
  @IsString()
  @IsOptional()
  RESEND_FROM_EMAIL = '';

  @IsString()
  @IsOptional()
  RESEND_WEBHOOK_SECRET = '';

  /** Public web origin used in outbound email links. Falls back to WEB_URL. */
  @IsString()
  @IsOptional()
  EMAIL_APP_URL = '';

  /**
   * Email magic-link second factor after password for Pharmacist Admin / Pharmacist.
   * Super Admin is never gated. Default off — email + password is enough until re-enabled.
   */
  @IsString()
  @IsOptional()
  LOGIN_EMAIL_2FA_ENABLED = 'false';

  /** Lifetime of the one-time verification link (minutes). */
  @Type(() => Number)
  @IsInt()
  @Min(5)
  @IsOptional()
  LOGIN_EMAIL_2FA_TTL_MINUTES = 15;

  /**
   * Extra demo emails that skip login email 2FA after a valid password.
   * Built-in seed accounts are always included unless this is `none`.
   */
  @IsString()
  @IsOptional()
  DEMO_LOGIN_BYPASS_EMAILS = '';

  @IsEmail()
  @IsOptional()
  CONTACT_TO_EMAIL = 'support@pharmasafe.ca';

  @IsString()
  @IsOptional()
  OPENAI_API_KEY = '';

  @IsString()
  @IsOptional()
  OPENAI_MODEL = 'gpt-5.6-luna';

  @IsOptional()
  @IsString()
  OPENAI_FAST_MODEL = 'gpt-5.6-luna';

  @IsString()
  @IsOptional()
  AI_ENGINE_URL?: string;

  /** Default AI Engine HTTP timeout (ms) for classify / consult calls */
  @Type(() => Number)
  @IsInt()
  @Min(30_000)
  @IsOptional()
  AI_ENGINE_TIMEOUT_MS = 300_000;

  /** Long AI Engine timeout (ms) for pathway concept extract / generate */
  @Type(() => Number)
  @IsInt()
  @Min(60_000)
  @IsOptional()
  AI_ENGINE_LONG_TIMEOUT_MS = 900_000;

  /** Must match AI Engine INTERNAL_SECRET for live prompt sync */
  @IsString()
  @IsOptional()
  AI_ENGINE_INTERNAL_SECRET = 'change-me-internal-secret-32chars';

  @IsString()
  @IsOptional()
  INTERNAL_SECRET = 'change-me-internal-secret-32chars';

  @IsString()
  @IsOptional()
  UPLOAD_DIR = './uploads';

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  UPLOAD_MAX_SIZE_MB = 20;

  /** GCP Cloud Storage for consultation clinical photos (optional — falls back to local UPLOAD_DIR) */
  @IsString()
  @IsOptional()
  GCS_PROJECT_ID = '';

  @IsString()
  @IsOptional()
  GCS_BUCKET = '';

  /** Absolute path to a service-account JSON key (never commit this file) */
  @IsString()
  @IsOptional()
  GOOGLE_APPLICATION_CREDENTIALS = '';

  /** Speech-to-Text: whisper | google-medical */
  @IsString()
  @IsOptional()
  STT_DEFAULT_PROVIDER = 'whisper';

  @IsString()
  @IsOptional()
  STT_WHISPER_ENABLED = 'true';

  /**
   * Whisper-family model:
   * - OpenAI: whisper-1 | gpt-4o-transcribe | gpt-4o-mini-transcribe
   * - Groq Large v3: whisper-large-v3 | whisper-large-v3-turbo (needs STT_GROQ_API_KEY)
   */
  @IsString()
  @IsOptional()
  STT_WHISPER_MODEL = 'whisper-1';

  /** Groq API key for whisper-large-v3 / whisper-large-v3-turbo */
  @IsString()
  @IsOptional()
  STT_GROQ_API_KEY = '';

  /** Alias for STT_GROQ_API_KEY */
  @IsString()
  @IsOptional()
  GROQ_API_KEY = '';

  /** Optional Groq OpenAI-compatible base URL (default: https://api.groq.com/openai/v1) */
  @IsString()
  @IsOptional()
  STT_GROQ_BASE_URL = '';

  /** Optional OpenAI-compatible base URL for OpenAI-hosted STT models */
  @IsString()
  @IsOptional()
  STT_OPENAI_BASE_URL = '';

  @IsString()
  @IsOptional()
  STT_GOOGLE_ENABLED = 'true';

  /** medical_dictation (single-speaker notes) | medical_conversation (dialogue) */
  @IsString()
  @IsOptional()
  STT_GOOGLE_MODEL = 'medical_dictation';

  @IsString()
  @IsOptional()
  STT_GOOGLE_LANGUAGE = 'en-US';

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  ALLERGY_RULES_MAX_SIZE_MB = 10;

  /** Active drug terminology provider id (default: ccdd) */
  @IsString()
  @IsOptional()
  DRUG_SEARCH_PROVIDER = 'ccdd';

  /** Canada Health Infoway Terminology Server OAuth (CCDD) */
  @IsString()
  @IsOptional()
  INFOWAY_CLIENT_ID = '';

  @IsString()
  @IsOptional()
  INFOWAY_CLIENT_SECRET = '';

  /** Optional OpenFDA API key (raises rate limits for drug label lookups) */
  @IsString()
  @IsOptional()
  OPENFDA_API_KEY = '';

  /** Global API rate limits — see throttle.config.ts */
  @Type(() => Number)
  @IsInt()
  @Min(100)
  @IsOptional()
  THROTTLE_SHORT_TTL_MS = 1000;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  THROTTLE_SHORT_LIMIT = 25;

  @Type(() => Number)
  @IsInt()
  @Min(1000)
  @IsOptional()
  THROTTLE_MEDIUM_TTL_MS = 10_000;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  THROTTLE_MEDIUM_LIMIT = 150;

  @Type(() => Number)
  @IsInt()
  @Min(1000)
  @IsOptional()
  THROTTLE_LONG_TTL_MS = 60_000;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  THROTTLE_LONG_LIMIT = 500;

  // ── iFax outbound fax (consultation documents) ───────────────────────────
  @IsString()
  @IsOptional()
  IFAX_API_KEY = '';

  @IsUrl({ require_tld: false })
  @IsOptional()
  IFAX_BASE_URL = 'https://api.ifaxapp.com/v1';

  @IsString()
  @IsOptional()
  IFAX_CALLER_ID = '';

  @IsString()
  @IsOptional()
  IFAX_WEBHOOK_SECRET = '';

  /** Global kill-switch — false skips outbound iFax calls */
  @IsString()
  @IsOptional()
  IFAX_ENABLED = 'true';

  /** Low | Standard | HD */
  @IsString()
  @IsOptional()
  IFAX_FAX_QUALITY = 'HD';

  // ── SafeScribe Mic ─────────────────────────────────────────────────────────
  @IsString()
  @IsOptional()
  SAFESCRIBE_MIC_ENABLED = 'true';

  /** Staging showcase for Renew. Production should set false until launch. */
  @IsString()
  @IsOptional()
  SAFESCRIBE_RENEW_ENABLED = 'true';

  /** Staging showcase for Adapt. Production should set false until launch. */
  @IsString()
  @IsOptional()
  SAFESCRIBE_ADAPT_ENABLED = 'false';

  /** Comma-separated tenant IDs; empty = all tenants when feature enabled */
  @IsString()
  @IsOptional()
  SAFESCRIBE_MIC_PILOT_TENANT_IDS = '';

  @Type(() => Number)
  @IsInt()
  @Min(30)
  @IsOptional()
  MIC_PAIRING_TTL_SECONDS = 300;

  @Type(() => Number)
  @IsInt()
  @Min(60)
  @IsOptional()
  MIC_SESSION_MAX_SECONDS = 5400;

  @Type(() => Number)
  @IsInt()
  @Min(5)
  @IsOptional()
  MIC_HEARTBEAT_INTERVAL_SECONDS = 15;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  MIC_MAX_UPLOAD_BYTES = 262144000;

  @IsString()
  @IsOptional()
  MIC_AUDIO_RETENTION_MODE = 'DELETE_AFTER_SUCCESS';

  @Type(() => Number)
  @IsInt()
  @Min(60)
  @IsOptional()
  MIC_AUDIO_DELETE_GRACE_SECONDS = 3600;

  @IsString()
  @IsOptional()
  TRANSCRIPTION_PROVIDER = 'openai';

  @IsString()
  @IsOptional()
  TRANSCRIPTION_MODEL = 'whisper-1';

  /** Patient Care Summary translation (Google Cloud Translation Advanced v3) */
  @IsString()
  @IsOptional()
  GOOGLE_CLOUD_PROJECT = '';

  @IsString()
  @IsOptional()
  GOOGLE_TRANSLATE_LOCATION = 'global';

  @IsString()
  @IsOptional()
  GOOGLE_TRANSLATE_MODEL = 'general/nmt';

  @IsString()
  @IsOptional()
  GOOGLE_TRANSLATE_GLOSSARY_PREFIX = '';

  @IsString()
  @IsOptional()
  TRANSLATION_ENABLED = 'true';

  @IsString()
  @IsOptional()
  TRANSLATION_CACHE_TTL_SECONDS = '604800';

  @IsString()
  @IsOptional()
  GOOGLE_TRANSLATE_TIMEOUT_MS = '15000';

  /** Lookback window (days) for Add treatment Quick add ranking. */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  QUICK_ADD_LOOKBACK_DAYS = 180;

  /** Shared secret Phix sends as Bearer token for /integrations/phix/events */
  @IsString()
  @IsOptional()
  PHIX_SYNC_API_KEY = '';

  /** HMAC-SHA256 secret for Phix event signatures (min 32 chars in production use) */
  @IsString()
  @IsOptional()
  PHIX_SYNC_HMAC_SECRET = '';
}

export function validateEnv(config: Record<string, unknown>): EnvironmentVariables {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validated, { skipMissingProperties: false });
  if (errors.length > 0) {
    throw new Error(`Environment validation failed:\n${errors.toString()}`);
  }

  if (validated.NODE_ENV === NodeEnv.Production) {
    const productionErrors: string[] = [];

    if (INSECURE_JWT_SECRETS.has(validated.JWT_ACCESS_SECRET)) {
      productionErrors.push('JWT_ACCESS_SECRET must be changed in production');
    }
    if (INSECURE_JWT_SECRETS.has(validated.JWT_REFRESH_SECRET)) {
      productionErrors.push('JWT_REFRESH_SECRET must be changed in production');
    }
    if (!validated.SUPER_ADMIN_PASSWORD || validated.SUPER_ADMIN_PASSWORD.length < 12) {
      productionErrors.push('SUPER_ADMIN_PASSWORD must be at least 12 characters in production');
    }
    if (!/[A-Z]/.test(validated.SUPER_ADMIN_PASSWORD)) {
      productionErrors.push('SUPER_ADMIN_PASSWORD must include an uppercase letter');
    }
    if (!/[0-9]/.test(validated.SUPER_ADMIN_PASSWORD)) {
      productionErrors.push('SUPER_ADMIN_PASSWORD must include a number');
    }
    if (!/[^A-Za-z0-9]/.test(validated.SUPER_ADMIN_PASSWORD)) {
      productionErrors.push('SUPER_ADMIN_PASSWORD must include a special character');
    }

    if (productionErrors.length > 0) {
      throw new Error(`Production environment validation failed:\n- ${productionErrors.join('\n- ')}`);
    }
  }

  const resend = resolveResendConfig({
    RESEND_ENABLED: validated.RESEND_ENABLED,
    RESEND_API_KEY: validated.RESEND_API_KEY,
    RESEND_FROM_EMAIL: validated.RESEND_FROM_EMAIL,
    SMTP_FROM: validated.SMTP_FROM,
    RESEND_WEBHOOK_SECRET: validated.RESEND_WEBHOOK_SECRET,
  });
  const resendErrors = assertResendConfig(resend, { required: resend.enabled });
  if (resendErrors.length > 0) {
    throw new Error(`Email environment validation failed:\n- ${resendErrors.join('\n- ')}`);
  }

  return validated;
}
