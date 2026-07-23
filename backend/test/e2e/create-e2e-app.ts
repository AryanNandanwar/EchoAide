import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { DataSource } from 'typeorm';
import { App } from 'supertest/types';
import { DatabaseModule } from '../../src/db/database.module';
import { AuthModule } from '../../src/modules/auth/auth.module';
import { ClinicalNotesModule } from '../../src/modules/clinical_notes/clinical-notes.module';
import { PatientModule } from '../../src/modules/patient/patient.module';
import { IntakeModule } from '../../src/modules/intake/intake.module';
import { StreamingModule } from '../../src/modules/streaming/streaming.module';
import { WebSocketModule } from '../../src/modules/websocket/websocket.module';
import { PdfService } from '../../src/modules/clinical_notes/pdf.service';
import { StreamingService } from '../../src/modules/streaming/streaming.service';
import { SonioxClientService } from '../../src/modules/streaming/soniox-client.service';
import { IncrementalNoteService } from '../../src/modules/streaming/incremental-note.service';
import { TestDatabaseModule } from '../utils/test-database.module';
import { defaultMockFinalNote } from '../utils/websocket-test.helper';
import { E2eSonioxClientService } from './e2e-soniox-client';
import { E2eModule } from './e2e.module';

export type E2eAppContext = {
  app: INestApplication<App>;
  module: TestingModule;
  dataSource: DataSource;
  httpServer: App;
  baseUrl: string;
  soniox: E2eSonioxClientService;
};

export type CreateE2eAppOptions = {
  port?: number;
  jwtAccessExpiration?: string;
};

export async function createE2eApp(
  options: CreateE2eAppOptions = {},
): Promise<E2eAppContext> {
  const port = options.port ?? Number(process.env.E2E_BACKEND_PORT ?? 3099);

  process.env.E2E_MODE = 'true';
  process.env.APP_JWT_SECRET = process.env.APP_JWT_SECRET ?? 'e2e-test-secret';
  process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'e2e-test-secret';
  process.env.JWT_ACCESS_EXPIRATION =
    options.jwtAccessExpiration ?? process.env.JWT_ACCESS_EXPIRATION ?? '1h';
  process.env.FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN ?? 'http://127.0.0.1:5173';

  const incrementalNoteService = {
    generateFinalNote: async () => defaultMockFinalNote,
  };

  const module = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({ isGlobal: true }),
      PassportModule.register({ defaultStrategy: 'jwt' }),
      TestDatabaseModule,
      AuthModule,
      ClinicalNotesModule,
      PatientModule,
      IntakeModule,
      StreamingModule,
      WebSocketModule,
      E2eModule,
    ],
  })
    .overrideModule(DatabaseModule)
    .useModule(TestDatabaseModule)
    .overrideProvider(SonioxClientService)
    .useClass(E2eSonioxClientService)
    .overrideProvider(IncrementalNoteService)
    .useValue(incrementalNoteService)
    .overrideProvider(PdfService)
    .useValue({
      generateClinicalNotePdf: async () =>
        Buffer.from('%PDF-1.4\n% EchoAide E2E fake PDF\n'),
    })
    .compile();

  const app = module.createNestApplication();
  app.useWebSocketAdapter(new IoAdapter(app));
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );
  app.setGlobalPrefix('api', { exclude: ['/socket.io'] });
  await app.init();
  await app.listen(port, '0.0.0.0');

  return {
    app,
    module,
    dataSource: module.get(DataSource),
    httpServer: app.getHttpServer(),
    baseUrl: `http://127.0.0.1:${port}`,
    soniox: module.get(SonioxClientService) as E2eSonioxClientService,
  };
}

export async function closeE2eApp(context: E2eAppContext): Promise<void> {
  const streamingService = context.module.get(StreamingService);
  for (const [sessionId, session] of streamingService.getSessions()) {
    await streamingService.cancelRecording(session.clientId, sessionId);
  }
  await context.app.close();
}
