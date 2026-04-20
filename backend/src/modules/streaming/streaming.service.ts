import { Injectable, Logger } from '@nestjs/common';
import { SonioxClientService } from './soniox-client.service';
import { IncrementalNoteService } from './incremental-note.service';
import { SseService } from '../sse/sse.service';

export interface StreamingSession {
  clientId: string;
  sessionId: string;
  isRecording: boolean;
  startTime: number;
  transcriptBuffer: string[];
}

@Injectable()
export class StreamingService {
  private readonly logger = new Logger(StreamingService.name);
  private readonly sessions = new Map<string, StreamingSession>();
  private webSocketGateway: any;

  constructor(
    private readonly sonioxClient: SonioxClientService,
    private readonly incrementalNoteService: IncrementalNoteService,
    private readonly sseService: SseService,
  ) {}

  async startRecording(clientId: string, sessionId: string): Promise<void> {
    this.logger.log(`Starting recording session ${sessionId} for client ${clientId}`);

    // Initialize session
    const session: StreamingSession = {
      clientId,
      sessionId,
      isRecording: true,
      startTime: Date.now(),
      transcriptBuffer: [],
    };

    this.sessions.set(sessionId, session);

    // Start Soniox streaming connection
    try {
      await this.sonioxClient.startSession(sessionId, (transcript, isPartial) => {
        this.handleTranscriptUpdate(sessionId, transcript, isPartial);
      });
    } catch (error) {
      this.logger.error(`Failed to start Soniox session: ${error.message}`);
      this.sessions.delete(sessionId);
      
      throw error;
    }
  }

  async stopRecording(clientId: string, sessionId: string): Promise<void> {
    this.logger.log(`Stopping recording session ${sessionId} for client ${clientId}`);

    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    session.isRecording = false;

    // Stop Soniox streaming connection
    try {
      await this.sonioxClient.stopSession(sessionId);
    } catch (error) {
      this.logger.error(`Failed to stop Soniox session: ${error.message}`);
    }

    // Generate final note
    try {
      const finalTranscript = this.createCleanTranscript(session.transcriptBuffer);
      this.logger.log(`Final transcript for note generation: ${finalTranscript.substring(0, 200)}...`);
      
      // Check if we have meaningful transcript content
      if (!finalTranscript || finalTranscript.trim().length === 0) {
        this.logger.warn('Empty transcript, skipping note generation');
        return;
      }
      
      // Check if transcript is too short to be meaningful
      if (finalTranscript.trim().length < 10) {
        this.logger.warn('Transcript too short for meaningful note generation, skipping');
        return;
      }
      
      const finalNote = await this.incrementalNoteService.generateFinalNote(finalTranscript);
      
      // Send final complete note via SSE (keeps connection open even if WebSocket closes)
      this.logger.log(`Sending final note via SSE for session ${sessionId}`);
      this.sseService.sendFinalNote(sessionId, finalNote);
    } catch (error) {
      this.logger.error(`Failed to generate final note: ${error.message}`);
    }

    // Clean up session after a delay
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

    // Forward audio chunk to Soniox
    try {
      await this.sonioxClient.sendAudioChunk(session.sessionId, audioBuffer);
    } catch (error) {
      console.error(`❌ Failed to send audio chunk to Soniox: ${error.message}`);
      this.logger.error(`Failed to send audio chunk to Soniox: ${error.message}`);
    }
  }

  private handleTranscriptUpdate(sessionId: string, transcript: string, isPartial: boolean): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    // Send transcript to client immediately
    this.sendTranscriptUpdate(session.clientId, transcript, isPartial);

    // For partial transcripts, avoid duplicates by checking if it's substantially different
    if (isPartial) {
      const lastTranscript = session.transcriptBuffer[session.transcriptBuffer.length - 1];
      if (!lastTranscript || !this.areTranscriptsSimilar(lastTranscript, transcript)) {
        session.transcriptBuffer.push(transcript);
        
      }
    } else {
      // Always add final transcripts
      session.transcriptBuffer.push(transcript);

    }
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
      
      if (session.isRecording) {
        this.sonioxClient.stopSession(sessionId).catch(error => {
          this.logger.error(`Failed to stop Soniox session on disconnect: ${error.message}`);
        });
      }
      
      
      this.sessions.delete(sessionId);
    });
  }

  private sendTranscriptUpdate(clientId: string, transcript: string, isPartial: boolean): void {
    if (this.webSocketGateway) {
      this.webSocketGateway.sendTranscriptToClient(clientId, transcript, isPartial);
    }
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

  // Expose this method for SonioxClientService
  getSessions() {
    return this.sessions;
  }
}
