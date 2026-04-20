export interface SseEvent {
  type: string;
  data: any;
}

export class SseService {
  private eventSource: EventSource | null = null;
  private sessionId: string | null = null;
  private onEventCallback?: (event: SseEvent) => void;
  private onErrorCallback?: (error: string) => void;
  private baseUrl: string;

  constructor(baseUrl: string = 'http://localhost:3000') {
    this.baseUrl = baseUrl;
  }

  connect(sessionId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.eventSource) {
        this.disconnect();
      }

      this.sessionId = sessionId;
      const url = `${this.baseUrl}/api/sse/note/${sessionId}`;
      
      console.log(`Connecting to SSE endpoint: ${url}`);
      
      this.eventSource = new EventSource(url);

      this.eventSource.onopen = () => {
        console.log('SSE connection opened');
        resolve();
      };

      this.eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('SSE message received:', data);
          this.onEventCallback?.(data);
        } catch (error) {
          console.error('Failed to parse SSE message:', error);
        }
      };

      this.eventSource.onerror = (error) => {
        console.error('SSE connection error:', error);
        this.onErrorCallback?.('SSE connection error');
        reject(error);
      };
    });
  }

  disconnect(): void {
    if (this.eventSource) {
      console.log('Closing SSE connection');
      this.eventSource.close();
      this.eventSource = null;
    }
    this.sessionId = null;
  }

  isConnected(): boolean {
    return this.eventSource !== null && this.eventSource.readyState === EventSource.OPEN;
  }

  onEvent(callback: (event: SseEvent) => void): void {
    this.onEventCallback = callback;
  }

  onError(callback: (error: string) => void): void {
    this.onErrorCallback = callback;
  }

  getSessionId(): string | null {
    return this.sessionId;
  }
}
