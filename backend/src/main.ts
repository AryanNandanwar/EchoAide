// src/main.ts
import './telemetry';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import helmet from 'helmet';
import { enableAppCors } from './config/cors.config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(helmet());
  enableAppCors(app);

  // If you use a global prefix:
  app.setGlobalPrefix('api', { exclude: ['/socket.io'] }); // exclude WebSocket from global prefix

  const port = process.env.PORT || 3000;
  await app.listen(port, '0.0.0.0');
  console.log(`App listening on ${await app.getUrl()}`);
}
bootstrap();
