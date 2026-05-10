import { io, Socket } from 'socket.io-client';

export interface AudioChunkData {
  data: string;
  timestamp: number;
}

export interface TranscriptData {
  text: string;
  timestamp: number;
  isPartial?: boolean;
}

export interface NoteUpdateData {
  section: string;
  content: string;
  timestamp: number;
}

export class SocketIOService {
  private socket: Socket | null = null;
  private url: string;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private isConnecting = false;
  private messageQueue: any[] = [];
  private onMessageCallback?: (message: any) => void;
  private onStatusCallback?: (status: 'connecting' | 'connected' | 'disconnected' | 'error') => void;

  constructor(url: string) {
    this.url = url;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.socket && this.socket.connected) {
        resolve();
        return;
      }

      if (this.isConnecting) {
        reject(new Error('Connection already in progress'));
        return;
      }

      this.isConnecting = true;
      this.onStatusCallback?.('connecting');

      try {
        console.log('Attempting to connect to Socket.IO at:', this.url);
        this.socket = io(this.url, {
          transports: ['websocket', 'polling'],
          timeout: 10000,
          reconnection: false, // We'll handle reconnection ourselves
          path: '/socket.io/'
        });
        
        this.socket.on('connect', () => {
          console.log('Socket.IO connected successfully');
          this.isConnecting = false;
          this.reconnectAttempts = 0;
          this.onStatusCallback?.('connected');
          
          // Send queued messages
          while (this.messageQueue.length > 0) {
            const message = this.messageQueue.shift();
            if (message) {
              this.sendMessage(message.event, message.data);
            }
          }
          
          resolve();
        });

        this.socket.on('connect_error', (error) => {
          console.error('Socket.IO connection error:', error);
          this.isConnecting = false;
          this.onStatusCallback?.('error');
          reject(error);
        });

        this.socket.on('disconnect', (reason) => {
          this.isConnecting = false;
          this.onStatusCallback?.('disconnected');
          
          if (reason !== 'io client disconnect' && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.scheduleReconnect();
          }
        });

        // Handle all incoming messages
        this.socket.onAny((eventName, data) => {
          if (this.onMessageCallback) {
            this.onMessageCallback({
              type: eventName,
              data,
              timestamp: Date.now()
            });
          }
        });

      } catch (error) {
        this.isConnecting = false;
        reject(error);
      }
    });
  }

  private scheduleReconnect() {
    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
    
    setTimeout(() => {
      this.connect().catch(error => {
        console.error('Reconnection failed:', error);
      });
    }, delay);
  }

  sendMessage(event: string, data: any) {
    console.log("📤 Sending WebSocket message:", { event, data });
    if (this.socket && this.socket.connected) {
      this.socket.emit(event, data);
      console.log("✅ Message sent successfully");
    } else {
      console.log("⏳ Message queued - not connected yet");
      // Queue message for when connection is established
      this.messageQueue.push({ event, data });
    }
  }

  sendAudioChunk(audioData: string, timestamp: number) {
    console.log("🎤 Frontend: sendAudioChunk called:", {
      audioDataLength: audioData.length,
      timestamp,
      audioDataType: typeof audioData
    });
    
    console.log("🎤 Frontend: Sending Base64 WAV directly:", {
      base64Length: audioData.length,
      base64Preview: audioData.substring(0, 50) + '...'
    });
    
    this.sendMessage('audio_chunk', {
      data: audioData,
      timestamp
    });
  }

  startRecording(sessionId: string) {
    console.log("🎤 WebSocket: startRecording called with session:", sessionId);
    this.sendMessage('start_recording', { sessionId });
  }

  stopRecording(sessionId: string, doctorId: string, noteId?: string) {
    // Debug: Log the raw parameters received
    console.log("🛑 WebSocket: stopRecording raw parameters:", { sessionId, doctorId, noteId });
    
    // Use the provided noteId or generate a new one if not provided
    const finalNoteId = noteId || crypto.randomUUID();
    console.log("🛑 WebSocket: stopRecording called with session:", sessionId, {
      noteId: finalNoteId,
      doctorId,
      wasNoteIdProvided: !!noteId
    });
    this.sendMessage('stop_recording', { 
      sessionId, 
      noteId: finalNoteId, 
      doctorId 
    });
    return finalNoteId; // Return the noteId for frontend to track
  }

  onMessage(callback: (message: any) => void) {
    this.onMessageCallback = callback;
  }

  onStatus(callback: (status: 'connecting' | 'connected' | 'disconnected' | 'error') => void) {
    this.onStatusCallback = callback;
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.messageQueue = [];
  }

  isConnected(): boolean {
    return this.socket !== null && this.socket.connected;
  }
}
