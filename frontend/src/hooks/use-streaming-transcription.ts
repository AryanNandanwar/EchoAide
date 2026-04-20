import { useState, useEffect, useRef, useCallback } from 'react';
import { SocketIOService } from '../services/websocket-service';

export interface StreamingState {
  isRecording: boolean;
  isConnecting: boolean;
  isConnected: boolean;
  error: string | null;
  sessionId: string;
}

export interface UseStreamingTranscriptionOptions {
  websocketUrl: string;
  onError?: (error: string) => void;
  onSessionStart?: (sessionId: string) => void;
  onSessionEnd?: () => void;
}

export const useStreamingTranscription = ({
  websocketUrl,
  onError,
  onSessionStart,
  onSessionEnd
}: UseStreamingTranscriptionOptions) => {
  const [state, setState] = useState<StreamingState>({
    isRecording: false,
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
      console.log("📨 WebSocket message received (ignored):", message.type);
      // Streaming hook only handles audio sending, not responses
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
        if (event.data.type === 'audio_chunk' && wsRef.current?.isConnected()) {
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

      setState(prev => ({
        ...prev,
        isRecording: true,
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

  const stopRecording = useCallback(() => {
    console.log("🛑 Stopping recording...");
    console.log("📨 WebSocket status before stop:", wsRef.current?.isConnected());
    
    if (workletNodeRef.current) {
      console.log("⏹️ Stopping audio worklet...");
      workletNodeRef.current.port.postMessage({ type: 'stop' });
    }

    if (wsRef.current && sessionIdRef.current) {
      console.log("📡 Sending stop_recording message to server...");
      console.log("🆔 Session ID being stopped:", sessionIdRef.current);
      wsRef.current.stopRecording(sessionIdRef.current);
    } else {
      console.warn(" No WebSocket connection or session ID available for stopping");
    }

    // Emit session end event
    onSessionEnd?.();

    // Note: Final note handling is now done by use-sse-transcription

    // Clean up audio resources
    console.log(" Cleaning up audio resources...");
    if (streamRef.current) {
      console.log(" Stopping microphone tracks...");
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    if (audioContextRef.current) {
      console.log("🔧 Closing audio context...");
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    workletNodeRef.current = null;
    sessionIdRef.current = null;

    setState(prev => ({
      ...prev,
      isRecording: false
    }));
    
    console.log("✅ Recording stopped and cleanup completed");
  }, []);

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
    stopRecording,
    clearError,
    saveRecording,
    sendAudioChunk: (data: string, timestamp: number) => {
      if (wsRef.current?.isConnected()) {
        wsRef.current.sendAudioChunk(data, timestamp);
      }
    }
  };
};
