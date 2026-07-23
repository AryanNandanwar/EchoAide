import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { DataSource } from 'typeorm';
import { io, Socket } from 'socket.io-client';
import { DatabaseModule } from '../../src/db/database.module';
import { WebSocketModule } from '../../src/modules/websocket/websocket.module';
import { SonioxClientService } from '../../src/modules/streaming/soniox-client.service';
import { IncrementalNoteService } from '../../src/modules/streaming/incremental-note.service';
import { StreamingService } from '../../src/modules/streaming/streaming.service';
import { type ParsedNote } from '../../src/modules/streaming/schemas/parsed-note.schema';
import { TestDatabaseModule } from './test-database.module';
import { MockSonioxClientService } from './mock-soniox-client';
import { clearIntegrationData } from './integration-test.helper';

export type WebSocketTestContext = {
  app: INestApplication;
  module: TestingModule;
  dataSource: DataSource;
  mockSoniox: MockSonioxClientService;
  incrementalNoteService: { generateFinalNote: jest.Mock };
  streamingService: StreamingService;
  baseUrl: string;
};

export const defaultMockFinalNote: ParsedNote = {
  patientDetails: { name: 'WebSocket Patient' },
  medicalHistory: ['None'],
  problemFaced: 'Fever and cough for three days',
  findings: ['Throat mildly red'],
  diagnosis: ['Viral URI'],
  investigationsAdvised: ['None'],
  doctorInstructions: ['Rest and fluids'],
  medicationPrescribed: ['Paracetamol as needed'],
};

export async function createWebSocketTestApp(): Promise<WebSocketTestContext> {
  const mockSoniox = new MockSonioxClientService();
  const incrementalNoteService = {
    generateFinalNote: jest.fn().mockResolvedValue(defaultMockFinalNote),
  };

  const module = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({ isGlobal: true }),
      TestDatabaseModule,
      WebSocketModule,
    ],
  })
    .overrideModule(DatabaseModule)
    .useModule(TestDatabaseModule)
    .overrideProvider(SonioxClientService)
    .useValue(mockSoniox)
    .overrideProvider(IncrementalNoteService)
    .useValue(incrementalNoteService)
    .compile();

  const app = module.createNestApplication();
  app.useWebSocketAdapter(new IoAdapter(app));
  await app.init();
  await app.listen(0);

  const address = app.getHttpServer().address();
  const port = typeof address === 'object' && address ? address.port : 0;

  return {
    app,
    module,
    dataSource: module.get(DataSource),
    mockSoniox,
    incrementalNoteService,
    streamingService: module.get(StreamingService),
    baseUrl: `http://127.0.0.1:${port}`,
  };
}

export async function closeWebSocketTestApp(context: WebSocketTestContext): Promise<void> {
  for (const [sessionId, session] of context.streamingService.getSessions()) {
    await context.streamingService.cancelRecording(session.clientId, sessionId);
  }
  await context.app.close();
}

export async function resetWebSocketDatabase(context: WebSocketTestContext): Promise<void> {
  for (const [sessionId, session] of context.streamingService.getSessions()) {
    await context.streamingService.cancelRecording(session.clientId, sessionId);
  }

  await clearIntegrationData(context.dataSource);
  context.mockSoniox.reset();
  context.incrementalNoteService.generateFinalNote.mockReset();
  context.incrementalNoteService.generateFinalNote.mockResolvedValue(defaultMockFinalNote);
}

export function connectSocket(baseUrl: string, autoConnect = false): Socket {
  return io(baseUrl, {
    transports: ['websocket'],
    forceNew: true,
    autoConnect,
  });
}

export function waitForSocketEvent<T = unknown>(
  socket: Socket,
  event: string,
  timeoutMs = 5000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`Timed out waiting for socket event "${event}"`));
    }, timeoutMs);

    function handler(payload: T) {
      clearTimeout(timer);
      resolve(payload);
    }

    socket.once(event, handler);
  });
}

export async function connectAndWaitForStatus(baseUrl: string): Promise<Socket> {
  const socket = connectSocket(baseUrl, false);
  const statusPromise = waitForSocketEvent<{ type: string }>(socket, 'status');
  socket.connect();
  await waitForConnected(socket);
  await statusPromise;
  return socket;
}

export function waitForConnected(socket: Socket, timeoutMs = 5000): Promise<void> {
  if (socket.connected) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Timed out waiting for socket connection'));
    }, timeoutMs);

    socket.once('connect', () => {
      clearTimeout(timer);
      resolve();
    });

    socket.once('connect_error', (error: Error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

export function disconnectSocket(socket: Socket): Promise<void> {
  if (!socket.connected) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    socket.once('disconnect', () => resolve());
    socket.disconnect();
  });
}

export function flushPromises(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

export async function waitForCondition(
  predicate: () => boolean,
  timeoutMs = 3000,
  intervalMs = 25,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) {
      throw new Error('Timed out waiting for condition');
    }
    await flushPromises();
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}
