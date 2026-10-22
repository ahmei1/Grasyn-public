import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { RealtimeIoAdapter } from './realtime/io.adapter';
import { setupApp } from './setup-app';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
    bodyParser: false,
  });
  const config = app.get(ConfigService);
  app.useWebSocketAdapter(new RealtimeIoAdapter(app, config));
  setupApp(app);

  const swagger = new DocumentBuilder()
    .setTitle('Grasyn API')
    .setDescription('API contract for the Grasyn workspace MVP')
    .setVersion('1.0')
    .build();
  SwaggerModule.setup(
    'api/docs',
    app,
    SwaggerModule.createDocument(app, swagger),
  );

  const port = Number(config.get('PORT') ?? 4000);
  await app.listen(port);
}

bootstrap().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
