import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { DatabaseModule } from '../../src/db/database.module';
import { AuthModule } from '../../src/modules/auth/auth.module';
import { ClinicalNotesModule } from '../../src/modules/clinical_notes/clinical-notes.module';
import { PatientModule } from '../../src/modules/patient/patient.module';
import { IntakeModule } from '../../src/modules/intake/intake.module';
import { StreamingModule } from '../../src/modules/streaming/streaming.module';
import { PdfService } from '../../src/modules/clinical_notes/pdf.service';
import { StreamingService } from '../../src/modules/streaming/streaming.service';
import { SonioxClientService } from '../../src/modules/streaming/soniox-client.service';
import { IncrementalNoteService } from '../../src/modules/streaming/incremental-note.service';
import { TestDatabaseModule } from './test-database.module';
import {
  clearIntegrationData,
  createTestDoctor,
  createTestReceptionist,
  createTestPatient,
} from './integration-test.helper';
import { Doctor } from '../../src/modules/doctor/doctor.entity';
import { Receptionist } from '../../src/modules/receptionist/receptionist.entity';

export type AuthTokens = {
  accessToken: string;
  refreshToken: string;
};

export type ApiTestContext = {
  app: INestApplication<App>;
  module: TestingModule;
  dataSource: DataSource;
  httpServer: App;
};

export type ApiTestOptions = {
  mockPdf?: boolean;
  mockStreaming?: boolean;
};

const mockSonioxClient = {
  setWebSocketGateway: jest.fn(),
  startSession: jest.fn().mockResolvedValue(undefined),
  stopSession: jest.fn().mockResolvedValue(undefined),
  cancelSession: jest.fn().mockResolvedValue(undefined),
  sendAudioChunk: jest.fn().mockResolvedValue(undefined),
  sendKeepalive: jest.fn().mockResolvedValue(undefined),
  getFinalTranscript: jest.fn().mockReturnValue([]),
  needsSessionRestart: jest.fn().mockReturnValue(false),
  restartSessionIfNeeded: jest.fn().mockResolvedValue(undefined),
};

const mockIncrementalNote = {
  generateFinalNote: jest.fn().mockResolvedValue({
    patientDetails: {},
    medicalHistory: ['None'],
    problemFaced: 'Test problem',
    findings: ['Normal'],
    diagnosis: ['Test diagnosis'],
    investigationsAdvised: ['None'],
    doctorInstructions: ['Rest'],
    medicationPrescribed: ['None'],
  }),
};

export function createMockStreamingService() {
  return {
    startRecording: jest.fn().mockResolvedValue(undefined),
    processAudioChunk: jest.fn().mockResolvedValue(undefined),
    stopRecordingWithoutNoteStorage: jest.fn().mockResolvedValue(undefined),
    stopRecording: jest.fn().mockResolvedValue({ outcome: 'note_created', noteId: 'upload-note' }),
  };
}

export async function createApiTestApp(
  options: ApiTestOptions = { mockPdf: true, mockStreaming: true },
): Promise<ApiTestContext> {
  process.env.APP_JWT_SECRET = 'api-test-secret';
  process.env.JWT_SECRET = 'api-test-secret';

  let moduleBuilder = Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({ isGlobal: true }),
      PassportModule.register({ defaultStrategy: 'jwt' }),
      TestDatabaseModule,
      AuthModule,
      ClinicalNotesModule,
      PatientModule,
      IntakeModule,
      StreamingModule,
    ],
  })
    .overrideModule(DatabaseModule)
    .useModule(TestDatabaseModule)
    .overrideProvider(SonioxClientService)
    .useValue(mockSonioxClient)
    .overrideProvider(IncrementalNoteService)
    .useValue(mockIncrementalNote);

  if (options.mockPdf !== false) {
    moduleBuilder = moduleBuilder.overrideProvider(PdfService).useValue({
      generateClinicalNotePdf: jest
        .fn()
        .mockResolvedValue(Buffer.from('%PDF-1.4\n% fake pdf content')),
    });
  }

  if (options.mockStreaming !== false) {
    moduleBuilder = moduleBuilder
      .overrideProvider(StreamingService)
      .useValue(createMockStreamingService());
  }

  const module = await moduleBuilder.compile();
  const app = module.createNestApplication();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );
  app.setGlobalPrefix('api', { exclude: ['/socket.io'] });
  await app.init();

  return {
    app,
    module,
    dataSource: module.get(DataSource),
    httpServer: app.getHttpServer(),
  };
}

export async function closeApiTestApp(context: ApiTestContext): Promise<void> {
  await context.app.close();
}

export async function loginDoctor(
  httpServer: App,
  email: string,
  password = 'password123',
): Promise<AuthTokens> {
  const response = await request(httpServer)
    .post('/api/auth/login')
    .send({ email, password, accountType: 'doctor' })
    .expect(201);

  return {
    accessToken: response.body.accessToken,
    refreshToken: response.body.refreshToken,
  };
}

export async function loginReceptionist(
  httpServer: App,
  email: string,
  password = 'password123',
): Promise<AuthTokens> {
  const response = await request(httpServer)
    .post('/api/auth/login')
    .send({ email, password, accountType: 'receptionist' })
    .expect(201);

  return {
    accessToken: response.body.accessToken,
    refreshToken: response.body.refreshToken,
  };
}

export async function seedDoctorWithToken(
  context: ApiTestContext,
  overrides: Partial<Doctor> & { password?: string } = {},
): Promise<{ doctor: Doctor; tokens: AuthTokens }> {
  const doctor = await createTestDoctor(context.dataSource, overrides);
  const tokens = await loginDoctor(
    context.httpServer,
    doctor.email,
    overrides.password ?? 'password123',
  );
  return { doctor, tokens };
}

export async function seedReceptionistWithToken(
  context: ApiTestContext,
  doctorId: string,
  overrides: Partial<Receptionist> & { password?: string } = {},
): Promise<{ receptionist: Receptionist; tokens: AuthTokens }> {
  const receptionist = await createTestReceptionist(context.dataSource, doctorId, overrides);
  const tokens = await loginReceptionist(
    context.httpServer,
    receptionist.email,
    overrides.password ?? 'password123',
  );
  return { receptionist, tokens };
}

export function authHeader(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` };
}

export async function resetApiDatabase(context: ApiTestContext): Promise<void> {
  await clearIntegrationData(context.dataSource);
}

export { createTestPatient };
