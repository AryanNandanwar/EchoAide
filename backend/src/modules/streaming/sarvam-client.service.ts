import { Injectable, Logger } from '@nestjs/common';
import WebSocket from 'ws';

export interface SarvamConfig {
  apiKey: string;
  model: string;
  mode: string;
  sampleRate: number;
  inputAudioCodec: string;
  highVadSensitivity: boolean;
  vadSignals: boolean;
  flushSignal: boolean;
}

// Add a property to track which format we're trying for this session
export interface SarvamSession {
  sessionId: string;
  ws: WebSocket;
  onTranscript: (transcript: string, isPartial: boolean) => void;
  isActive: boolean;
}

@Injectable()
export class SarvamClientService {
  private readonly logger = new Logger(SarvamClientService.name);
  private readonly sessions = new Map<string, SarvamSession>();
  private readonly config: SarvamConfig;
  private webSocketGateway: any;
  private streamingService: any;

  // Add a property to track which format to try next
  private nextFormatToTry: 'base64' = 'base64';

  constructor() {
    // Initialize Sarvam configuration from environment variables
    this.config = {
      apiKey: process.env.SARVAM_API_KEY || '',
      model: process.env.SARVAM_MODEL || 'saaras:v3',
      mode: process.env.SARVAM_MODE || 'translate',
      sampleRate: parseInt(process.env.SARVAM_SAMPLE_RATE || '16000'),
      inputAudioCodec: process.env.SARVAM_AUDIO_CODEC || 'pcm_s16le', 
      highVadSensitivity: process.env.SARVAM_HIGH_VAD_SENSITIVITY === 'true',
      vadSignals: process.env.SARVAM_VAD_SIGNALS === 'true',
      flushSignal: true
    };

    if (!this.config.apiKey) {
      this.logger.warn('Sarvam API key not configured. Please set SARVAM_API_KEY environment variable.');
    }
  }

  setWebSocketGateway(gateway: any) {
    this.webSocketGateway = gateway;
    // Also get reference to streaming service for session mapping
    this.streamingService = gateway?.streamingService;
  }

  async startSession(
    sessionId: string,
    onTranscript: (transcript: string, isPartial: boolean) => void,
  ): Promise<void> {
    console.log(`🎤 SarvamClient: startSession called for ${sessionId}`);
    
    if (this.sessions.has(sessionId)) {
      console.error(`❌ Session ${sessionId} already exists`);
      throw new Error(`Session ${sessionId} already exists`);
    }

    if (!this.config.apiKey) {
      console.error(`❌ Sarvam API key not configured`);
      throw new Error('Sarvam API key not configured');
    }

    console.log(`✅ API key configured, starting WebSocket connection to Sarvam`);
    this.logger.log(`Starting Sarvam session: ${sessionId}`);

    try {
      // Create WebSocket connection to Sarvam
      // Build WebSocket URL with config as query parameters
      // NOTE: api-subscription-key MUST be sent as an HTTP header (auth), not a query param
      const wsUrl = new URL('wss://api.sarvam.ai/speech-to-text/ws');
      wsUrl.searchParams.set('mode', this.config.mode);
      wsUrl.searchParams.set('model', this.config.model);
      wsUrl.searchParams.set('sample_rate', this.config.sampleRate.toString());
      wsUrl.searchParams.set('input_audio_codec', 'wav'); // Updated to WAV format
      wsUrl.searchParams.set('flush_signal', this.config.flushSignal.toString());
      wsUrl.searchParams.set('high_vad_sensitivity', 'true');
      wsUrl.searchParams.set('vad_signals', 'true');
      wsUrl.searchParams.set('language-code', 'unknown');


      console.log(`� Connecting to ${wsUrl.origin}${wsUrl.pathname}...`);
      console.log(`📋 Connection config:`, {
        'api-subscription-key': this.config.apiKey ? 'CONFIGURED' : 'MISSING',
        'saaras-model': this.config.model,
        'mode': this.config.mode,
        'sample-rate': this.config.sampleRate,
        'audio-codec': this.config.inputAudioCodec  ,
        'full-url': wsUrl.toString(),
        'flush-signal': this.config.flushSignal,
        'high-vad-sensitivity': this.config.highVadSensitivity,
        'vad-signals': this.config.vadSignals
      });
      
      const ws = new WebSocket(wsUrl.toString(), {
        headers: {
          'Api-Subscription-Key': this.config.apiKey,
        },
      });

      const session: SarvamSession = {
        sessionId,
        ws,
        onTranscript,
        isActive: false
      };

      this.sessions.set(sessionId, session);

      // Set up WebSocket event handlers
      ws.on('open', () => {
        this.logger.log(`Sarvam WebSocket connected for session: ${sessionId}`);
        session.isActive = true;
        
        // Send a test ping after connection
        setTimeout(() => {
          if (session.ws && session.ws.readyState === WebSocket.OPEN) {
            console.log(`🔍 Sending ping to Sarvam for session ${sessionId}`);
            session.ws.ping();
          }
        }, 1000);
      });

      ws.on('pong', () => {
        console.log(`🏓 Received pong from Sarvam for session ${sessionId} - connection is alive`);
      });

      ws.on('message', (data: WebSocket.Data) => {
        // Convert data to string for JSON parsing (Sarvam sends text responses)
        const dataStr = data.toString();
        const dataBuffer = Buffer.from(dataStr);
        
        console.log(`📨 Sarvam message received for ${sessionId}:`, {
          sessionId: sessionId.substring(0, 10) + '...',
          dataType: typeof data,
          dataLength: dataBuffer.length,
          isBinary: Buffer.isBuffer(data)
        });
        
        // Try to parse the JSON message
        try {
          const parsed = JSON.parse(dataStr);
          console.log(`🔍 Parsed Sarvam message:`, parsed);
        } catch (e) {
          console.log(`⚠️ Could not parse Sarvam message as JSON:`, dataStr);
        }
        
        this.handleSarvamMessage(sessionId, data);
      });

      ws.on('error', (error) => {
        console.error(`❌ Sarvam WebSocket error for session ${sessionId}:`, error);
        this.logger.error(`Sarvam WebSocket error for session ${sessionId}:`, error);
        
        // Clean up session on error
        session.isActive = false;
        this.sessions.delete(sessionId);
        
        // Notify client about the error
        if (this.webSocketGateway) {
          const clientId = this.findClientIdBySessionId(sessionId);
          if (clientId) {
            this.webSocketGateway.server.to(clientId).emit('error', {
              type: 'connection_error',
              data: { message: 'Speech recognition service connection error' },
              timestamp: Date.now(),
            });
          }
        }
      });

      ws.on('close', (code, reason) => {
        console.log(`🔌 Sarvam WebSocket closed for session ${sessionId}: ${code} - ${reason}`);
        this.logger.log(`Sarvam WebSocket closed for session ${sessionId}: ${code} - ${reason}`);
        session.isActive = false;
        
        // Check if this was a normal closure (1000) or due to pipeline errors
        const reasonStr = reason?.toString() || '';
        if (code === 1000 && reasonStr.length === 0) {
          // Normal closure without explicit reason - might be due to pipeline error
          this.logger.warn(`Sarvam connection closed without explicit reason - possible pipeline error`);
          // Don't immediately clean up session - give it a chance to recover
          setTimeout(() => {
            if (!session.isActive && this.sessions.has(sessionId)) {
              this.logger.log(`Cleaning up session ${sessionId} after delayed cleanup`);
              this.handleSessionClose(sessionId, code, 'Delayed cleanup after pipeline error');
            }
          }, 2000); // 2 second delay before cleanup
        } else {
          // Immediate cleanup for other types of closures
          this.handleSessionClose(sessionId, code, reasonStr || 'Unknown reason');
        }
      });

      // Add connection timeout
      setTimeout(() => {
        if (!session.isActive && ws.readyState === WebSocket.CONNECTING) {
          console.error(`❌ Sarvam WebSocket connection timeout for session ${sessionId}`);
          this.logger.error(`Sarvam WebSocket connection timeout for session ${sessionId}`);
          ws.terminate();
          // Clean up session on timeout
          this.sessions.delete(sessionId);
        } else if (session.isActive) {
          console.log(`✅ Sarvam WebSocket connection confirmed active for session ${sessionId}`);
        }
      }, 10000); // 10 second timeout
      
      // Add immediate check
      setTimeout(() => {
        console.log(`🔍 Checking Sarvam connection status for ${sessionId}:`, {
          readyState: ws.readyState,
          isActive: session.isActive,
          readyStateText: ws.readyState === WebSocket.CONNECTING ? 'CONNECTING' : 
                          ws.readyState === WebSocket.OPEN ? 'OPEN' : 
                          ws.readyState === WebSocket.CLOSING ? 'CLOSING' : 
                          ws.readyState === WebSocket.CLOSED ? 'CLOSED' : 'UNKNOWN'
        });
      }, 1000); // 1 second check

    } catch (error) {
      console.error(`❌ Failed to create Sarvam WebSocket: ${error.message}`);
      this.logger.error(`Failed to start Sarvam session: ${error.message}`);
      throw error;
    }
  }

  async stopSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      this.logger.warn(`Session ${sessionId} not found`);
      return;
    }

    this.logger.log(`Stopping Sarvam session: ${sessionId}`);

    try {
      if (session.ws.readyState === WebSocket.OPEN) {
        // Send flush signal to force final processing
        session.ws.send(JSON.stringify({ type: 'flush' }));
        
        // Wait a moment for final results, then close
        setTimeout(() => {
          if (session.ws.readyState === WebSocket.OPEN) {
            session.ws.close(1000, 'Session stopped normally');
          }
        }, 1000);
      } else {
        // Force close if not in OPEN state
        session.ws.terminate();
      }
    } catch (error) {
      this.logger.error(`Failed to stop session gracefully:`, error);
      session.ws.terminate();
    }

    // Remove session from active sessions immediately
    this.sessions.delete(sessionId);
  }

  async sendAudioChunk(sessionId: string, audioArrayBuffer: ArrayBuffer): Promise<void> {
    console.log(`🎵 Sending audio chunk to Sarvam for session ${sessionId}, size: ${audioArrayBuffer.byteLength}`);
    
    let session = this.sessions.get(sessionId);
    
    // If session doesn't exist, we can't recreate it without the onTranscript callback
    if (!session) {
      console.warn(`⚠️ Cannot send audio chunk - session ${sessionId} not found`);
      this.logger.warn(`Session ${sessionId} not found for audio chunk`);
      return;
    }

    if (!session.isActive) {
      console.warn(`⚠️ Cannot send audio chunk - session ${sessionId} not active`);
      this.logger.warn(`Session ${sessionId} not active for audio chunk`);
      return;
    }

    if (session.ws.readyState !== WebSocket.OPEN) {
      console.warn(`⚠️ Cannot send audio chunk - WebSocket not open for session ${sessionId}, state: ${session.ws.readyState}`);
      this.logger.warn(`WebSocket not open for session ${sessionId}, state: ${session.ws.readyState}`);
      return;
    }

    // Additional check: don't send completely empty buffers
    if (audioArrayBuffer.byteLength === 0) {
      console.warn(`⚠️ Skipping empty audio buffer for session ${sessionId}`);
      return;
    }

    try {
      // Convert ArrayBuffer to Base64 string
      const audioBuffer = Buffer.from(audioArrayBuffer);
      const base64Audio = audioBuffer.toString('base64');
      
      console.log(`🔍 Audio data conversion:`, {
        sessionId: sessionId.substring(0, 10) + '...',
        originalSize: audioArrayBuffer.byteLength,
        base64Length: base64Audio.length,
        sampleRate: this.config.sampleRate
      });
      
      // Create the JSON message format required by Sarvam
      const audioMessage = {
        audio: {
          data: base64Audio,
          sample_rate: "16000",
          encoding: "audio/wav"
        }
      };
      
      console.log(`📡 Sending audio to Sarvam in JSON format:`, { 
        sessionId: sessionId.substring(0, 10) + '...', 
        audioDataLength: base64Audio.length,
        sampleRate: "16000",
        encoding: "audio/wav",
        messageSize: JSON.stringify(audioMessage).length
      });
      
      // Send as JSON string (not binary)
      session.ws.send(JSON.stringify(audioMessage));
      console.log(`✅ Audio WAV data sent to Sarvam as JSON with base64 encoding`);
    } catch (error) {
      console.error(`❌ Failed to send audio chunk to Sarvam: ${error.message}`);
      this.logger.error(`Failed to send audio chunk to Sarvam for session ${sessionId}:`, error);
      
      // If sending fails, the connection might be broken
      if (error.message.includes('WebSocket') || error.message.includes('closed')) {
        this.logger.warn(`Connection appears broken for session ${sessionId}, cleaning up`);
        session.isActive = false;
        this.sessions.delete(sessionId);
      }
    }
  }

  // Config is now passed as query parameters in the WebSocket URL — no separate config message needed.

  private handleSarvamMessage(sessionId: string, data: WebSocket.Data): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    const dataStr = data.toString();
    
    // Handle empty or invalid responses
    if (!dataStr || dataStr.trim().length === 0) {
      this.logger.warn(`Received empty message from Sarvam for session ${sessionId}`);
      return;
    }

    try {
      const message = JSON.parse(dataStr);
      
      switch (message.type) {
        case 'speech_start':
          this.logger.debug(`Speech detected for session ${sessionId}`);
          break;

        case 'speech_end':
          this.logger.debug(`Speech ended for session ${sessionId}`);
          break;

        case 'partial_transcript':
        case 'transcript':
        case 'translation': // Add translation message type for translate mode
          const transcript = message.text || '';
          const isPartial = message.type === 'partial_transcript';
          
          this.logger.debug(`Received ${isPartial ? 'partial' : 'final'} ${message.type} for session ${sessionId}: ${transcript.substring(0, 100)}...`);
          
          // Call the transcript callback
          session.onTranscript(transcript, isPartial);
          break;

        case 'data':
          // Handle Sarvam's data message format
          if (message.data && message.data.transcript) {
            const transcript = message.data.transcript || '';
            this.logger.debug(`Received Sarvam data transcript for session ${sessionId}: ${transcript.substring(0, 100)}...`);
            
            // Call the transcript callback (treat as partial transcript for real-time updates)
            session.onTranscript(transcript, true);
          }
          break;

        case 'error':
          const errorMessage = message.data?.message || message.message || 'Unknown Sarvam error';
          this.logger.error(`Sarvam error for session ${sessionId}:`, errorMessage);
          break;

        default:
          this.logger.debug(`Unknown message type from Sarvam for session ${sessionId}: ${message.type}`);
          this.logger.debug(`Message content:`, JSON.stringify(message, null, 2));
      }
    } catch (error) {
      this.logger.error(`Failed to parse Sarvam message for session ${sessionId}: ${error.message}`);
      this.logger.debug(`Raw message content:`, dataStr.substring(0, 200));
      
      // Check if the raw message contains error information
      if (dataStr.includes('error') || dataStr.includes('Error')) {
        // Try to extract error message from raw text
        const errorMatch = dataStr.match(/"message":"([^"]+)"/);
        const errorMessage = errorMatch ? errorMatch[1] : 'Unknown Sarvam parsing error';
        
        this.logger.warn(`Extracted error from raw message: ${errorMessage}`);
        
        // Don't immediately end the session for parsing errors - might be temporary
        if (errorMessage.includes('Expecting value') || errorMessage.includes('Pipeline')) {
          this.logger.warn(`Sarvam pipeline parsing error - continuing session`);
          return;
        }
        
        this.handleSessionError(sessionId, new Error(`Sarvam parsing error: ${errorMessage}`));
      } else {
        // For non-error parsing issues, just log and continue
        this.logger.warn(`Non-error parsing issue, continuing session`);
      }
    }
  }

  private handleSessionError(sessionId: string, error: any): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    this.logger.error(`Sarvam session ${sessionId} error:`, error);
    
    // Notify client via WebSocket gateway if available
    if (this.webSocketGateway) {
      // Find the client ID associated with this session
      const clientId = this.findClientIdBySessionId(sessionId);
      if (clientId) {
        this.webSocketGateway.server.to(clientId).emit('error', {
          type: 'error',
          data: { message: 'Transcription service error: ' + error.message },
          timestamp: Date.now(),
        });
      }
    }

    // Close the session
    if (session.ws.readyState === WebSocket.OPEN) {
      session.ws.close();
    }
    this.sessions.delete(sessionId);
  }

  private handleSessionClose(sessionId: string, code: number, reason: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    this.logger.log(`Sarvam session ${sessionId} closed: ${code} - ${reason}`);
    
    // Clean up session immediately
    this.sessions.delete(sessionId);
    
    // Notify client about connection loss if it wasn't a normal closure
    if (code !== 1000 && this.webSocketGateway) {
      const clientId = this.findClientIdBySessionId(sessionId);
      if (clientId) {
        this.webSocketGateway.server.to(clientId).emit('error', {
          type: 'connection_lost',
          data: { message: 'Speech recognition service connection lost' },
          timestamp: Date.now(),
        });
      }
    }
  }

  private findClientIdBySessionId(sessionId: string): string | null {
    // Use streaming service's session mapping if available
    if (this.streamingService) {
      return this.streamingService.findClientIdBySessionId(sessionId);
    }
    
    // Fallback: try to find from webSocketGateway if it has the method
    if (this.webSocketGateway?.findClientIdBySessionId) {
      return this.webSocketGateway.findClientIdBySessionId(sessionId);
    }
    
    return null;
  }

  // Get active session count
  getActiveSessionCount(): number {
    return this.sessions.size;
  }

  // Check if session is active
  isSessionActive(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    return session?.isActive || false;
  }

  }
