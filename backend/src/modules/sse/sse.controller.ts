import { Controller, Get, Param, Res, Logger } from '@nestjs/common';
import { Response } from 'express';
import { SseService } from './sse.service';
import { Observable, Subscriber } from 'rxjs';
import type { Response as ExpressResponse } from 'express';

@Controller('sse')
export class SseController {
  private readonly logger = new Logger(SseController.name);

  constructor(private readonly sseService: SseService) {}

  @Get('note/:sessionId')
  async subscribeToNoteUpdates(
    @Param('sessionId') sessionId: string,
    @Res() response: ExpressResponse,
  ): Promise<void> {
    this.logger.log(`Client subscribed to note updates for session: ${sessionId}`);

    // Set SSE headers
    response.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control',
    });

    // Create an observable for this session
    const noteObservable = new Observable<{ type: string; data: any }>((subscriber) => {
      // Add this subscriber to the session
      this.sseService.addSubscriber(sessionId, subscriber);

      // Send initial connection confirmation
      subscriber.next({ type: 'connected', data: { sessionId } });

      // Cleanup when client disconnects
      response.on('close', () => {
        this.logger.log(`Client disconnected from session: ${sessionId}`);
        this.sseService.removeSubscriber(sessionId, subscriber);
        subscriber.complete();
      });
    });

    // Subscribe to events and send them to client
    noteObservable.subscribe({
      next: (event) => {
        this.logger.debug(`Sending SSE event for session ${sessionId}:`, event.type);
        const eventData = JSON.stringify(event);
        this.logger.debug(`SSE data being sent:`, eventData);
        response.write(`data: ${eventData}\n\n`);
      },
      error: (error) => {
        this.logger.error(`SSE error for session ${sessionId}:`, error);
        response.write(`data: ${JSON.stringify({ type: 'error', data: { message: error.message } })}\n\n`);
      },
      complete: () => {
        this.logger.log(`SSE stream completed for session: ${sessionId}`);
        response.end();
      },
    });
  }

  @Get('test')
  testSse(): Observable<{ type: string; data: any }> {
    return new Observable((subscriber) => {
      subscriber.next({ type: 'test', data: { message: 'SSE is working!' } });
      setTimeout(() => {
        subscriber.next({ type: 'test', data: { message: 'Another test message!' } });
        subscriber.complete();
      }, 2000);
    });
  }
}
