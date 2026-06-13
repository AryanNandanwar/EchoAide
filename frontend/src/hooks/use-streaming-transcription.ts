import { useState, useEffect, useRef, useCallback } from 'react';
import { SocketIOService } from '../services/websocket-service';
import { parseRecordingStatusMessage } from '../utils/recording-status';

export interface StreamingState {
  isRecording: boolean;
  isPaused: boolean;
  isConnecting: boolean;
  isConnected: boolean;
  error: string | null;
  sessionId: string;
}

export interface NoteGenerationSkippedPayload {
  noteId?: string;
  reason: string;
}

export interface UseStreamingTranscriptionOptions {
  websocketUrl: string;
  onError?: (error: string) => void;
  onSessionStart?: (sessionId: string) => void;
  onSessionEnd?: () => void;
  onNoteGenerationSkipped?: (payload: NoteGenerationSkippedPayload) => void;
  onNoteGenerationFailed?: (payload: NoteGenerationSkippedPayload) => void;
}

export interface StopRecordingOptions {
  patientId?: string;
  intakeId?: string;
  patientDetails?: Record<string, string>;
}

export const useStreamingTranscription = ({
  websocketUrl,
  onError,
  onSessionStart,
  onSessionEnd,
  onNoteGenerationSkipped,
  onNoteGenerationFailed,
}: UseStreamingTranscriptionOptions) => {
  const [state, setState] = useState<StreamingState>({
    isRecording: false,
    isPaused: false,
    isConnecting: false,
    isConnected: false,
    error: null,
    sessionId: ''
  });

  const wsRef = useRef<SocketIOService | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sessionIdRef = useRef<string | null>('');
  const isPausedRef = useRef(false);
  const onNoteGenerationSkippedRef = useRef(onNoteGenerationSkipped);
  const onNoteGenerationFailedRef = useRef(onNoteGenerationFailed);

  useEffect(() => {
    onNoteGenerationSkippedRef.current = onNoteGenerationSkipped;
    onNoteGenerationFailedRef.current = onNoteGenerationFailed;
  }, [onNoteGenerationSkipped, onNoteGenerationFailed]);

  // Initialize WebSocket connection
  useEffect(() => {
    const ws = new SocketIOService(websocketUrl);
    wsRef.current = ws;

    ws.onStatus((status) => {
      setState(prev => ({
        ...prev,
        isConnecting: status === 'connecting',
        isConnected: status === 'connected',
        error: status === 'error' ? 'Connection failed' : null
      }));
    });

    ws.onMessage((message: any) => {
      const statusPayload = parseRecordingStatusMessage(message);
      if (!statusPayload?.status) {
        return;
      }

      const payload = {
        noteId: statusPayload.noteId,
        reason: statusPayload.reason ?? 'unknown',
      };

      if (statusPayload.status === 'note_skipped') {
        onNoteGenerationSkippedRef.current?.(payload);
      } else if (statusPayload.status === 'note_failed') {
        onNoteGenerationFailedRef.current?.(payload);
      }
    });

    // Auto-connect
    ws.connect().catch(error => {
      console.error('Failed to connect WebSocket:', error);
      const errorMessage = 'Failed to connect to streaming service';
      setState(prev => ({
        ...prev,
        error: errorMessage
      }));
      onError?.(errorMessage);
    });

    return () => {
      if (state.isRecording) {
        stopRecording();
      }
      ws.disconnect();
    };
  }, [websocketUrl]);


  const startRecording = useCallback(async () => {
    console.log("🎤 Starting recording...");
    
    if (!wsRef.current?.isConnected()) {
      console.error('❌ Not connected to streaming service');
      setState(prev => ({ ...prev, error: 'Not connected to streaming service' }));
      return;
    }

    console.log(" WebSocket connected, proceeding with recording setup");

    try {
      // Generate session ID
      console.log(" streaming mode entered");
      const sessionId = `session_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
      sessionIdRef.current = sessionId;
      console.log(" Generated session ID:", sessionId);
      
      // Emit session start event
      onSessionStart?.(sessionId);

      // Initialize audio context
      console.log(" Initializing audio context...");
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: 16000
      });
      console.log(" Audio context initialized");
      console.log("✅ Audio context initialized");

      // Get microphone access
      console.log("🎤 Requesting microphone access...");
      streamRef.current = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000,
          channelCount: 1
        }
      });
      console.log("✅ Microphone access granted");

      // Load and register audio worklet
      console.log("🔧 Loading audio worklet...");
      const workletVersion = Math.random().toString(36).substring(2, 11);
      const workletUrl = `/worklets/audio-processor.js?v=${workletVersion}&t=${Date.now()}`;
      console.log("📦 Worklet URL:", workletUrl);
      await audioContextRef.current.audioWorklet.addModule(workletUrl);
      console.log("✅ Audio worklet loaded with version:", workletVersion);

      // Create audio worklet node
      workletNodeRef.current = new AudioWorkletNode(audioContextRef.current, 'audio-processor');
      console.log("✅ Audio worklet node created");
      
      // Connect microphone to worklet
      const source = audioContextRef.current.createMediaStreamSource(streamRef.current);
      source.connect(workletNodeRef.current);
      console.log("🔗 Microphone connected to worklet");

      // Handle audio chunks from worklet
      workletNodeRef.current.port.onmessage = (event) => {
        console.log("📡 Hook: Received message from worklet:", event.data.type);
        if (event.data.type === 'audio_chunk' && wsRef.current?.isConnected() && !isPausedRef.current) {
          console.log("🎵 Hook: Forwarding audio chunk to WebSocket:", {
            dataLength: event.data.data.length,
            timestamp: event.data.timestamp
          });
          wsRef.current.sendAudioChunk(event.data.data, event.data.timestamp);
        } else if (event.data.type === 'complete_recording') {
          console.log("💾 Hook: Received complete recording:", {
            dataLength: event.data.data.length,
            sampleCount: event.data.sampleCount,
            timestamp: event.data.timestamp
          });
          // Store complete recording for download
          console.log("Complete recording received, but callback not supported in streaming-only mode");
        }
      };

      // Start recording
      console.log("▶️ Starting audio processing...");
      workletNodeRef.current.port.postMessage({ type: 'start' });
      
      console.log("📡 Sending start_recording message to server...");
      wsRef.current?.startRecording(sessionId);

      isPausedRef.current = false;
      setState(prev => ({
        ...prev,
        isRecording: true,
        isPaused: false,
        error: null,
        sessionId
      }));
      
      console.log("🎉 Recording started successfully!");

    } catch (error) {
      console.error('❌ Failed to start recording:', error);
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to start recording'
      }));
    }
  }, []);

  const cleanupAudioResources = useCallback(() => {
    if (workletNodeRef.current) {
      workletNodeRef.current.port.postMessage({ type: 'stop' });
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    workletNodeRef.current = null;
    isPausedRef.current = false;
  }, []);

  const stopRecording = useCallback((noteId?: string, doctorId?: string, options: StopRecordingOptions = {}) => {
    console.log("🛑 Stopping recording...");
    console.log("📨 WebSocket status before stop:", wsRef.current?.isConnected());
    
    if (workletNodeRef.current) {
      console.log("⏹️ Stopping audio worklet...");
      workletNodeRef.current.port.postMessage({ type: 'stop' });
    }

    if (wsRef.current && sessionIdRef.current) {
      console.log("📡 Sending stop_recording message to server...");
      console.log("🆔 Session ID being stopped:", sessionIdRef.current);
      console.log("📋 Additional parameters:", { noteId, doctorId, ...options });
      
      if (!doctorId) {
        console.error("❌ Doctor ID is required for new clinical note flow");
        setState(prev => ({
          ...prev,
          error: 'Doctor ID is required to save clinical note'
        }));
        return;
      }
      
      console.log("🔍 About to call stopRecording with noteId:", noteId);
      const finalNoteId = wsRef.current.stopRecording(sessionIdRef.current, doctorId, noteId, options);
      console.log("🆔 Final note ID:", finalNoteId);
      
      // Store the final note ID for tracking
      setState(prev => ({
        ...prev,
        noteId: finalNoteId
      }));
    } else {
      console.warn(" No WebSocket connection or session ID available for stopping");
    }

    // Emit session end event
    onSessionEnd?.();

    // Note: Final note handling is now done by Supabase subscription

    cleanupAudioResources();
    sessionIdRef.current = null;

    setState(prev => ({
      ...prev,
      isRecording: false,
      isPaused: false
    }));
    
    console.log("✅ Recording stopped and cleanup completed");
  }, [cleanupAudioResources, onSessionEnd]);

  const pauseRecording = useCallback(() => {
    if (!sessionIdRef.current) return;

    if (workletNodeRef.current) {
      workletNodeRef.current.port.postMessage({ type: 'pause' });
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        track.enabled = false;
      });
    }

    isPausedRef.current = true;
    if (wsRef.current?.isConnected()) {
      wsRef.current.pauseRecording(sessionIdRef.current);
    }
    setState((prev) => {
      if (!prev.isRecording || prev.isPaused) return prev;
      return { ...prev, isPaused: true };
    });
  }, []);

  const resumeRecording = useCallback(() => {
    if (!sessionIdRef.current) return;

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        track.enabled = true;
      });
    }

    if (workletNodeRef.current) {
      workletNodeRef.current.port.postMessage({ type: 'resume' });
    }

    isPausedRef.current = false;
    if (wsRef.current?.isConnected() ) {
      wsRef.current.resumeRecording(sessionIdRef.current);
    }
    setState((prev) => {
      if (!prev.isRecording || !prev.isPaused) return prev;
      return { ...prev, isPaused: false };
    });
  }, []);

  const cancelRecording = useCallback(async () => {
    console.log("🚫 Cancelling recording...");

    const sessionId = sessionIdRef.current;
    cleanupAudioResources();

    if (wsRef.current && sessionId) {
      wsRef.current.cancelRecording(sessionId);
    }

    sessionIdRef.current = null;
    onSessionEnd?.();

    wsRef.current?.disconnect();
    try {
      await wsRef.current?.connect();
    } catch (error) {
      console.error('Failed to reconnect WebSocket after cancel:', error);
      const errorMessage = 'Failed to reconnect to streaming service';
      setState((prev) => ({ ...prev, error: errorMessage }));
      onError?.(errorMessage);
    }

    setState((prev) => ({
      ...prev,
      isRecording: false,
      isPaused: false,
      sessionId: '',
      error: null,
    }));

    console.log("✅ Recording cancelled");
  }, [cleanupAudioResources, onSessionEnd, onError]);

  const clearError = useCallback(() => {
    setState(prev => ({
      ...prev,
      error: null
    }));
  }, []);

  const saveRecording = useCallback(() => {
    if (workletNodeRef.current) {
      console.log("💾 Hook: Requesting worklet to save recording");
      workletNodeRef.current.port.postMessage({ type: 'save_recording' });
    } else {
      console.warn("⚠️ Hook: No worklet node available for saving recording");
    }
  }, []);

  return {
    ...state,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    cancelRecording,
    clearError,
    saveRecording,
    sendAudioChunk: (data: string, timestamp: number) => {
      if (wsRef.current?.isConnected()) {
        wsRef.current.sendAudioChunk(data, timestamp);
      }
    }
  };
};
