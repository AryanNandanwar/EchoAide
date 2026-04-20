import { useState, useEffect, useCallback, useRef } from 'react';
import { SseService } from '../services/sse-service';
import { type ParsedNote } from '../types/clinical-note';

export interface SseState {
  isConnected: boolean;
  isConnecting: boolean;
  clinicalNote: ParsedNote;
  error: string | null;
  sessionId: string;
}

export interface UseSseTranscriptionOptions {
  baseUrl?: string;
  onNoteUpdate?: (note: ParsedNote) => void;
  onError?: (error: string) => void;
}

export const useSseTranscription = ({
  baseUrl = 'http://localhost:3000',
  onNoteUpdate,
  onError
}: UseSseTranscriptionOptions = {}) => {
  const [state, setState] = useState<SseState>({
    isConnected: false,
    isConnecting: false,
    clinicalNote: {},
    error: null,
    sessionId: ''
  });

  const sseServiceRef = useRef(new SseService(baseUrl));

  const connect = useCallback(async (sessionId: string) => {
    console.log('🔗 SSE: Attempting to connect with session ID:', sessionId);
    setState(prev => ({
      ...prev,
      isConnecting: true,
      error: null,
      sessionId
    }));

    try {
      await sseServiceRef.current.connect(sessionId);
      
      setState(prev => ({
        ...prev,
        isConnected: true,
        isConnecting: false,
        error: null
      }));

      console.log('✅ SSE connected successfully for session:', sessionId);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to connect to SSE';
      setState(prev => ({
        ...prev,
        isConnected: false,
        isConnecting: false,
        error: errorMessage
      }));
      onError?.(errorMessage);
    }
  }, [baseUrl, onError]);

  const disconnect = useCallback(() => {
    sseServiceRef.current.disconnect();
    setState(prev => ({
      ...prev,
      isConnected: false,
      isConnecting: false,
      error: null,
      clinicalNote: {}
    }));
  }, []);

  // Set up event handlers
  useEffect(() => {
    sseServiceRef.current.onEvent((event: any) => {
      console.log('SSE event received:', event);
      
      switch (event.type) {
        case 'final_note':
          console.log('Final note received via SSE Hook:', event.data);
          setState(prev => ({
            ...prev,
            clinicalNote: event.data
          }));
          onNoteUpdate?.(event.data);
          break;
        
        case 'note_update':
          console.log('Note update received via SSE:', event.data);
          // Handle live updates if needed
          break;
        
        case 'connected':
          console.log('SSE connection confirmed');
          break;
        
        case 'error':
          console.error('SSE error:', event.data);
          setState(prev => ({
            ...prev,
            error: event.data.message
          }));
          onError?.(event.data.message);
          break;
        
        default:
          console.log('Unknown SSE event type:', event.type, event.data);
      }
    });

    sseServiceRef.current.onError((error: any) => {
      console.error('SSE connection error:', error);
      setState(prev => ({
        ...prev,
        error: error
      }));
      onError?.(error);
    });
  }, [onNoteUpdate, onError]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      sseServiceRef.current.disconnect();
    };
  }, []);

  return {
    ...state,
    connect,
    disconnect,
    isConnected: () => sseServiceRef.current.isConnected()
  };
};
