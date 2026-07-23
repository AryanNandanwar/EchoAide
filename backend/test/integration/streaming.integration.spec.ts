import { TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { StreamingService } from '../../src/modules/streaming/streaming.service';
import { SonioxClientService } from '../../src/modules/streaming/soniox-client.service';
import { IncrementalNoteService } from '../../src/modules/streaming/incremental-note.service';
import { ClinicalNotesService } from '../../src/modules/clinical_notes/clinical-notes.service';
import { IntakeService } from '../../src/modules/intake/intake.service';
import { type ParsedNote } from '../../src/modules/streaming/schemas/parsed-note.schema';
import {
  clearIntegrationData,
  createIntegrationTestingModule,
  createTestDoctor,
  getRepo,
} from '../utils/integration-test.helper';
import { ClinicalNote } from '../../src/modules/clinical_notes/entity/clinical_notes.entity';
import { PatientIntake } from '../../src/modules/intake/entities/patient-intake.entity';

type TranscriptHandler = (transcript: string, isPartial: boolean) => void;

class MockSonioxClientService {
  private readonly sessions = new Map<
    string,
    { transcriptBuffer: string[]; onTranscript: TranscriptHandler }
  >();

  readonly keepaliveCalls: string[] = [];

  reset(): void {
    this.sessions.clear();
    this.keepaliveCalls.length = 0;
  }

  async startSession(sessionId: string, onTranscript: TranscriptHandler): Promise<void> {
    this.sessions.set(sessionId, { transcriptBuffer: [], onTranscript });
  }

  async sendKeepalive(sessionId: string): Promise<void> {
    this.keepaliveCalls.push(sessionId);
  }

  async sendAudioChunk(_sessionId: string, _audioBuffer: ArrayBuffer): Promise<void> {
    return;
  }

  async stopSession(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
  }

  async cancelSession(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
  }

  needsSessionRestart(sessionId: string): boolean {
    return !this.sessions.has(sessionId);
  }

  getFinalTranscript(sessionId: string): string[] {
    return [...(this.sessions.get(sessionId)?.transcriptBuffer ?? [])];
  }

  emitFinalTranscript(sessionId: string, transcript: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.transcriptBuffer.push(transcript);
    session.onTranscript(transcript, false);
  }

  async restartSessionIfNeeded(sessionId: string, onTranscript: TranscriptHandler): Promise<void> {
    await this.startSession(sessionId, onTranscript);
  }

  setWebSocketGateway(_gateway: unknown): void {
    return;
  }
}

describe('StreamingService integration', () => {
  let module: TestingModule;
  let streamingService: StreamingService;
  let incrementalNoteService: { generateFinalNote: jest.Mock };
  let mockSoniox: MockSonioxClientService;
  let dataSource: DataSource;
  let doctorId: string;

  const clientId = 'client-streaming';

  const mockFinalNote: ParsedNote = {
    patientDetails: { name: 'Streaming Patient' },
    medicalHistory: ['None'],
    problemFaced: 'Fever and cough for three days',
    findings: ['Throat mildly red'],
    diagnosis: ['Viral URI'],
    investigationsAdvised: ['None'],
    doctorInstructions: ['Rest and fluids'],
    medicationPrescribed: ['Paracetamol as needed'],
  };

  beforeAll(async () => {
    mockSoniox = new MockSonioxClientService();
    incrementalNoteService = {
      generateFinalNote: jest.fn().mockResolvedValue(mockFinalNote),
    };

    module = await createIntegrationTestingModule([
      StreamingService,
      ClinicalNotesService,
      IntakeService,
      { provide: SonioxClientService, useValue: mockSoniox },
      { provide: IncrementalNoteService, useValue: incrementalNoteService },
    ]);

    streamingService = module.get(StreamingService);
    dataSource = module.get(DataSource);
  });

  afterAll(async () => {
    await dataSource.destroy();
    await module.close();
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    mockSoniox.reset();
    incrementalNoteService.generateFinalNote.mockResolvedValue(mockFinalNote);
    await clearIntegrationData(dataSource);
    doctorId = (await createTestDoctor(dataSource)).id;
  });

  async function startSessionWithTranscript(sessionId: string, transcript: string) {
    await streamingService.startRecording(clientId, sessionId);
    mockSoniox.emitFinalTranscript(sessionId, transcript);
  }

  it('persists a clinical note when stopRecording succeeds', async () => {
    const sessionId = 'session-created';
    const noteId = 'note-created';

    await startSessionWithTranscript(
      sessionId,
      'Patient reports fever and persistent cough for three days',
    );

    const result = await streamingService.stopRecording(
      clientId,
      sessionId,
      noteId,
      doctorId,
    );

    expect(result).toEqual({ outcome: 'note_created', noteId });

    const stored = await getRepo(dataSource, ClinicalNote).findOneBy({ id: noteId });
    expect(stored).toBeTruthy();
    expect(stored?.doctorId).toBe(doctorId);
    expect(JSON.parse(stored!.problemsFaced)).toContain('Fever and cough for three days');
  });

  it('skips note generation when transcript is empty', async () => {
    const sessionId = 'session-empty';
    const noteId = 'note-empty';

    await streamingService.startRecording(clientId, sessionId);

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
    expect(await getRepo(dataSource, ClinicalNote).count()).toBe(0);
  });

  it('skips note generation when doctorId is missing', async () => {
    const sessionId = 'session-no-doctor';
    const noteId = 'note-no-doctor';

    await startSessionWithTranscript(
      sessionId,
      'Patient reports fever and persistent cough for three days',
    );

    const result = await streamingService.stopRecording(clientId, sessionId, noteId);

    expect(result).toEqual({
      outcome: 'note_skipped',
      reason: 'no_doctor_id',
      noteId,
    });
  });

  it('returns note_failed when note generation fails', async () => {
    const sessionId = 'session-failed';
    const noteId = 'note-failed';

    await startSessionWithTranscript(
      sessionId,
      'Patient reports fever and persistent cough for three days',
    );
    incrementalNoteService.generateFinalNote.mockRejectedValueOnce(new Error('Bedrock unavailable'));

    const result = await streamingService.stopRecording(
      clientId,
      sessionId,
      noteId,
      doctorId,
    );

    expect(result.outcome).toBe('note_failed');
    expect(result.noteId).toBe(noteId);
    expect(await getRepo(dataSource, ClinicalNote).count()).toBe(0);
  });

  it('marks intake completed when note is saved with intakeId', async () => {
    const intakeService = module.get(IntakeService);
    const intake = await intakeService.createPatientIntake(doctorId, {
      fullName: 'Intake Patient',
      gender: 'female',
      age: '29',
      phone: '9111111111',
    });

    const sessionId = 'session-intake';
    const noteId = 'note-intake';

    await startSessionWithTranscript(
      sessionId,
      'Patient reports fever and persistent cough for three days',
    );

    const result = await streamingService.stopRecording(
      clientId,
      sessionId,
      noteId,
      doctorId,
      intake.patientId,
      intake.id,
    );

    expect(result).toEqual({ outcome: 'note_created', noteId });

    const updatedIntake = await getRepo(dataSource, PatientIntake).findOneByOrFail({
      id: intake.id,
    });
    expect(updatedIntake.status).toBe('completed');
  });

  it('sends keepalives while paused and still creates a note after resume', async () => {
    jest.useFakeTimers();

    const sessionId = 'session-pause';
    const noteId = 'note-pause';

    await streamingService.startRecording(clientId, sessionId);
    mockSoniox.emitFinalTranscript(sessionId, 'Patient reports fever and persistent cough');

    await streamingService.pauseRecording(clientId, sessionId);
    expect(mockSoniox.keepaliveCalls).toContain(sessionId);

    jest.advanceTimersByTime(60_000);

    await streamingService.resumeRecording(clientId, sessionId);
    mockSoniox.emitFinalTranscript(sessionId, 'Symptoms started three days ago');

    const result = await streamingService.stopRecording(
      clientId,
      sessionId,
      noteId,
      doctorId,
    );

    expect(result).toEqual({ outcome: 'note_created', noteId });
    jest.useRealTimers();
  });
});
