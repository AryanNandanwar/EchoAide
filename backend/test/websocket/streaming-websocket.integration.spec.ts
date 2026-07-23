import { Socket } from 'socket.io-client';
import { ClinicalNote } from '../../src/modules/clinical_notes/entity/clinical_notes.entity';
import { createTestDoctor, getRepo } from '../utils/integration-test.helper';
import {
  closeWebSocketTestApp,
  connectAndWaitForStatus,
  connectSocket,
  createWebSocketTestApp,
  defaultMockFinalNote,
  disconnectSocket,
  flushPromises,
  resetWebSocketDatabase,
  waitForCondition,
  waitForConnected,
  waitForSocketEvent,
  type WebSocketTestContext,
} from '../utils/websocket-test.helper';

type RecordingStatusPayload = {
  type: 'recording_status';
  data: {
    status: string;
    sessionId: string;
    noteId?: string;
    reason?: string;
  };
  timestamp: number;
};

type ErrorPayload = {
  type: 'error';
  data: { message: string };
  timestamp: number;
};

describe('Streaming WebSocket integration', () => {
  let context: WebSocketTestContext;

  beforeAll(async () => {
    context = await createWebSocketTestApp();
  });

  afterAll(async () => {
    await closeWebSocketTestApp(context);
  });

  beforeEach(async () => {
    await resetWebSocketDatabase(context);
  });

  async function startSession(
    socket: Socket,
    sessionId: string,
  ): Promise<RecordingStatusPayload> {
    const statusPromise = waitForSocketEvent<RecordingStatusPayload>(
      socket,
      'recording_status',
    );
    socket.emit('start_recording', { sessionId });
    const status = await statusPromise;
    expect(status.data.status).toBe('started');
    expect(status.data.sessionId).toBe(sessionId);
    return status;
  }

  it('emits connected status on connect', async () => {
    const socket = connectSocket(context.baseUrl, false);
    const statusPromise = waitForSocketEvent<{ type: string; message: string }>(
      socket,
      'status',
    );
    socket.connect();
    await waitForConnected(socket);

    const status = await statusPromise;

    expect(status.type).toBe('connected');
    expect(status.message).toContain('Connected');

    await disconnectSocket(socket);
  });

  it('start_recording emits recording_status started and opens a Soniox session', async () => {
    const socket = await connectAndWaitForStatus(context.baseUrl);
    const sessionId = 'ws-start-session';

    await startSession(socket, sessionId);

    expect(context.streamingService.getSessions().has(sessionId)).toBe(true);
    expect(context.mockSoniox.getFinalTranscript(sessionId)).toEqual([]);

    await disconnectSocket(socket);
  });

  it('pause_recording and resume_recording emit correct recording_status events', async () => {
    const socket = await connectAndWaitForStatus(context.baseUrl);
    const sessionId = 'ws-pause-resume';

    await startSession(socket, sessionId);
    context.mockSoniox.emitFinalTranscript(
      sessionId,
      'Patient reports fever and persistent cough',
    );

    const pausedPromise = waitForSocketEvent<RecordingStatusPayload>(
      socket,
      'recording_status',
    );
    socket.emit('pause_recording', { sessionId });
    const paused = await pausedPromise;
    expect(paused.data.status).toBe('paused');

    const resumedPromise = waitForSocketEvent<RecordingStatusPayload>(
      socket,
      'recording_status',
    );
    socket.emit('resume_recording', { sessionId });
    const resumed = await resumedPromise;
    expect(resumed.data.status).toBe('resumed');

    await disconnectSocket(socket);
  });

  it('cancel_recording emits cancelled and removes the session', async () => {
    const socket = await connectAndWaitForStatus(context.baseUrl);
    const sessionId = 'ws-cancel-session';

    await startSession(socket, sessionId);

    const cancelledPromise = waitForSocketEvent<RecordingStatusPayload>(
      socket,
      'recording_status',
    );
    socket.emit('cancel_recording', { sessionId });
    const cancelled = await cancelledPromise;

    expect(cancelled.data.status).toBe('cancelled');
    expect(cancelled.data.sessionId).toBe(sessionId);
    expect(context.streamingService.getSessions().has(sessionId)).toBe(false);
    expect(context.mockSoniox.cancelSessionCalls).toContain(sessionId);

    await disconnectSocket(socket);
  });

  it('audio_chunk forwards PCM data to the mocked Soniox client', async () => {
    const socket = await connectAndWaitForStatus(context.baseUrl);
    const sessionId = 'ws-audio-chunk';
    const pcmPayload = Buffer.from([0, 1, 2, 3, 4, 5]).toString('base64');

    await startSession(socket, sessionId);

    socket.emit('audio_chunk', { data: pcmPayload, timestamp: Date.now() });
    await waitForCondition(
      () => context.mockSoniox.audioChunkCalls.length >= 1,
    );

    const chunkCall = context.mockSoniox.audioChunkCalls.find(
      (call) => call.sessionId === sessionId,
    );
    expect(chunkCall).toBeDefined();
    // Node Buffer.buffer may reference a larger pooled ArrayBuffer backing store.
    expect(chunkCall!.byteLength).toBeGreaterThanOrEqual(6);

    await disconnectSocket(socket);
  });

  it('start_recording emits error when the session already exists', async () => {
    const socket = await connectAndWaitForStatus(context.baseUrl);
    const sessionId = 'ws-duplicate-session';

    await startSession(socket, sessionId);

    const errorPromise = waitForSocketEvent<ErrorPayload>(socket, 'error');
    socket.emit('start_recording', { sessionId });
    const error = await errorPromise;

    expect(error.data.message).toMatch(/already exists|Failed to start recording/i);

    await disconnectSocket(socket);
  });

  it('stop_recording emits error when the session does not exist', async () => {
    const socket = await connectAndWaitForStatus(context.baseUrl);

    const errorPromise = waitForSocketEvent<ErrorPayload>(socket, 'error');
    socket.emit('stop_recording', {
      sessionId: 'missing-session',
      noteId: 'note-missing',
      doctorId: 'doctor-missing',
    });
    const error = await errorPromise;

    expect(error.data.message).toMatch(/not found|Failed to stop recording/i);

    await disconnectSocket(socket);
  });

  it('cleans up active sessions when the client disconnects', async () => {
    const socket = await connectAndWaitForStatus(context.baseUrl);
    const sessionId = 'ws-disconnect-cleanup';

    await startSession(socket, sessionId);
    expect(context.streamingService.getSessions().has(sessionId)).toBe(true);

    await disconnectSocket(socket);
    await flushPromises();
    await flushPromises();

    expect(context.streamingService.getSessions().has(sessionId)).toBe(false);
    expect(context.mockSoniox.stopSessionCalls).toContain(sessionId);
  });

  it('stop_recording end-to-end persists a note and emits stopped status', async () => {
    const doctor = await createTestDoctor(context.dataSource);
    const socket = await connectAndWaitForStatus(context.baseUrl);
    const sessionId = 'ws-stop-e2e';
    const noteId = 'ws-note-e2e';
    const transcript =
      'Patient reports fever and persistent cough for three days';

    await startSession(socket, sessionId);
    context.mockSoniox.emitFinalTranscript(sessionId, transcript);

    socket.emit('audio_chunk', {
      data: Buffer.from([0, 0, 0, 0]).toString('base64'),
      timestamp: Date.now(),
    });
    await flushPromises();

    const stoppedPromise = waitForSocketEvent<RecordingStatusPayload>(
      socket,
      'recording_status',
    );
    socket.emit('stop_recording', {
      sessionId,
      noteId,
      doctorId: doctor.id,
    });
    const stopped = await stoppedPromise;

    expect(stopped.data.status).toBe('stopped');
    expect(stopped.data.sessionId).toBe(sessionId);
    expect(stopped.data.noteId).toBe(noteId);

    expect(context.incrementalNoteService.generateFinalNote).toHaveBeenCalledWith(
      expect.stringMatching(/fever.*cough/i),
    );

    const stored = await getRepo(context.dataSource, ClinicalNote).findOneBy({
      id: noteId,
    });
    expect(stored).toBeTruthy();
    expect(stored?.doctorId).toBe(doctor.id);
    expect(JSON.parse(stored!.problemsFaced)).toContain(
      defaultMockFinalNote.problemFaced,
    );

    await disconnectSocket(socket);
  });

  it('stop_recording emits note_skipped when transcript is empty', async () => {
    const doctor = await createTestDoctor(context.dataSource);
    const socket = await connectAndWaitForStatus(context.baseUrl);
    const sessionId = 'ws-stop-empty';
    const noteId = 'ws-note-empty';

    await startSession(socket, sessionId);

    const skippedPromise = waitForSocketEvent<RecordingStatusPayload>(
      socket,
      'recording_status',
    );
    socket.emit('stop_recording', {
      sessionId,
      noteId,
      doctorId: doctor.id,
    });
    const skipped = await skippedPromise;

    expect(skipped.data.status).toBe('note_skipped');
    expect(skipped.data.reason).toBe('empty_transcript');
    expect(skipped.data.noteId).toBe(noteId);
    expect(await getRepo(context.dataSource, ClinicalNote).count()).toBe(0);

    await disconnectSocket(socket);
  });

  it('stop_recording emits note_failed when Bedrock note generation fails', async () => {
    const doctor = await createTestDoctor(context.dataSource);
    const socket = await connectAndWaitForStatus(context.baseUrl);
    const sessionId = 'ws-stop-failed';
    const noteId = 'ws-note-failed';

    await startSession(socket, sessionId);
    context.mockSoniox.emitFinalTranscript(
      sessionId,
      'Patient reports fever and persistent cough for three days',
    );
    context.incrementalNoteService.generateFinalNote.mockRejectedValueOnce(
      new Error('Bedrock unavailable'),
    );

    const failedPromise = waitForSocketEvent<RecordingStatusPayload>(
      socket,
      'recording_status',
    );
    socket.emit('stop_recording', {
      sessionId,
      noteId,
      doctorId: doctor.id,
    });
    const failed = await failedPromise;

    expect(failed.data.status).toBe('note_failed');
    expect(failed.data.reason).toMatch(/Bedrock unavailable/i);
    expect(await getRepo(context.dataSource, ClinicalNote).count()).toBe(0);

    await disconnectSocket(socket);
  });
});
