import { MockSonioxClientService } from '../utils/mock-soniox-client';

const DEFAULT_E2E_TRANSCRIPT =
  'Patient reports fever and persistent cough for three days with mild headache and fatigue';

/**
 * Soniox stand-in for browser E2E: emits a final transcript when the first
 * audio chunk arrives so upload-audio and fake-mic flows produce a note.
 */
export class E2eSonioxClientService extends MockSonioxClientService {
  private readonly transcriptEmitted = new Set<string>();

  constructor(private readonly transcript: string = DEFAULT_E2E_TRANSCRIPT) {
    super();
  }

  resetForE2e(): void {
    this.reset();
    this.transcriptEmitted.clear();
  }

  async startSession(
    sessionId: string,
    onTranscript: (transcript: string, isPartial: boolean) => void,
  ): Promise<void> {
    await super.startSession(sessionId, onTranscript);
    this.markSessionActive(sessionId);
  }

  async sendAudioChunk(sessionId: string, audioBuffer: ArrayBuffer): Promise<void> {
    await super.sendAudioChunk(sessionId, audioBuffer);

    if (this.transcriptEmitted.has(sessionId)) {
      return;
    }

    this.transcriptEmitted.add(sessionId);
    this.emitFinalTranscript(sessionId, this.transcript);
  }

  getFinalTranscript(sessionId: string): string[] {
    if (
      this.transcriptEmitted.has(sessionId) ||
      this.audioChunkCalls.some(
        (call) => call.sessionId === sessionId && call.byteLength > 0,
      )
    ) {
      return [this.transcript];
    }
    return super.getFinalTranscript(sessionId);
  }
}
