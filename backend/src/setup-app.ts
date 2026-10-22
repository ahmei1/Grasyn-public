import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { HttpErrorFilter } from './common/filters/http-error.filter';

export function setupApp(app: NestExpressApplication) {
  const config = app.get(ConfigService);
  const origin =
    config.get<string>('FRONTEND_ORIGIN') ?? 'http://localhost:5173';
  app.enableShutdownHooks();

  app.setGlobalPrefix('api');
  // Default parser is off so this 1mb limit is the one that runs. GitHub
  // push payloads can pass 100kb, and rawBody: true keeps the signed bytes.
  app.useBodyParser('json', { limit: '1mb' });
  app.useBodyParser('urlencoded', { extended: true, limit: '1mb' });
  app.use(helmet());
  app.use(cookieParser());
  app.use((req: Request, res: Response, next: NextFunction) => {
    const path = req.originalUrl.split('?')[0];
    // GitHub (and the local smee relay) is not a browser. smee forwards an
    // Origin header that would otherwise fail this check.
    if (path === '/api/github/webhook') {
      next();
      return;
    }
    if (
      !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
      req.headers.origin &&
      req.headers.origin !== origin
    ) {
      res
        .status(403)
        .json({ code: 'FORBIDDEN', message: 'Request origin is not allowed' });
      return;
    }
    next();
  });
  app.enableCors({
    origin,
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalFilters(new HttpErrorFilter());
}
