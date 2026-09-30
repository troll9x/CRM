import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from './app.module';
import { ApiEnvelopeInterceptor } from './common/api-envelope.interceptor';
import { ApiExceptionFilter } from './common/api-exception.filter';
import { csrfProtection } from './common/csrf.middleware';
import { requestIdMiddleware } from './common/request-id.middleware';

export async function createApplication(): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule, { cors: false });
  const config = app.get(ConfigService);
  const allowedOrigins = new Set(
    (config.get<string>('WEB_ORIGIN') ?? 'http://localhost:3000')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  );

  app.use(helmet());
  app.use(cookieParser());
  app.use(requestIdMiddleware);
  app.use(csrfProtection(allowedOrigins));
  app.enableCors({
    credentials: true,
    origin(origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) {
      if (!origin || allowedOrigins.has(origin)) callback(null, true);
      else callback(new Error('Origin không được phép'));
    },
  });
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.useGlobalInterceptors(new ApiEnvelopeInterceptor());
  app.useGlobalFilters(new ApiExceptionFilter());

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Sơn CRM API')
    .setDescription('API nội bộ phiên bản 1 cho CRM bán sỉ và bán lẻ')
    .setVersion('0.1.0')
    .addCookieAuth('crm_session')
    .build();
  const documentFactory = () => SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, documentFactory, { jsonDocumentUrl: 'docs-json' });

  return app;
}
