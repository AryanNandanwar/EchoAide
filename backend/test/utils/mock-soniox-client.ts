export type TranscriptHandler = (transcript: string, isPartial: boolean) => void;

/**
 * In-memory Soniox stand-in for WebSocket / streaming integration tests.
 * Mirrors the mock used in streaming-pause.integration.spec.ts.
 */
export class MockSonioxClientService {
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
  readonly stopSessionCalls: string[] = [];
  readonly cancelSessionCalls: string[] = [];
  readonly audioChunkCalls: Array<{ sessionId: string; byteLength: number }> = [];

  reset(): void {
    this.sessions.clear();
    this.keepaliveCalls.length = 0;
    this.restartCalls.length = 0;
    this.stopSessionCalls.length = 0;
    this.cancelSessionCalls.length = 0;
    this.audioChunkCalls.length = 0;
  }

  setWebSocketGateway(_gateway: unknown): void {
    return;
  }

  async startSession(sessionId: string, onTranscript: TranscriptHandler): Promise<void> {
    if (this.sessions.has(sessionId)) {
      throw new Error(`Session ${sessionId} already exists`);
    }
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

  async sendAudioChunk(sessionId: string, audioBuffer: ArrayBuffer): Promise<void> {
    this.audioChunkCalls.push({ sessionId, byteLength: audioBuffer.byteLength });
  }

  async stopSession(sessionId: string): Promise<void> {
    this.stopSessionCalls.push(sessionId);
    this.sessions.delete(sessionId);
  }

  async cancelSession(sessionId: string): Promise<void> {
    this.cancelSessionCalls.push(sessionId);
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

  emitPartialTranscript(sessionId: string, transcript: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }
    session.onTranscript(transcript, true);
  }

  simulateSonioxDisconnect(sessionId: string): void {
    this.sessions.delete(sessionId);
  }
}
