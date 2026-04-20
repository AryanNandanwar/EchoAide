import { Injectable, Logger } from '@nestjs/common';
import WebSocket from 'ws';

export interface SonioxConfig {
  apiKey: string;
  model: string;
  audioFormat: string;
  sampleRate: number;
  numChannels: number;
  enableSpeakerDiarization: boolean;
  enableLanguageIdentification: boolean;
  enableEndpointDetection: boolean;
  maxEndpointDelayMs: number;
  translation?: {
    type: 'one_way' | 'two_way';
    target_language?: string;
    language_a?: string;
    language_b?: string;
  };
}

export interface SonioxSession {
  sessionId: string;
  ws: WebSocket;
  onTranscript: (transcript: string, isPartial: boolean) => void;
  isActive: boolean;
  configured: boolean;
}

@Injectable()
export class SonioxClientService {
  private readonly logger = new Logger(SonioxClientService.name);
  private readonly sessions = new Map<string, SonioxSession>();
  private readonly config: SonioxConfig;
  private webSocketGateway: any;
  private streamingService: any;

  constructor() {
    // Initialize Soniox configuration from environment variables
    this.config = {
      apiKey: process.env.SONIOX_API_KEY || '',
      model: process.env.SONIOX_MODEL || 'stt-rt-preview',
      audioFormat: process.env.SONIOX_AUDIO_FORMAT || 'pcm_s16le',
      sampleRate: parseInt(process.env.SONIOX_SAMPLE_RATE || '16000'),
      numChannels: parseInt(process.env.SONIOX_NUM_CHANNELS || '1'),
      enableSpeakerDiarization: process.env.SONIOX_ENABLE_SPEAKER_DIARIZATION === 'true',
      enableLanguageIdentification: process.env.SONIOX_ENABLE_LANGUAGE_IDENTIFICATION === 'true',
      enableEndpointDetection: process.env.SONIOX_ENABLE_ENDPOINT_DETECTION !== 'false',
      maxEndpointDelayMs: parseInt(process.env.SONIOX_MAX_ENDPOINT_DELAY_MS || '2000'),
    };

    if (process.env.SONIOX_ENABLE_TRANSLATION === 'true') {
      const translationType = process.env.SONIOX_TRANSLATION_TYPE || 'one_way';
      this.config.translation = {
        type: translationType as 'one_way' | 'two_way',
      };
      if (translationType === 'one_way') {
        this.config.translation.target_language = process.env.SONIOX_TRANSLATION_TARGET_LANGUAGE || 'en';
      } else {
        this.config.translation.language_a = process.env.SONIOX_TRANSLATION_LANGUAGE_A || 'en';
        this.config.translation.language_b = process.env.SONIOX_TRANSLATION_LANGUAGE_B || 'es';
      }
    }

    if (!this.config.apiKey) {
      this.logger.warn('Soniox API key not configured. Please set SONIOX_API_KEY environment variable.');
    }
  }

  setWebSocketGateway(gateway: any) {
    this.webSocketGateway = gateway;
    this.streamingService = gateway?.streamingService;
  }

  async startSession(
    sessionId: string,
    onTranscript: (transcript: string, isPartial: boolean) => void,
  ): Promise<void> {
    console.log(`🎤 SonioxClient: startSession called for ${sessionId}`);
    
    if (this.sessions.has(sessionId)) {
      console.error(`❌ Session ${sessionId} already exists`);
      throw new Error(`Session ${sessionId} already exists`);
    }

    if (!this.config.apiKey) {
      console.error(`❌ Soniox API key not configured`);
      throw new Error('Soniox API key not configured');
    }

    console.log(`✅ API key configured, starting WebSocket connection to Soniox`);
    this.logger.log(`Starting Soniox session: ${sessionId}`);

    try {
      // Create WebSocket connection to Soniox
      const wsUrl = 'wss://stt-rt.soniox.com/transcribe-websocket';
      
      console.log(`🔌 Connecting to ${wsUrl}...`);
      console.log(`@ Connection config:`, {
        'api_key': this.config.apiKey ? 'CONFIGURED' : 'MISSING',
        'model': this.config.model,
        'audio_format': this.config.audioFormat,
        'sample_rate': this.config.sampleRate,
        'num_channels': this.config.numChannels,
        'enable_speaker_diarization': this.config.enableSpeakerDiarization,
        'enable_language_identification': this.config.enableLanguageIdentification,
        'enable_endpoint_detection': this.config.enableEndpointDetection,
        'max_endpoint_delay_ms': this.config.maxEndpointDelayMs,
        'translation': this.config.translation
      });
      
      const ws = new WebSocket(wsUrl);

      const session: SonioxSession = {
        sessionId,
        ws,
        onTranscript,
        isActive: false,
        configured: false
      };

      this.sessions.set(sessionId, session);

      // Set up WebSocket event handlers
      ws.on('open', () => {
        console.log(`@ Soniox WebSocket opened for session ${sessionId}`);
        this.logger.log(`Soniox WebSocket connected for session: ${sessionId}`);

        // Send configuration message
        const configMessage: any = {
          api_key: this.config.apiKey,
          model: this.config.model,
          audio_format: this.config.audioFormat,
          sample_rate: this.config.sampleRate,
          num_channels: this.config.numChannels,
          enable_speaker_diarization: this.config.enableSpeakerDiarization,
          enable_language_identification: this.config.enableLanguageIdentification,
          enable_endpoint_detection: this.config.enableEndpointDetection,
          max_endpoint_delay_ms: this.config.maxEndpointDelayMs
        };

        // Only add translation if configured properly
        if (this.config.translation) {
          configMessage.translation = this.config.translation;
        }

        console.log(`@ Sending configuration to Soniox for session ${sessionId}`);
        console.log(`@ Configuration message:`, JSON.stringify(configMessage, null, 2));
        ws.send(JSON.stringify(configMessage));
        
        // Mark as active immediately, but configured only after we get a response
        session.isActive = true;
        console.log(`@ Session ${sessionId} marked as active, waiting for configuration confirmation`);
      });

      ws.on('message', (data: WebSocket.Data) => {
        let dataBuffer: Buffer;
        if (Buffer.isBuffer(data)) {
          dataBuffer = data;
        } else if (data instanceof ArrayBuffer) {
          dataBuffer = Buffer.from(data);
        } else {
          dataBuffer = Buffer.from(String(data));
        }
        
        console.log(`📨 Soniox message received for ${sessionId}:`, {
          sessionId: sessionId.substring(0, 10) + '...',
          dataType: typeof data,
          dataLength: dataBuffer.length,
          isBinary: Buffer.isBuffer(data)
        });
        
        this.handleSonioxMessage(sessionId, data);
      });

      ws.on('error', (error) => {
        console.error(`❌ Soniox WebSocket error for session ${sessionId}:`, error);
        this.logger.error(`Soniox WebSocket error for session ${sessionId}:`, error);
        
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
        console.log(`@ Soniox WebSocket closed for session ${sessionId}: ${code} - ${reason}`);
        this.logger.log(`Soniox WebSocket closed for session ${sessionId}: ${code} - ${reason}`);
        session.isActive = false;
        
        // Don't immediately delete session on normal closure (1000) - let it finish processing
        if (code === 1000) {
          console.log(`@ Normal closure detected, keeping session for cleanup`);
          setTimeout(() => {
            this.handleSessionClose(sessionId, code, reason?.toString() || 'Normal closure');
          }, 1000);
        } else {
          this.handleSessionClose(sessionId, code, reason?.toString() || 'Unknown reason');
        }
      });

      // Add connection timeout
      setTimeout(() => {
        if (!session.isActive && ws.readyState === WebSocket.CONNECTING) {
          console.error(` Soniox WebSocket connection timeout for session ${sessionId}`);
          console.error(`❌ Soniox WebSocket connection timeout for session ${sessionId}`);
          this.logger.error(`Soniox WebSocket connection timeout for session ${sessionId}`);
          ws.terminate();
          this.sessions.delete(sessionId);
        } else if (session.isActive) {
          console.log(`✅ Soniox WebSocket connection confirmed active for session ${sessionId}`);
        }
      }, 10000); // 10 second timeout

    } catch (error) {
      console.error(`❌ Failed to create Soniox WebSocket: ${error.message}`);
      this.logger.error(`Failed to start Soniox session: ${error.message}`);
      throw error;
    }
  }

  async stopSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      this.logger.warn(`Session ${sessionId} not found`);
      return;
    }

    this.logger.log(`Stopping Soniox session: ${sessionId}`);

    try {
      if (session.ws.readyState === WebSocket.OPEN) {
        // Send empty frame to gracefully close the session
        session.ws.send(Buffer.alloc(0));
        
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
    console.log(`@ Sending audio chunk to Soniox for session ${sessionId}, size: ${audioArrayBuffer.byteLength}`);
    
    const session = this.sessions.get(sessionId);
    
    if (!session) {
      console.warn(`@ Cannot send audio chunk - session ${sessionId} not found`);
      this.logger.warn(`Session ${sessionId} not found for audio chunk`);
      return;
    }

    // Wait a bit for session to be configured if it's not yet configured
    if (!session.configured) {
      console.log(`@ Session ${sessionId} not yet configured, waiting...`);
      let attempts = 0;
      while (!session.configured && attempts < 50) { // Wait up to 5 seconds
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
      }
      
      if (!session.configured) {
        console.warn(`@ Session ${sessionId} still not configured after waiting, skipping audio chunk`);
        return;
      }
    }

    if (!session.isActive) {
      console.warn(`@ Cannot send audio chunk - session ${sessionId} not active`);
      this.logger.warn(`Session ${sessionId} not active for audio chunk`);
      return;
    }

    if (session.ws.readyState !== WebSocket.OPEN) {
      console.warn(` Cannot send audio chunk - WebSocket not open for session ${sessionId}, state: ${session.ws.readyState}`);
      this.logger.warn(`WebSocket not open for session ${sessionId}, state: ${session.ws.readyState}`);
      return;
    }

    // Additional check: don't send completely empty buffers
    if (audioArrayBuffer.byteLength === 0) {
      console.warn(`⚠️ Skipping empty audio buffer for session ${sessionId}`);
      return;
    }

    try {
      // Send audio as binary data (Soniox expects binary WebSocket frames)
      const audioBuffer = Buffer.from(audioArrayBuffer);
      
      console.log(`🔍 Audio data:`, {
        sessionId: sessionId.substring(0, 10) + '...',
        originalSize: audioArrayBuffer.byteLength,
        sampleRate: this.config.sampleRate,
        format: this.config.audioFormat
      });
      
      console.log(`📡 Sending binary audio data to Soniox:`, { 
        sessionId: sessionId.substring(0, 10) + '...', 
        audioDataLength: audioBuffer.length,
        sampleRate: this.config.sampleRate,
        format: this.config.audioFormat
      });
      
      // Send as binary data
      session.ws.send(audioBuffer);
      console.log(`✅ Audio data sent to Soniox as binary frame`);
    } catch (error) {
      console.error(`❌ Failed to send audio chunk to Soniox: ${error.message}`);
      this.logger.error(`Failed to send audio chunk to Soniox for session ${sessionId}:`, error);
      
      // If sending fails, the connection might be broken
      if (error.message.includes('WebSocket') || error.message.includes('closed')) {
        this.logger.warn(`Connection appears broken for session ${sessionId}, cleaning up`);
        session.isActive = false;
        this.sessions.delete(sessionId);
      }
    }
  }

  private handleSonioxMessage(sessionId: string, data: WebSocket.Data): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    const dataStr = data.toString();
    
    // Log entire response from Soniox
    console.log(`📨 Soniox response for session ${sessionId}:`, dataStr);
    this.logger.log(`Soniox response for session ${sessionId}: ${dataStr}`);
    
    // Handle empty or invalid responses
    if (!dataStr || dataStr.trim().length === 0) {
      this.logger.warn(`Received empty message from Soniox for session ${sessionId}`);
      return;
    }

    try {
      const message = JSON.parse(dataStr);
      console.log(`🔍 Parsed Soniox message for session ${sessionId}:`, JSON.stringify(message, null, 2));
      
      // Mark session as configured when we receive the first valid response
      if (!session.configured) {
        session.configured = true;
        console.log(`@ Session ${sessionId} marked as configured after receiving first response from Soniox`);
        this.logger.log(`Session ${sessionId} configured successfully`);
      }
      
      // Check if this is a finished response
      if (message.finished) {
        this.logger.log(`Received finished response from Soniox for session ${sessionId}`);
        return;
      }

      // Check for error response
      if (message.error) {
        this.logger.error(`Soniox error for session ${sessionId}:`, message.error);
        this.handleSessionError(sessionId, new Error(message.error.message || 'Soniox error'));
        return;
      }

      // Process tokens
      if (message.tokens && Array.isArray(message.tokens)) {
        let transcript = '';
        let isPartial = false;
        
        // Concatenate all token texts
        for (const token of message.tokens) {
          if (token.text) {
            transcript += token.text;
          }
          
          // Check if any token is not final
          if (!token.is_final) {
            isPartial = true;
          }
        }

        if (transcript.trim().length > 0) {
          this.logger.debug(`Received ${isPartial ? 'partial' : 'final'} transcript for session ${sessionId}: ${transcript.substring(0, 100)}...`);
          
          // Call the transcript callback
          session.onTranscript(transcript.trim(), isPartial);
        }
      }

    } catch (error) {
      this.logger.error(`Failed to parse Soniox message for session ${sessionId}: ${error.message}`);
      this.logger.debug(`Raw message content:`, dataStr.substring(0, 200));
      
      // Check if the raw message contains error information
      if (dataStr.includes('error') || dataStr.includes('Error')) {
        const errorMatch = dataStr.match(/"message":"([^"]+)"/);
        const errorMessage = errorMatch ? errorMatch[1] : 'Unknown Soniox parsing error';
        
        this.logger.warn(`Extracted error from raw message: ${errorMessage}`);
        this.handleSessionError(sessionId, new Error(`Soniox parsing error: ${errorMessage}`));
      }
    }
  }

  private handleSessionError(sessionId: string, error: any): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    this.logger.error(`Soniox session ${sessionId} error:`, error);
    
    // Notify client via WebSocket gateway if available
    if (this.webSocketGateway) {
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

    this.logger.log(`Soniox session ${sessionId} closed: ${code} - ${reason}`);
    
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
