import { mkdirSync } from 'fs';
import request from 'supertest';
import { StreamingService } from '../../src/modules/streaming/streaming.service';
import {
  closeApiTestApp,
  createApiTestApp,
  resetApiDatabase,
  type ApiTestContext,
} from '../utils/api-test.helper';

describe('Upload Audio API', () => {
  let context: ApiTestContext;
  let streamingService: jest.Mocked<Pick<StreamingService, 'startRecording' | 'processAudioChunk' | 'stopRecordingWithoutNoteStorage' | 'stopRecording'>>;

  beforeAll(async () => {
    mkdirSync('./uploads', { recursive: true });
    context = await createApiTestApp({ mockPdf: true, mockStreaming: true });
    streamingService = context.module.get(StreamingService);
  });

  afterAll(async () => {
    await closeApiTestApp(context);
  });

  beforeEach(async () => {
    await resetApiDatabase(context);
    jest.clearAllMocks();
  });

  it('POST /api/upload-audio rejects unsupported file types', async () => {
    await request(context.httpServer)
      .post('/api/upload-audio')
      .attach('audio', Buffer.from('plain text'), {
        filename: 'notes.txt',
        contentType: 'text/plain',
      })
      .expect(400);
  });

  it('POST /api/upload-audio rejects missing files', async () => {
    await request(context.httpServer).post('/api/upload-audio').expect(400);
  });

  it('POST /api/upload-audio processes valid audio without note storage', async () => {
    const response = await request(context.httpServer)
      .post('/api/upload-audio')
      .attach('audio', Buffer.from('RIFF....WAVEfmt '), {
        filename: 'sample.wav',
        contentType: 'audio/wav',
      })
      .expect(201);

    expect(response.body.success).toBe(true);
    expect(response.body.sessionId).toMatch(/^upload_/);
    expect(streamingService.startRecording).toHaveBeenCalled();
    expect(streamingService.processAudioChunk).toHaveBeenCalled();
    expect(streamingService.stopRecordingWithoutNoteStorage).toHaveBeenCalled();
  });

  it('POST /api/upload-audio forwards doctor and patient context when provided', async () => {
    await request(context.httpServer)
      .post('/api/upload-audio')
      .field('doctorId', 'doctor-123')
      .field('patientId', 'patient-456')
      .attach('audio', Buffer.from('RIFF....WAVEfmt '), {
        filename: 'sample.wav',
        contentType: 'audio/wav',
      })
      .expect(201);

    expect(streamingService.stopRecording).toHaveBeenCalled();
    expect(streamingService.stopRecordingWithoutNoteStorage).not.toHaveBeenCalled();
  });
});
