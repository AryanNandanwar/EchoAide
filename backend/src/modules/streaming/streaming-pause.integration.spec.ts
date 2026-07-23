import { Test, TestingModule } from '@nestjs/testing';
import { StreamingService } from './streaming.service';
import { SonioxClientService } from './soniox-client.service';
import { IncrementalNoteService } from './incremental-note.service';
import { ClinicalNotesService } from '../clinical_notes/clinical-notes.service';
import { IntakeService } from '../intake/intake.service';
import { type ParsedNote } from './schemas/parsed-note.schema';

const KEEPALIVE_INTERVAL_MS = 15_000;
const FIVE_MINUTES_MS = 5 * 60 * 1000;

type TranscriptHandler = (transcript: string, isPartial: boolean) => void;

class MockSonioxClientService {
  private readonly sessions = new Map<
    string,
    {
      active: boolean;
      transcriptBuffer: string[];
      onTranscript: TranscriptHandler;
    }
  >();

  readonly keepaliveCalls: string[] = [];
  readonly restartCalls: string[] = [];

  async startSession(sessionId: string, onTranscript: TranscriptHandler): Promise<void> {
    this.sessions.set(sessionId, {
      active: false,
      transcriptBuffer: [],
      onTranscript,
    });
  }

  markSessionActive(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.active = true;
    }
  }

  async restartSessionIfNeeded(
    sessionId: string,
    onTranscript: TranscriptHandler,
  ): Promise<void> {
    this.restartCalls.push(sessionId);
    await this.startSession(sessionId, onTranscript);
  }

  async sendKeepalive(sessionId: string): Promise<void> {
    this.keepaliveCalls.push(sessionId);
  }

  async sendAudioChunk(_sessionId: string, _audioBuffer: ArrayBuffer): Promise<void> {
    return;
  }

  async finalizeSession(_sessionId: string): Promise<void> {
    return;
  }

  async stopSession(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
  }

  async cancelSession(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
  }

  isSessionActive(sessionId: string): boolean {
    return this.sessions.get(sessionId)?.active ?? false;
  }

  needsSessionRestart(sessionId: string): boolean {
    return !this.sessions.has(sessionId);
  }

  getFinalTranscript(sessionId: string): string[] {
    return [...(this.sessions.get(sessionId)?.transcriptBuffer ?? [])];
  }

  emitFinalTranscript(sessionId: string, transcript: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    session.transcriptBuffer.push(transcript);
    session.onTranscript(transcript, false);
  }

  simulateSonioxDisconnect(sessionId: string): void {
    this.sessions.delete(sessionId);
  }
}

describe('StreamingService pause integration', () => {
  let module: TestingModule;
  let streamingService: StreamingService;
  let mockSoniox: MockSonioxClientService;

  const clientId = 'client-1';
  const sessionId = 'session-pause-test';
  const doctorId = 'doctor-1';
  const noteId = 'note-1';

  const mockFinalNote: ParsedNote = {
    patientDetails: { Name: 'Test Patient' },
    medicalHistory: ['None'],
    problemFaced: 'Fever and cough',
    findings: ['Normal exam'],
    diagnosis: ['Viral URI'],
    investigationsAdvised: ['None'],
    doctorInstructions: ['Rest and fluids'],
    medicationPrescribed: ['Paracetamol as needed'],
    raw: '',
  };

  beforeEach(async () => {
    mockSoniox = new MockSonioxClientService();

    module = await Test.createTestingModule({
      providers: [
        StreamingService,
        { provide: SonioxClientService, useValue: mockSoniox },
        {
          provide: IncrementalNoteService,
          useValue: {
            generateFinalNote: jest.fn().mockResolvedValue(mockFinalNote),
          },
        },
        {
          provide: ClinicalNotesService,
          useValue: {
            createWithId: jest.fn().mockResolvedValue({ id: noteId }),
          },
        },
        {
          provide: IntakeService,
          useValue: {
            completeForDoctor: jest.fn(),
          },
        },
      ],
    }).compile();

    streamingService = module.get(StreamingService);
    jest.useFakeTimers();
  });

  afterEach(async () => {
    jest.useRealTimers();
    await module.close();
  });

  it('does not restart Soniox while the initial connection is still opening', async () => {
    await streamingService.startRecording(clientId, sessionId);

    await streamingService.processAudioChunk(clientId, new ArrayBuffer(128), Date.now());

    expect(mockSoniox.restartCalls).toHaveLength(0);
    expect(mockSoniox.isSessionActive(sessionId)).toBe(false);
  });

  it('sends keepalives during a 5-minute pause and still generates a clinical note', async () => {
    await streamingService.startRecording(clientId, sessionId);
    mockSoniox.markSessionActive(sessionId);
    mockSoniox.emitFinalTranscript(sessionId, 'Patient reports fever and persistent cough');

    await streamingService.pauseRecording(clientId, sessionId);

    expect(mockSoniox.keepaliveCalls).toContain(sessionId);

    jest.advanceTimersByTime(FIVE_MINUTES_MS);

    const keepalivesDuringPause =
      mockSoniox.keepaliveCalls.filter((id) => id === sessionId).length;
    expect(keepalivesDuringPause).toBeGreaterThanOrEqual(
      1 + Math.floor(FIVE_MINUTES_MS / KEEPALIVE_INTERVAL_MS),
    );

    await streamingService.resumeRecording(clientId, sessionId);
    mockSoniox.emitFinalTranscript(sessionId, 'Symptoms started three days ago');

    await streamingService.processAudioChunk(clientId, new ArrayBuffer(128), Date.now());

    const result = await streamingService.stopRecording(
      clientId,
      sessionId,
      noteId,
      doctorId,
    );

    expect(result).toEqual({ outcome: 'note_created', noteId });
    expect(mockSoniox.isSessionActive(sessionId)).toBe(false);
  });

  it('preserves pre-pause transcript and restarts Soniox after disconnect on resume', async () => {
    await streamingService.startRecording(clientId, sessionId);
    mockSoniox.markSessionActive(sessionId);
    mockSoniox.emitFinalTranscript(sessionId, 'Patient reports fever and persistent cough');

    await streamingService.pauseRecording(clientId, sessionId);
    mockSoniox.simulateSonioxDisconnect(sessionId);

    jest.advanceTimersByTime(FIVE_MINUTES_MS);

    expect(mockSoniox.isSessionActive(sessionId)).toBe(false);

    await streamingService.resumeRecording(clientId, sessionId);

    expect(mockSoniox.restartCalls).toContain(sessionId);
    expect(mockSoniox.needsSessionRestart(sessionId)).toBe(false);

    mockSoniox.markSessionActive(sessionId);
    mockSoniox.emitFinalTranscript(sessionId, 'Symptoms started three days ago');

    const result = await streamingService.stopRecording(
      clientId,
      sessionId,
      noteId,
      doctorId,
    );

    expect(result).toEqual({ outcome: 'note_created', noteId });

    const incrementalNoteService = module.get(IncrementalNoteService);
    expect(incrementalNoteService.generateFinalNote).toHaveBeenCalledWith(
      expect.stringMatching(/fever.*cough.*three days ago/i),
    );
  });

  it('skips note generation when pause outlasts Soniox and no transcript was captured', async () => {
    await streamingService.startRecording(clientId, sessionId);
    mockSoniox.markSessionActive(sessionId);

    await streamingService.pauseRecording(clientId, sessionId);
    mockSoniox.simulateSonioxDisconnect(sessionId);

    jest.advanceTimersByTime(FIVE_MINUTES_MS);

    await streamingService.resumeRecording(clientId, sessionId);
    await streamingService.processAudioChunk(clientId, new ArrayBuffer(128), Date.now());

    const result = await streamingService.stopRecording(
      clientId,
      sessionId,
      noteId,
      doctorId,
    );

    expect(result).toEqual({
      outcome: 'note_skipped',
      reason: 'empty_transcript',
      noteId,
    });
  });
});
