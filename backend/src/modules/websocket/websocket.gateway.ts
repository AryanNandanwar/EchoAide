import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { StreamingService } from '../streaming/streaming.service';
import { type ParsedNote } from '../streaming/schemas/parsed-note.schema';

@WebSocketGateway({
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: true,
  },
  transports: ['websocket', 'polling'],
  namespace: '/',
})
export class StreamingWebSocketGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private logger: Logger = new Logger('WebSocketGateway');

  constructor(private readonly streamingService: StreamingService) {
    // Set the gateway reference in streaming service for two-way communication
    this.streamingService.setWebSocketGateway(this);
  }

  afterInit(server: Server) {
    this.logger.log('WebSocket Gateway initialized');
  }

  handleConnection(client: Socket, ...args: any[]) {
    this.logger.log(`Client connected: ${client.id}`);
    client.emit('status', { type: 'connected', message: 'Connected to streaming service' });
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
    
    // Clean up any active streaming sessions for this client
    this.streamingService.handleClientDisconnect(client.id);
  }

  @SubscribeMessage('start_recording')
  async handleStartRecording(
    @MessageBody() data: { sessionId: string },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      this.logger.log(`🎤 Starting recording session: ${data.sessionId} for client: ${client.id}`);
      
      const result = await this.streamingService.startRecording(client.id, data.sessionId);
      this.logger.log(`✅ Recording started successfully for session: ${data.sessionId}`);
      
      client.emit('recording_status', {
        type: 'recording_status',
        data: { status: 'started', sessionId: data.sessionId },
        timestamp: Date.now(),
      });

      return result;
    } catch (error) {
      this.logger.error(`❌ Failed to start recording: ${error.message}`);
      
      client.emit('error', {
        type: 'error',
        data: { message: 'Failed to start recording: ' + error.message },
        timestamp: Date.now(),
      });
      
      throw error;
    }
  }

  @SubscribeMessage('stop_recording')
  async handleStopRecording(
    @MessageBody() data: {
      sessionId: string;
      noteId?: string;
      doctorId?: string;
      patientId?: string;
      intakeId?: string;
      patientDetails?: Record<string, string>;
    },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      this.logger.log(`Stopping recording session: ${data.sessionId} for client: ${client.id}`);
      this.logger.log(`Additional data:`, {
        noteId: data.noteId,
        doctorId: data.doctorId,
        patientId: data.patientId,
        intakeId: data.intakeId,
      });
      
      const result = await this.streamingService.stopRecording(
        client.id,
        data.sessionId,
        data.noteId || '',
        data.doctorId,
        data.patientId,
        data.intakeId,
        data.patientDetails,
      );

      if (result.outcome === 'note_created') {
        this.logger.log(`Recording stopped and clinical note stored for session: ${data.sessionId}`);
        client.emit('recording_status', {
          type: 'recording_status',
          data: {
            status: 'stopped',
            sessionId: data.sessionId,
            noteId: result.noteId,
          },
          timestamp: Date.now(),
        });
      } else if (result.outcome === 'note_skipped') {
        this.logger.log(
          `Recording stopped without note for session ${data.sessionId}: ${result.reason}`,
        );
        client.emit('recording_status', {
          type: 'recording_status',
          data: {
            status: 'note_skipped',
            sessionId: data.sessionId,
            noteId: result.noteId,
            reason: result.reason,
          },
          timestamp: Date.now(),
        });
      } else {
        this.logger.error(
          `Recording stopped but note generation failed for session ${data.sessionId}: ${result.reason}`,
        );
        client.emit('recording_status', {
          type: 'recording_status',
          data: {
            status: 'note_failed',
            sessionId: data.sessionId,
            noteId: result.noteId,
            reason: result.reason,
          },
          timestamp: Date.now(),
        });
      }

      return result;
    } catch (error) {
      this.logger.error(`Failed to stop recording: ${error.message}`);
      
      client.emit('error', {
        type: 'error',
        data: { message: 'Failed to stop recording: ' + error.message },
        timestamp: Date.now(),
      });
      
      throw error;
    }
  }

  @SubscribeMessage('pause_recording')
  async handlePauseRecording(
    @MessageBody() data: { sessionId: string },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      await this.streamingService.pauseRecording(client.id, data.sessionId);
      client.emit('recording_status', {
        type: 'recording_status',
        data: { status: 'paused', sessionId: data.sessionId },
        timestamp: Date.now(),
      });
    } catch (error) {
      this.logger.error(`Failed to pause recording: ${error.message}`);
      client.emit('error', {
        type: 'error',
        data: { message: 'Failed to pause recording: ' + error.message },
        timestamp: Date.now(),
      });
      throw error;
    }
  }

  @SubscribeMessage('resume_recording')
  async handleResumeRecording(
    @MessageBody() data: { sessionId: string },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      await this.streamingService.resumeRecording(client.id, data.sessionId);
      client.emit('recording_status', {
        type: 'recording_status',
        data: { status: 'resumed', sessionId: data.sessionId },
        timestamp: Date.now(),
      });
    } catch (error) {
      this.logger.error(`Failed to resume recording: ${error.message}`);
      client.emit('error', {
        type: 'error',
        data: { message: 'Failed to resume recording: ' + error.message },
        timestamp: Date.now(),
      });
      throw error;
    }
  }

  @SubscribeMessage('cancel_recording')
  async handleCancelRecording(
    @MessageBody() data: { sessionId: string },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      this.logger.log(`Cancelling recording session: ${data.sessionId} for client: ${client.id}`);

      await this.streamingService.cancelRecording(client.id, data.sessionId);

      client.emit('recording_status', {
        type: 'recording_status',
        data: { status: 'cancelled', sessionId: data.sessionId },
        timestamp: Date.now(),
      });
    } catch (error) {
      this.logger.error(`Failed to cancel recording: ${error.message}`);

      client.emit('error', {
        type: 'error',
        data: { message: 'Failed to cancel recording: ' + error.message },
        timestamp: Date.now(),
      });

      throw error;
    }
  }

  @SubscribeMessage('audio_chunk')
  async handleAudioChunk(
    @MessageBody() data: { data: string; timestamp: number },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      console.log(`📨 Gateway: Received audio chunk from ${client.id}:`, {
        timestamp: data.timestamp,
        dataLength: data.data?.length || 0,
        dataType: typeof data.data,
        dataPreview: data.data?.substring(0, 50) + '...' || 'NULL'
      });
      
      // Convert base64 audio data back to binary buffer (WAV format with headers)
      const audioBuffer = Buffer.from(data.data, 'base64');
      
      console.log(`🔄 Gateway: Converted to buffer:`, {
        bufferLength: audioBuffer.length,
        bufferType: audioBuffer.constructor.name,
        firstBytes: Array.from(audioBuffer.subarray(0, 10))
      });
      
      // Slice the exact byte range: Buffer.from() may return a view into Node's
      // shared buffer pool, so audioBuffer.buffer can contain unrelated bytes.
      const audioBytes = audioBuffer.buffer.slice(
        audioBuffer.byteOffset,
        audioBuffer.byteOffset + audioBuffer.byteLength,
      );

      // Forward to streaming service for transcription processing
      await this.streamingService.processAudioChunk(client.id, audioBytes, data.timestamp);
      
    } catch (error) {
      console.error(`❌ Gateway: Failed to process audio chunk:`, error);
      this.logger.error(`Failed to process audio chunk: ${error.message}`);
      
      client.emit('error', {
        type: 'error',
        data: { message: 'Failed to process audio: ' + error.message },
        timestamp: Date.now(),
      });
    }
  }

  // Helper method to send transcript updates to specific client
  sendTranscriptToClient(clientId: string, transcript: string, isPartial: boolean) {
    console.log(`📝 Gateway: sendTranscriptToClient called for ${clientId}, transcript: "${transcript.substring(0, 50)}...", isPartial: ${isPartial}`);
    const messageType = isPartial ? 'partial_transcript' : 'final_transcript';
    
    this.server.to(clientId).emit(messageType, {
      type: messageType,
      data: { text: transcript, timestamp: Date.now(), isPartial },
      timestamp: Date.now(),
    });
  }

  // Helper method to send note updates to specific client
  sendNoteUpdateToClient(clientId: string, section: string, content: string) {
    console.log(`🏥 Gateway: sendNoteUpdateToClient called for ${clientId}, section: ${section}, content: "${content.substring(0, 50)}..."`);
    this.server.to(clientId).emit('note_update', {
      type: 'note_update',
      data: {
        section,
        content,
        timestamp: Date.now(),
      },
      timestamp: Date.now(),
    });
  }

  // Helper method to send final complete note to specific client
  sendFinalNoteToClient(clientId: string, finalNote: ParsedNote) {
    console.log(`📝 Gateway: sendFinalNoteToClient called for ${clientId}, sections: ${Object.keys(finalNote).join(', ')}`);
    console.log(`📨 Final note data being sent:`, JSON.stringify(finalNote, null, 2));
    this.server.to(clientId).emit('final_note', {
      type: 'final_note',
      data: finalNote,
      timestamp: Date.now(),
    });
    console.log(`✅ Final note message sent successfully`);
  }

  // Helper method to add client to specific room (for session management)
  addClientToRoom(clientId: string, sessionId: string) {
    this.server.in(clientId).socketsJoin(sessionId);
  }

  // Helper method to remove client from room
  removeClientFromRoom(clientId: string, sessionId: string) {
    this.server.in(clientId).socketsLeave(sessionId);
  }
}
