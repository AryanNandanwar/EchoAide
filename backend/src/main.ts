// src/main.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import helmet from 'helmet';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Optional: enable Helmet but keep CORS config separate
  app.use(helmet());

  // #region agent log
  fetch('http://127.0.0.1:7885/ingest/231ef9cf-d927-49db-82f0-f19e114f6243', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Debug-Session-Id': '4ef709',
    },
    body: JSON.stringify({
      sessionId: '4ef709',
      runId: 'initial',
      hypothesisId: 'H1',
      location: 'backend/src/main.ts:bootstrap',
      message: 'NestJS app bootstrap called',
      data: {},
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion agent log

  const frontendOrigin = process.env.FRONTEND_ORIGIN || 'http://localhost';

  app.enableCors({
      origin: (origin: string | undefined, callback:  (err: Error | null, allow?: boolean) => void) => {
        // Allow requests with no origin (like Nginx internal proxying sometimes)
        if (!origin) return callback(null, true);
        
        const allowedOrigins = [
          frontendOrigin,
          'http://localhost',      // Nginx Gateway
          'http://localhost:5173', // Local Dev
          'http://127.0.0.1:5173',
          'http://app.echoaide.in', // Production domain
          'http://141.148.207.68'  // Production IP
        ];

        if (allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error('CORS policy: This origin is not allowed'), false);
        }
      },
      methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
      credentials: true,
    });

  // If you use a global prefix:
  app.setGlobalPrefix('api'); // if you do, remember POST path changes to /api/auth/signup

  const port = process.env.PORT || 3000;
  await app.listen(port, '0.0.0.0');
  console.log(`App listening on ${await app.getUrl()}`);
}
bootstrap();
