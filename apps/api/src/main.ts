import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { AppModule } from './app.module';
import { isAllowedCorsOrigin, parseOriginList } from '@/common/utils/cors-origins';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });
  const config = app.get(ConfigService);

  // Consultation fax sends PDF as base64 JSON (iFax max ~20MB request)
  app.useBodyParser('json', {
    limit: '20mb',
    verify: (req: { rawBody?: Buffer }, _res: unknown, buf: Buffer) => {
      req.rawBody = buf;
    },
  });
  app.useBodyParser('urlencoded', { limit: '20mb', extended: true });

  // Local upload fallback (GCS is preferred when GCS_BUCKET is set)
  const uploadsDir = config.get<string>('UPLOAD_DIR', './uploads');
  const resolvedUploads = uploadsDir.startsWith('/')
    ? uploadsDir
    : join(process.cwd(), uploadsDir);
  if (!existsSync(resolvedUploads)) mkdirSync(resolvedUploads, { recursive: true });
  app.useStaticAssets(resolvedUploads, { prefix: '/uploads' });
  const isProduction = config.get('NODE_ENV') === 'production';

  if (isProduction) {
    app.getHttpAdapter().getInstance().set('trust proxy', 1);
  }

  // Allow the web app (different origin) to load attachment images from the API.
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(cookieParser());
  app.enableCors({
    origin: (origin, callback) => {
      const allowed = parseOriginList(
        config.get<string>('WEB_URL') || 'http://localhost:3000',
        config.get<string>('CORS_ORIGINS'),
      );
      if (isAllowedCorsOrigin(origin, allowed)) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Accept',
      'X-Requested-With',
      'Idempotency-Key',
      'X-Phix-Timestamp',
      'X-Phix-Nonce',
      'X-Phix-Signature',
    ],
    optionsSuccessStatus: 204,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.setGlobalPrefix('api/v1');

  const swaggerConfig = new DocumentBuilder()
    .setTitle('SafeScribe API')
    .setDescription('Pharmacist Clinical Operating System API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  const port = config.get('API_PORT', 3001);
  await app.listen(port);
  console.log(`API running on http://localhost:${port}`);
  console.log(`Swagger docs at http://localhost:${port}/api/docs`);
}

bootstrap();
