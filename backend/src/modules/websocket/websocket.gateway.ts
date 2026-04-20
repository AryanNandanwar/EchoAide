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
import { type ParsedNote } from '../sse/schemas/parsed-note.schema';

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
    @MessageBody() data: { sessionId: string },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      this.logger.log(`🛑 Stopping recording session: ${data.sessionId} for client: ${client.id}`);
      
      const result = await this.streamingService.stopRecording(client.id, data.sessionId);
      this.logger.log(`✅ Recording stopped successfully for session: ${data.sessionId}`);
      this.logger.log(`🏥 Clinical note generation should be triggered now...`);
      
      client.emit('recording_status', {
        type: 'recording_status',
        data: { status: 'stopped', sessionId: data.sessionId },
        timestamp: Date.now(),
      });

      return result;
    } catch (error) {
      this.logger.error(`❌ Failed to stop recording: ${error.message}`);
      
      client.emit('error', {
        type: 'error',
        data: { message: 'Failed to stop recording: ' + error.message },
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
      
      // Forward to streaming service for Sarvam processing
      await this.streamingService.processAudioChunk(client.id, audioBuffer.buffer, data.timestamp);
      
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
