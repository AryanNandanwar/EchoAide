import { Injectable, Logger } from '@nestjs/common';
import { Subscriber } from 'rxjs';
import { ParsedNoteSchema, type ParsedNote } from './schemas/parsed-note.schema';

interface SseSubscriber {
  sessionId: string;
  subscriber: Subscriber<{ type: string; data: any }>;
}

@Injectable()
export class SseService {
  private readonly logger = new Logger(SseService.name);
  private readonly subscribers = new Map<string, Subscriber<{ type: string; data: any }>[]>();

  addSubscriber(sessionId: string, subscriber: Subscriber<{ type: string; data: any }>): void {
    if (!this.subscribers.has(sessionId)) {
      this.subscribers.set(sessionId, []);
    }
    this.subscribers.get(sessionId)!.push(subscriber);
    this.logger.log(`Added subscriber for session ${sessionId}. Total subscribers: ${this.subscribers.get(sessionId)!.length}`);
  }

  removeSubscriber(sessionId: string, subscriber: Subscriber<{ type: string; data: any }>): void {
    const sessionSubscribers = this.subscribers.get(sessionId);
    if (sessionSubscribers) {
      const index = sessionSubscribers.indexOf(subscriber);
      if (index > -1) {
        sessionSubscribers.splice(index, 1);
        this.logger.log(`Removed subscriber for session ${sessionId}. Remaining: ${sessionSubscribers.length}`);
      }
      if (sessionSubscribers.length === 0) {
        this.subscribers.delete(sessionId);
        this.logger.log(`No more subscribers for session ${sessionId}, cleaned up`);
      }
    }
  }

  sendFinalNote(sessionId: string, finalNote: ParsedNote): void {
    this.logger.log(`Sending final note for session ${sessionId}`);
    this.logger.log(`Available sessions: ${Array.from(this.subscribers.keys()).join(', ')}`);
    
    // Validate the final note using Zod schema
    const validationResult = ParsedNoteSchema.safeParse(finalNote);
    if (!validationResult.success) {
      this.logger.error(`Invalid final note format for session ${sessionId}:`, validationResult.error);
      this.sendError(sessionId, `Invalid clinical note format: ${validationResult.error.message}`);
      return;
    }
    
    const validatedNote = validationResult.data;
    const sessionSubscribers = this.subscribers.get(sessionId);
    if (sessionSubscribers && sessionSubscribers.length > 0) {
      sessionSubscribers.forEach(subscriber => {
        subscriber.next({ type: 'final_note', data: validatedNote });
      });
      this.logger.log(`Final note sent to ${sessionSubscribers.length} subscribers for session ${sessionId}`);
    } else {
      this.logger.warn(`No subscribers found for session ${sessionId}, final note not sent`);
    }
  }

  sendNoteUpdate(sessionId: string, section: string, content: string): void {
    this.logger.log(`Sending note update for session ${sessionId}, section: ${section}`);
    const sessionSubscribers = this.subscribers.get(sessionId);
    if (sessionSubscribers && sessionSubscribers.length > 0) {
      sessionSubscribers.forEach(subscriber => {
        subscriber.next({ type: 'note_update', data: { section, content } });
      });
      this.logger.log(`Note update sent to ${sessionSubscribers.length} subscribers for session ${sessionId}`);
    } else {
      this.logger.warn(`No subscribers found for session ${sessionId}, note update not sent`);
    }
  }

  sendError(sessionId: string, error: string): void {
    this.logger.log(`Sending error for session ${sessionId}: ${error}`);
    const sessionSubscribers = this.subscribers.get(sessionId);
    if (sessionSubscribers && sessionSubscribers.length > 0) {
      sessionSubscribers.forEach(subscriber => {
        subscriber.next({ type: 'error', data: { message: error } });
      });
    }
  }

  getSubscriberCount(sessionId: string): number {
    const sessionSubscribers = this.subscribers.get(sessionId);
    return sessionSubscribers ? sessionSubscribers.length : 0;
  }

  getTotalSubscriberCount(): number {
    let total = 0;
    this.subscribers.forEach(subscribers => {
      total += subscribers.length;
    });
    return total;
  }
}
