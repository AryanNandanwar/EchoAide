// src/main.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import helmet from 'helmet';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Optional: enable Helmet but keep CORS config separate
  app.use(helmet());

  const frontendOrigin = process.env.FRONTEND_ORIGIN || 'https://app.echoaide.in';

  app.enableCors({
      origin: (origin: string | undefined, callback:  (err: Error | null, allow?: boolean) => void) => {
        // Allow requests with no origin (like Nginx internal proxying sometimes)
        if (!origin) return callback(null, true);
        
        const allowedOrigins = [
          frontendOrigin,
          'http://localhost',      // Nginx Gateway
          'http://localhost:5173', // Local Dev
          'http://127.0.0.1:5173',
          'https://app.echoaide.in', // Production domain
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
  app.setGlobalPrefix('api', { exclude: ['/socket.io'] }); // exclude WebSocket from global prefix

  const port = process.env.PORT || 3000;
  await app.listen(port, '0.0.0.0');
  console.log(`App listening on ${await app.getUrl()}`);
}
bootstrap();
