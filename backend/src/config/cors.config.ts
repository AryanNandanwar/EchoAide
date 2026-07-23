import { INestApplication } from '@nestjs/common';

export function getAllowedOrigins(frontendOrigin: string): string[] {
  return [
    frontendOrigin,
    'http://localhost',
    'http://localhost:8081',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'https://app.echoaide.in',
    'http://app.echoaide.in',
    'http://141.148.207.68',
  ];
}

export function enableAppCors(
  app: INestApplication,
  frontendOrigin = process.env.FRONTEND_ORIGIN || 'https://app.echoaide.in',
): void {
  const allowedOrigins = getAllowedOrigins(frontendOrigin);

  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('CORS policy: This origin is not allowed'), false);
      }
    },
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });
}
