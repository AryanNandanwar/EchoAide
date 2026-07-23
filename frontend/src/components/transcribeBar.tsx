import React, { useEffect, useState, useRef } from "react";
import { Button, CircularProgress, Alert, Chip } from "@mui/material";
import MicIcon from "@mui/icons-material/Mic";
import StopIcon from "@mui/icons-material/Stop";
import PauseIcon from "@mui/icons-material/Pause";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import UploadIcon from "@mui/icons-material/Upload";
import DownloadIcon from "@mui/icons-material/Download";
import {
  useStreamingTranscription,
  type NoteGenerationSkippedPayload,
} from "../hooks/use-streaming-transcription";
import {
  STREAMING_AUDIO_SAMPLE_RATE,
  float32SamplesToPcmS16le,
} from "../utils/audio-pcm";
import { getWebSocketUrl } from "../lib/websocket-url";
import { ensureValidAccessToken, getStoredUser, hasValidSession } from "../lib/auth";
import { useNavigate } from "react-router-dom";

// UUID generation utility
const generateUUID = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

interface AudioRecorderProps {
  onError?: (error: string) => void;
  isGeneratingNote?: boolean;
  isNoteReady?: boolean;
  onNoteSaved?: () => void;
  onSessionStart?: (sessionId: string) => void;
  onSessionEnd?: () => void;
  onNoteIdGenerated?: (noteId: string) => void; // New callback for noteId
  onNoteGenerationSkipped?: (payload: NoteGenerationSkippedPayload) => void;
  onNoteGenerationFailed?: (payload: NoteGenerationSkippedPayload) => void;
  websocketUrl?: string;
  patientId?: string;
  intakeId?: string;
  variant?: "bar" | "inline";
  className?: string;
  autoStart?: boolean;
}

export const AudioRecorder: React.FC<AudioRecorderProps> = ({
  onError,
  isGeneratingNote = false,
  isNoteReady = false,
  onSessionStart,
  onSessionEnd,
  onNoteIdGenerated,
  onNoteGenerationSkipped,
  onNoteGenerationFailed,
  websocketUrl,
  patientId,
  intakeId,
  variant = "bar",
  className,
  autoStart = false,
}) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [wakeLock, setWakeLock] = useState<any>(null);
  const [recordedAudio] = useState<{base64: string, sampleCount: number} | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isGeneratingFromUpload, setIsGeneratingFromUpload] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const autoStartAttemptedRef = useRef(false);
  const navigate = useNavigate();
  const resolvedWebSocketUrl = websocketUrl ?? getWebSocketUrl();

  // Use streaming transcription hook (audio-only)
  const {
    isRecording,
    isPaused,
    isConnecting,
    isConnected,
    error,
    startRecording,
    startStreamingSession,
    pauseRecording,
    resumeRecording,
    stopRecording,
    cancelRecording,
    clearError,
    sendAudioChunk
  } = useStreamingTranscription({
    websocketUrl: resolvedWebSocketUrl,
    onError: (errorMessage) => {
      onError?.(errorMessage);
    },
    onSessionStart: (sessionId) => {
      console.log("Component: Session started", sessionId);
      onSessionStart?.(sessionId);
    },
    onSessionEnd: () => {
      console.log("Component: Session ended");
      onSessionEnd?.();
    },
    onNoteGenerationSkipped,
    onNoteGenerationFailed,
  });

  const checkAuth = () => {
    setIsAuthenticated(hasValidSession());
  };

  const getDoctorId = () => {
    const user = getStoredUser();
    return user?.id ?? null;
  };

  useEffect(() => {
    checkAuth();

    const onStorage = (e: StorageEvent) => {
      if (e.key === "ds_token" || e.key === "ds_user" || e.key === "ds_refresh_token") {
        checkAuth();
      }
    };
    window.addEventListener("storage", onStorage);

    const intervalId = window.setInterval(() => {
      void ensureValidAccessToken().then((token) => {
        setIsAuthenticated(Boolean(token));
      });
    }, 30_000);

    return () => {
      window.removeEventListener("storage", onStorage);
      window.clearInterval(intervalId);
    };
  }, []);

  const handleStartRecording = async () => {
    const token = await ensureValidAccessToken();
    if (!token) {
      onError?.("Please log in to start recording.");
      navigate("/login");
      return;
    }

    setIsAuthenticated(true);

    try {
      await requestWakeLock();
      clearError();
      await startRecording();
      console.log("Recording started")
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to start recording";
      onError?.(msg);
      releaseWakeLock();
    }
  };

  useEffect(() => {
    if (!autoStart || autoStartAttemptedRef.current) return;
    if (!isAuthenticated || !isConnected || isConnecting || isRecording || isGeneratingNote) return;

    autoStartAttemptedRef.current = true;
    void handleStartRecording();
  }, [autoStart, isAuthenticated, isConnected, isConnecting, isRecording, isGeneratingNote]);

  const handleCancelRecording = async () => {
    try {
      await cancelRecording();
      releaseWakeLock();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to cancel recording";
      onError?.(msg);
      releaseWakeLock();
    }
  };

  const handleStopRecording = async () => {
    try {
      // Generate unique note ID
      const noteId = generateUUID();
      
      // Call the callback to pass noteId to parent
      onNoteIdGenerated?.(noteId);
      
      // Get doctor ID from stored user data
      const doctorId = getDoctorId();
      
      if (!doctorId) {
        onError?.("Doctor ID not found. Please log in again.");
        return;
      }

      console.log("📋 Stopping recording with data:", {
        noteId,
        doctorId
      });

      await stopRecording(noteId, doctorId, { patientId, intakeId });
      releaseWakeLock();
      // Note: Final note processing is now handled by backend storage
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to stop recording";
      onError?.(errorMessage);
    }
  };

  // Request wake lock to prevent screen from sleeping during recording
  const requestWakeLock = async () => {
    try {
      if ('wakeLock' in navigator) {
        const lock = await (navigator as any).wakeLock.request('screen');
        setWakeLock(lock);
      }
    } catch (err) {
      // Wake lock not supported or failed
    }
  };

  // Release wake lock when done
  const releaseWakeLock = () => {
    if (wakeLock) {
      wakeLock.release();
      setWakeLock(null);
    }
  };

  // Handle file upload
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    console.log('File upload handler called');
    const file = event.target.files?.[0];
    console.log('Selected file:', file);
    if (!file) {
      console.log('No file selected');
      return;
    }

    // Validate file type
    const validTypes = ['audio/wav', 'audio/mp3', 'audio/mpeg', 'audio/m4a', 'audio/x-m4a', 'audio/ogg'];
    console.log('File type:', file.type, 'Valid types:', validTypes);
    if (!validTypes.includes(file.type)) {
      onError?.('Please upload a valid audio file (WAV, MP3, M4A, or OGG)');
      return;
    }

    // Validate file size (max 25MB)
    const maxSize = 25 * 1024 * 1024; // 25MB
    console.log('File size:', file.size, 'Max size:', maxSize);
    if (file.size > maxSize) {
      onError?.('File size must be less than 25MB');
      return;
    }

    console.log('File validation passed, setting selected file');
    // Store the selected file and clear transcript
    setSelectedFile(file);
    console.log('setSelectedFile called with file:', file.name);
    clearError();
    console.log('File selection completed');
  };

  // Decode an uploaded audio file (WAV/MP3/M4A/OGG) into 16 kHz mono PCM16,
  // the format the backend streams to the transcription service.
  const decodeFileToStreamingPcm = async (file: File): Promise<Int16Array> => {
    const arrayBuffer = await file.arrayBuffer();

    const decodeContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    let decoded: AudioBuffer;
    try {
      decoded = await decodeContext.decodeAudioData(arrayBuffer);
    } catch {
      throw new Error('Could not decode the audio file. Please upload a valid WAV, MP3, M4A, or OGG file.');
    } finally {
      void decodeContext.close();
    }

    // Resample + downmix to 16 kHz mono
    const targetLength = Math.ceil(decoded.duration * STREAMING_AUDIO_SAMPLE_RATE);
    if (targetLength === 0) {
      throw new Error('The audio file appears to be empty.');
    }

    const offlineContext = new OfflineAudioContext(1, targetLength, STREAMING_AUDIO_SAMPLE_RATE);
    const source = offlineContext.createBufferSource();
    source.buffer = decoded;
    source.connect(offlineContext.destination);
    source.start();
    const rendered = await offlineContext.startRendering();

    return float32SamplesToPcmS16le(rendered.getChannelData(0));
  };

  // Handle generate note from uploaded file
  const handleGenerateNoteFromUpload = async () => {
    if (!selectedFile) {
      onError?.('No file selected');
      return;
    }

    const doctorId = getDoctorId();
    if (!doctorId) {
      onError?.("Doctor ID not found. Please log in again.");
      return;
    }

    setIsGeneratingFromUpload(true);
    clearError();

    try {
      const pcmSamples = await decodeFileToStreamingPcm(selectedFile);

      const sessionId = await startStreamingSession();
      if (!sessionId) {
        onError?.('Failed to start streaming session for uploaded audio.');
        return;
      }

      // Give the backend a moment to establish the transcription session
      await new Promise((resolve) => setTimeout(resolve, 1000));

      await streamPcmInChunks(pcmSamples);

      // Allow in-flight transcripts to arrive before requesting the final note
      await new Promise((resolve) => setTimeout(resolve, 1500));

      const noteId = generateUUID();

      // Open the pending-note view and immediately request final note generation.
      // These must stay back-to-back: opening the view unmounts this component,
      // so the stop message has to be emitted in the same synchronous block.
      onNoteIdGenerated?.(noteId);
      stopRecording(noteId, doctorId, { patientId, intakeId });

      // Clean up
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to process audio file';
      onError?.(errorMessage);
    } finally {
      setIsGeneratingFromUpload(false);
    }
  };

  // Stream PCM16 audio over the websocket in ~1 second chunks
  const streamPcmInChunks = async (pcmSamples: Int16Array) => {
    const bytes = new Uint8Array(pcmSamples.buffer, pcmSamples.byteOffset, pcmSamples.byteLength);
    const chunkBytes = STREAMING_AUDIO_SAMPLE_RATE * 2; // 1 second of PCM16 audio
    let offset = 0;

    while (offset < bytes.length) {
      const chunk = bytes.subarray(offset, offset + chunkBytes);
      sendAudioChunk(bytesToBase64(chunk), Date.now());
      offset += chunkBytes;

      // Pace the upload so the transcription service can keep up
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  };

  // btoa-safe base64 encoding for large buffers (avoids call stack overflow
  // from String.fromCharCode(...bytes) on big files)
  const bytesToBase64 = (bytes: Uint8Array): string => {
    let binary = '';
    const blockSize = 0x8000;
    for (let i = 0; i < bytes.length; i += blockSize) {
      binary += String.fromCharCode.apply(
        null,
        bytes.subarray(i, i + blockSize) as unknown as number[],
      );
    }
    return btoa(binary);
  };

  // Trigger file input click
  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  // Handle download of recorded audio
  const handleDownloadRecording = () => {
    if (!recordedAudio) {
      onError?.("No recording available to download");
      return;
    }

    try {
      // Convert base64 to blob
      const binaryString = atob(recordedAudio.base64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      const blob = new Blob([bytes], { type: 'audio/wav' });
      const url = URL.createObjectURL(blob);
      
      // Create download link
      const a = document.createElement('a');
      a.href = url;
      a.download = `recording_${new Date().toISOString().replace(/[:.]/g, '-')}.wav`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      console.log(`✅ Downloaded recording with ${recordedAudio.sampleCount} samples`);
    } catch (error) {
      console.error("❌ Failed to download recording:", error);
      onError?.("Failed to download recording");
    }
  };

  // Handle save recording for testing
  const handleSaveRecording = async () => {
    if (!recordedAudio) {
      onError?.("No recording available to save");
      return;
    }

    try {
      const token = await ensureValidAccessToken();
      if (!token) {
        onError?.("Please log in to save recording.");
        return;
      }

      const response = await fetch("/api/upload-audio/save-recording", {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          audioData: recordedAudio.base64,
          sampleCount: recordedAudio.sampleCount
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Save failed');
      }

      const result = await response.json();
      console.log(`✅ Recording saved:`, result);
      
      // Show success message
      if (result.success) {
        console.log(`📁 File saved to: ${result.filepath}`);
        console.log(`🎯 Ready for Python testing`);
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to save recording';
      console.error("❌ Failed to save recording:", error);
      onError?.(errorMessage);
    }
  };

  const containerClassName = variant === "bar"
    ? "fixed bottom-0 left-0 right-0 bg-white border-t border-gray-300 shadow-lg p-4 z-50"
    : `bg-white border border-gray-200 rounded-lg p-3 ${className ?? ""}`;

  return (
    <div className={containerClassName}>
      <div className="max-w-2xl mx-auto">
        {/* Connection Status */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Chip 
              label={isConnecting ? "Connecting..." : isConnected ? "Connected" : "Disconnected"}
              color={isConnecting ? "warning" : isConnected ? "success" : "error"}
              size="small"
            />
            {isRecording && (
              <Chip
                label={isPaused ? "Paused" : "Recording..."}
                color={isPaused ? "warning" : "error"}
                size="small"
                className={isPaused ? undefined : "animate-pulse"}
              />
            )}
          </div>
        </div>

        {/* Note: Live transcript display removed - handled by SSE service */}

        {/* Clinical Note Preview - Removed since main viewer handles display */}

        {/* Debug Display */}
        {/* <div className="mb-4 bg-gray-100 rounded p-2 text-xs">
          <div>selectedFile: {selectedFile ? selectedFile.name : 'null'}</div>
          <div>isRecording: {isRecording.toString()}</div>
          <div>isConnected: {isConnected.toString()}</div>
          <div>isAuthenticated: {isAuthenticated.toString()}</div>
        </div> */}

        {/* Error Display */}
        {error && (
          <Alert severity="error" className="mb-4">
            {error}
          </Alert>
        )}

        {!isAuthenticated && (
          <div className="mb-4 flex items-center justify-between gap-4">
            <Alert severity="warning" className="flex-1">
              You must be logged in to record audio.
            </Alert>
            <Button variant="contained" onClick={() => navigate("/login")} sx={{ textTransform: "none" }}>
              Login
            </Button>
          </div>
        )}

        <div className="flex items-center justify-center gap-4">
          {isGeneratingNote || isGeneratingFromUpload ? (
            <div className="flex flex-col items-center gap-2">
              <div className="flex items-center gap-2">
                <CircularProgress size={24} />
                <span className="text-sm text-gray-600">
                  {isGeneratingFromUpload ? 'Processing uploaded audio...' : 'Getting your note ready, hang on...'}
                </span>
              </div>
            </div>
          ) : isAuthenticated ? (
            <>
              {!isRecording ? (
                <div className="flex gap-3 flex-wrap justify-center">
                  {(() => {
                    console.log('UI render - selectedFile:', selectedFile);
                    console.log('UI render - selectedFile truthy:', !!selectedFile);
                    return selectedFile;
                  })() ? (
                    <>
                      <Button
                        variant="contained"
                        color="success"
                        onClick={handleGenerateNoteFromUpload}
                        className="normal-case"
                        disabled={isNoteReady || !isConnected || isConnecting}
                      >
                        Generate Note from {selectedFile?.name || 'selected file'}
                      </Button>
                      <Button
                        variant="outlined"
                        color="secondary"
                        onClick={() => {
                          setSelectedFile(null);
                          if (fileInputRef.current) {
                            fileInputRef.current.value = '';
                          }
                        }}
                        className="normal-case"
                      >
                        Clear Selection
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        variant="contained"
                        color="primary"
                        startIcon={<MicIcon />}
                        onClick={handleStartRecording}
                        className="normal-case"
                        disabled={isNoteReady || !isConnected || isConnecting}
                      >
                        Start Recording
                      </Button>
                      <Button
                        variant="outlined"
                        color="secondary"
                        startIcon={<UploadIcon />}
                        onClick={handleUploadClick}
                        className="normal-case"
                        disabled={isNoteReady || !isConnected || isConnecting}
                      >
                        Upload Audio
                      </Button>
                    </>
                  )}
                  {recordedAudio && (
                    <>
                      <Button
                        variant="outlined"
                        color="success"
                        startIcon={<DownloadIcon />}
                        onClick={handleDownloadRecording}
                        className="normal-case"
                      >
                        Download
                      </Button>
                      <Button
                        variant="text"
                        color="info"
                        onClick={handleSaveRecording}
                        className="normal-case text-sm"
                      >
                        Save as test.wav
                      </Button>
                    </>
                  )}
                </div>
              ) : (
                <div className="flex gap-3 flex-wrap justify-center">
                  {isPaused ? (
                    <Button
                      variant="contained"
                      color="primary"
                      startIcon={<PlayArrowIcon />}
                      onClick={() => resumeRecording()}
                      className="normal-case"
                    >
                      Resume
                    </Button>
                  ) : (
                    <Button
                      variant="outlined"
                      color="primary"
                      startIcon={<PauseIcon />}
                      onClick={() => pauseRecording()}
                      className="normal-case"
                    >
                      Pause
                    </Button>
                  )}
                  <Button
                    variant="contained"
                    color="error"
                    startIcon={<StopIcon />}
                    onClick={() => handleStopRecording()}
                    className="normal-case"
                  >
                    Stop Recording
                  </Button>
                  <Button
                    variant="outlined"
                    color="inherit"
                    onClick={() => void handleCancelRecording()}
                    className="normal-case"
                  >
                    Cancel
                  </Button>
                </div>
              )}
            </>
          ) : null}
        </div>

        {isRecording && (
          <p className={`text-center text-sm mt-2 ${isPaused ? "text-amber-700" : "text-red-600 animate-pulse"}`}>
            {isPaused
              ? "Recording paused. Resume when you are ready to continue."
              : "Recording in progress... Speak clearly into your microphone."}
          </p>
        )}

        {/* Hidden file input for audio upload */}
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*"
          onChange={handleFileUpload}
          style={{ display: 'none' }}
        />
      </div>
    </div>
  );
};

export default AudioRecorder;
