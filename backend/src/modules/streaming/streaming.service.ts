import { Injectable, Logger } from '@nestjs/common';
import { SonioxClientService } from './soniox-client.service';
import { IncrementalNoteService } from './incremental-note.service';
import { type ParsedNote } from './schemas/parsed-note.schema';
import { ClinicalNotesService } from '../clinical_notes/clinical-notes.service';
import { CreateClinicalNoteDto } from '../clinical_notes/dto/clinical-note.dto';
import { IntakeService } from '../intake/intake.service';
import { mergePatientDetails } from '../clinical_notes/patient-details.util';

export interface StreamingSession {
  clientId: string;
  sessionId: string;
  isRecording: boolean;
  isPaused: boolean;
  startTime: number;
  lastAudioAt: number;
  transcriptBuffer: string[];
  keepaliveTimer?: ReturnType<typeof setInterval>;
}

const MIN_TRANSCRIPT_LENGTH = 10;
const KEEPALIVE_INTERVAL_MS = 15_000;

export type NoteSkipReason = 'empty_transcript' | 'transcript_too_short' | 'no_doctor_id';

export type StopRecordingResult =
  | { outcome: 'note_created'; noteId: string }
  | { outcome: 'note_skipped'; reason: NoteSkipReason; noteId: string }
  | { outcome: 'note_failed'; reason: string; noteId: string };

export function isTranscriptTooShortForNote(transcript: string): boolean {
  const trimmed = transcript.trim();
  return trimmed.length === 0 || trimmed.length < MIN_TRANSCRIPT_LENGTH;
}

export function getNoteSkipReasonForTranscript(transcript: string): NoteSkipReason {
  if (!transcript.trim()) {
    return 'empty_transcript';
  }
  return 'transcript_too_short';
}

@Injectable()
export class StreamingService {
  private readonly logger = new Logger(StreamingService.name);
  private readonly sessions = new Map<string, StreamingSession>();
  private webSocketGateway: any;

  constructor(
    private readonly sonioxClient: SonioxClientService,
    private readonly incrementalNoteService: IncrementalNoteService,
    private readonly clinicalNotesService: ClinicalNotesService,
    private readonly intakeService: IntakeService,
  ) {}

  async startRecording(clientId: string, sessionId: string): Promise<void> {
    this.logger.log(`Starting recording session ${sessionId} for client ${clientId}`);

    // Initialize session
    const now = Date.now();
    const session: StreamingSession = {
      clientId,
      sessionId,
      isRecording: true,
      isPaused: false,
      startTime: now,
      lastAudioAt: now,
      transcriptBuffer: [],
    };

    this.sessions.set(sessionId, session);

    // Start Soniox streaming connection
    try {
      await this.sonioxClient.startSession(sessionId, (transcript, isPartial) => {
        this.appendFinalTranscript(sessionId, transcript, isPartial);
      });
      this.startKeepaliveTimer(sessionId);
    } catch (error) {
      this.logger.error(`Failed to start Soniox session: ${error.message}`);
      this.sessions.delete(sessionId);
      
      throw error;
    }
  }

  async pauseRecording(clientId: string, sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session || session.clientId !== clientId || !session.isRecording) {
      return;
    }

    session.isPaused = true;
    this.logger.log(`Recording paused for session ${sessionId}`);
    await this.sonioxClient.sendKeepalive(sessionId);
  }

  async resumeRecording(clientId: string, sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session || session.clientId !== clientId || !session.isRecording) {
      return;
    }

    session.isPaused = false;
    session.lastAudioAt = Date.now();
    this.logger.log(`Recording resumed for session ${sessionId}`);

    if (this.sonioxClient.needsSessionRestart(sessionId)) {
      this.logger.warn(`Soniox session ${sessionId} inactive on resume, restarting`);
      await this.sonioxClient.restartSessionIfNeeded(sessionId, (transcript, isPartial) => {
        this.appendFinalTranscript(sessionId, transcript, isPartial);
      });
    }

    await this.sonioxClient.sendKeepalive(sessionId);
  }

  async stopRecording(
    clientId: string,
    sessionId: string,
    noteId: string,
    doctorId?: string,
    patientId?: string,
    intakeId?: string,
    patientDetails?: Record<string, string>,
  ): Promise<StopRecordingResult> {
    this.logger.log(`Stopping recording session ${sessionId} for client ${clientId} with noteId: ${noteId}`);

    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    session.isRecording = false;
    this.stopKeepaliveTimer(session);

    if (!doctorId) {
      this.logger.warn(`Doctor ID not provided, skipping note storage`);
      await this.endSessionWithoutNote(sessionId);
      return { outcome: 'note_skipped', reason: 'no_doctor_id', noteId };
    }

    // Get final transcript BEFORE stopping the Soniox session
    let finalTranscript = '';
    try {
      const sonioxBuffer = this.sonioxClient.getFinalTranscript(sessionId);
      const mergedBuffer = [...session.transcriptBuffer, ...sonioxBuffer];
      finalTranscript = this.createCleanTranscript(mergedBuffer);
      this.logger.log(`Final transcript for note generation: ${finalTranscript.substring(0, 400)}...`);
    } catch (error) {
      this.logger.error(`Failed to get final transcript: ${error.message}`);
    }

    if (isTranscriptTooShortForNote(finalTranscript)) {
      const reason = getNoteSkipReasonForTranscript(finalTranscript);
      this.logger.warn(`${reason}, skipping note generation`);
      await this.endSessionWithoutNote(sessionId);
      return { outcome: 'note_skipped', reason, noteId };
    }

    try {
      await this.sonioxClient.stopSession(sessionId);
    } catch (error) {
      this.logger.error(`Failed to stop Soniox session: ${error.message}`);
    }

    try {
      const finalNote = await this.generateFinalNote(finalTranscript);

      this.logger.log(`Storing clinical note in backend for session ${sessionId} with noteId: ${noteId}`);
      await this.storeClinicalNote(finalNote, doctorId, noteId, patientId, patientDetails);
      if (intakeId) {
        await this.intakeService.completeForDoctor(doctorId, intakeId);
      }
    } catch (error) {
      this.logger.error(`Failed to generate and store final note: ${error.message}`);
      this.scheduleSessionCleanup(sessionId);
      return { outcome: 'note_failed', reason: error.message, noteId };
    }

    this.scheduleSessionCleanup(sessionId);
    return { outcome: 'note_created', noteId };
  }

  private async endSessionWithoutNote(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      this.stopKeepaliveTimer(session);
    }

    try {
      await this.sonioxClient.cancelSession(sessionId);
    } catch (error) {
      this.logger.error(`Failed to cancel Soniox session: ${error.message}`);
    }
    this.sessions.delete(sessionId);
  }

  private scheduleSessionCleanup(sessionId: string): void {
    setTimeout(() => {
      this.sessions.delete(sessionId);
    }, 5000);
  }

  async processAudioChunk(clientId: string, audioBuffer: ArrayBuffer, timestamp: number): Promise<void> {
    this.logger.log(`Processing audio chunk for client ${clientId}, buffer size: ${audioBuffer.byteLength}, timestamp: ${timestamp}`);
    
    // Debug: Log all active sessions
    console.log(`Active sessions: ${Array.from(this.sessions.entries()).map(([key, session]) => `${key}: ${session.clientId} (recording: ${session.isRecording})`).join(', ')}`);
    
    // Find active session for this client
    const session = Array.from(this.sessions.values())
      .find(s => s.clientId === clientId && s.isRecording);

    if (!session) {
      console.warn(` No active recording session found for client ${clientId}`);
      console.warn(`Available client IDs: ${Array.from(this.sessions.values()).map(s => s.clientId).join(', ')}`);
      this.logger.warn(`No active recording session found for client ${clientId}`);
      return;
    }

    console.log(`✅ Found session ${session.sessionId} for client ${clientId}, forwarding to Soniox`);

    session.lastAudioAt = Date.now();

    // Forward audio chunk to Soniox
    try {
      if (this.sonioxClient.needsSessionRestart(session.sessionId)) {
        this.logger.warn(`Soniox session ${session.sessionId} disconnected, restarting before audio chunk`);
        await this.sonioxClient.restartSessionIfNeeded(session.sessionId, (transcript, isPartial) => {
          this.appendFinalTranscript(session.sessionId, transcript, isPartial);
        });
      }

      await this.sonioxClient.sendAudioChunk(session.sessionId, audioBuffer);
    } catch (error) {
      console.error(`❌ Failed to send audio chunk to Soniox: ${error.message}`);
      this.logger.error(`Failed to send audio chunk to Soniox: ${error.message}`);
    }
  }

  
  private appendFinalTranscript(sessionId: string, transcript: string, isPartial: boolean): void {
    if (isPartial) {
      return;
    }

    const trimmed = transcript.trim();
    if (!trimmed) {
      return;
    }

    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    session.transcriptBuffer.push(trimmed);
  }

  private startKeepaliveTimer(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session || session.keepaliveTimer) {
      return;
    }

    session.keepaliveTimer = setInterval(() => {
      const activeSession = this.sessions.get(sessionId);
      if (!activeSession?.isRecording) {
        this.stopKeepaliveTimer(activeSession);
        return;
      }

      const idleMs = Date.now() - activeSession.lastAudioAt;
      if (activeSession.isPaused || idleMs >= KEEPALIVE_INTERVAL_MS) {
        void this.sonioxClient.sendKeepalive(sessionId);
      }
    }, KEEPALIVE_INTERVAL_MS);
  }

  private stopKeepaliveTimer(session?: StreamingSession): void {
    if (!session?.keepaliveTimer) {
      return;
    }

    clearInterval(session.keepaliveTimer);
    session.keepaliveTimer = undefined;
  }

  private createCleanTranscript(transcriptBuffer: string[]): string {
    if (!transcriptBuffer || transcriptBuffer.length === 0) {
      return '';
    }

    // Remove duplicates and very similar phrases
    const uniqueChunks: string[] = [];
    
    transcriptBuffer.forEach(chunk => {
      const trimmed = chunk.trim();
      if (trimmed.length < 5) return; // Skip very short chunks
      
      // Check if this chunk is substantially different from the last one added
      const lastChunk = uniqueChunks[uniqueChunks.length - 1];
      if (!lastChunk || !this.areTranscriptsSimilar(lastChunk, trimmed)) {
        uniqueChunks.push(trimmed);
      }
    });

    // Join with spaces and clean up extra whitespace
    let cleanTranscript = uniqueChunks.join(' ').replace(/\s+/g, ' ').trim();
    
    // Add proper punctuation for better readability
    cleanTranscript = cleanTranscript.replace(/([.!?])\s*([a-z])/g, '$1 $2');
    cleanTranscript = cleanTranscript.replace(/([a-z])([.!?])/g, '$1$2');
    
    return cleanTranscript;
  }

  private areTranscriptsSimilar(transcript1: string, transcript2: string): boolean {
    // Simple similarity check - if transcripts are 80% similar, consider them duplicates
    const longer = transcript1.length > transcript2.length ? transcript1 : transcript2;
    const shorter = transcript1.length > transcript2.length ? transcript2 : transcript1;
    
    if (shorter.length < 10) return false; // Don't compare very short transcripts
    
    // Check if the shorter is contained within the longer (common for streaming transcripts)
    if (longer.includes(shorter)) return true;
    
    // Simple similarity ratio based on common words
    const words1 = transcript1.toLowerCase().split(/\s+/);
    const words2 = transcript2.toLowerCase().split(/\s+/);
    const commonWords = words1.filter(word => words2.includes(word));
    
    const similarity = commonWords.length / Math.max(words1.length, words2.length);
    return similarity > 0.8;
  }


  handleClientDisconnect(clientId: string): void {
    // Find and clean up any sessions for this client
    const clientSessions = Array.from(this.sessions.entries())
      .filter(([_, session]) => session.clientId === clientId);

    clientSessions.forEach(([sessionId, session]) => {
      this.logger.log(`Cleaning up session ${sessionId} for disconnected client ${clientId}`);
      this.stopKeepaliveTimer(session);

      if (session.isRecording) {
        this.sonioxClient.stopSession(sessionId).catch(error => {
          this.logger.error(`Failed to stop Soniox session on disconnect: ${error.message}`);
        });
      }

      this.sessions.delete(sessionId);
    });
  }

  

  // Method to get WebSocket gateway instance (to be injected)
  setWebSocketGateway(gateway: any) {
    // This will be set by the WebSocket gateway to enable communication
    this.webSocketGateway = gateway;
    this.sonioxClient.setWebSocketGateway(gateway);
  }

  // Helper method to find client ID by session ID
  findClientIdBySessionId(sessionId: string): string | null {
    const session = this.sessions.get(sessionId);
    return session?.clientId || null;
  }

  /** Generate the clinical note via in-process AWS Bedrock. */
  private async generateFinalNote(transcript: string): Promise<ParsedNote> {
    return this.incrementalNoteService.generateFinalNote(transcript);
  }

  private async storeClinicalNote(
    finalNote: any,
    doctorId: string,
    noteId: string,
    patientId?: string,
    cardPatientDetails?: Record<string, string>,
  ): Promise<void> {
    try {
      const mergedPatientDetails = mergePatientDetails(
        finalNote.patientDetails,
        cardPatientDetails,
      );

      // Convert ParsedNote to CreateClinicalNoteDto format
      const createDto: CreateClinicalNoteDto = {

        patientDetails: mergedPatientDetails,
        medicalHistory: this.ensureArray(finalNote.medicalHistory),
        problemFaced: this.ensureArray(finalNote.problemFaced),
        findings: this.ensureArray(finalNote.findings),
        diagnosis: this.ensureArray(finalNote.diagnosis),
        investigationsAdvised: this.ensureArray(finalNote.investigationsAdvised),
        doctorInstructions: this.ensureArray(finalNote.doctorInstructions),
        medicationPrescribed: this.ensureArray(finalNote.medicationPrescribed),
        status: 'Draft',
        patientId,
      };

      console.log(`🔍 About to store clinical note for doctor ${doctorId} with noteId: ${noteId}`);
      // Store the clinical note with specific ID
      try {
        const savedNote = await this.clinicalNotesService.createWithId(createDto, doctorId, noteId);
        this.logger.log(`Clinical note stored successfully for doctor ${doctorId} with noteId: ${noteId}`);
        console.log(`✅ Note confirmed saved with ID: ${savedNote.id}`);
      } catch (storeError) {
        console.error(`❌ Failed to store clinical note:`, storeError);
        throw storeError;
      }
    } catch (error) {
      this.logger.error(`Failed to store clinical note: ${error.message}`);
      throw error;
    }
  }

  private ensureArray(value: any): string[] {
    if (Array.isArray(value)) {
      return value.map(item => typeof item === 'string' ? item : String(item));
    }
    if (typeof value === 'string') {
      return value ? [value] : [];
    }
    return [];
  }

  async stopRecordingWithoutNoteStorage(clientId: string, sessionId: string): Promise<void> {
    this.logger.log(`Stopping recording session ${sessionId} for client ${clientId} (without note storage)`);

    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    session.isRecording = false;
    this.stopKeepaliveTimer(session);

    // Stop Soniox streaming connection
    try {
      await this.sonioxClient.stopSession(sessionId);
    } catch (error) {
      this.logger.error(`Failed to stop Soniox session: ${error.message}`);
    }

    // Clean up session after a delay
    setTimeout(() => {
      this.sessions.delete(sessionId);
    }, 5000);
  }

  async cancelRecording(clientId: string, sessionId: string): Promise<void> {
    this.logger.log(`Cancelling recording session ${sessionId} for client ${clientId}`);

    const session = this.sessions.get(sessionId);
    if (!session) {
      this.logger.warn(`Session ${sessionId} not found for cancel`);
      return;
    }

    session.isRecording = false;
    this.stopKeepaliveTimer(session);

    try {
      await this.sonioxClient.cancelSession(sessionId);
    } catch (error) {
      this.logger.error(`Failed to cancel Soniox session: ${error.message}`);
    }

    this.sessions.delete(sessionId);
  }

  // Expose this method for SonioxClientService
  getSessions() {
    return this.sessions;
  }
}
