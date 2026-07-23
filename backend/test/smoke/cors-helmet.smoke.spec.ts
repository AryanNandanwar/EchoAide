import { Controller, Get, INestApplication, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import request from 'supertest';
import { App } from 'supertest/types';
import { enableAppCors } from '../../src/config/cors.config';

@Controller()
class PingController {
  @Get('ping')
  ping() {
    return { ok: true };
  }
}

@Module({ controllers: [PingController] })
class SmokeModule {}

async function createSecuritySmokeApp(
  frontendOrigin: string,
): Promise<INestApplication<App>> {
  process.env.FRONTEND_ORIGIN = frontendOrigin;

  const app = await NestFactory.create(SmokeModule);
  app.use(helmet());
  enableAppCors(app);
  app.setGlobalPrefix('api');
  await app.init();
  return app;
}

describe('Infrastructure smoke: CORS and Helmet (main.ts policy)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createSecuritySmokeApp('http://localhost:8081');
  });

  afterAll(async () => {
    await app.close();
  });

  it('sets Helmet security headers on API responses', async () => {
    const response = await request(app.getHttpServer()).get('/api/ping').expect(200);

    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBeDefined();
  });

  it.each([
    'http://localhost:8081',
    'http://localhost:5173',
    'https://app.echoaide.in',
  ])('allows CORS preflight from %s', async (origin) => {
    const response = await request(app.getHttpServer())
      .options('/api/ping')
      .set('Origin', origin)
      .set('Access-Control-Request-Method', 'GET')
      .expect(204);

    expect(response.headers['access-control-allow-origin']).toBe(origin);
    expect(response.headers['access-control-allow-credentials']).toBe('true');
  });

  it('blocks CORS preflight from disallowed origins', async () => {
    const response = await request(app.getHttpServer())
      .options('/api/ping')
      .set('Origin', 'https://evil.example.com')
      .set('Access-Control-Request-Method', 'GET');

    expect(response.status).toBe(500);
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('allows requests with no Origin header (nginx proxy path)', async () => {
    await request(app.getHttpServer()).get('/api/ping').expect(200);
  });
});
