import React, { useEffect, useState, useRef } from "react";
import { Button, CircularProgress, Alert, Chip } from "@mui/material";
import MicIcon from "@mui/icons-material/Mic";
import StopIcon from "@mui/icons-material/Stop";
import UploadIcon from "@mui/icons-material/Upload";
import DownloadIcon from "@mui/icons-material/Download";
import { useStreamingTranscription } from "../hooks/use-streaming-transcription";
import { getWebSocketUrl } from "../lib/websocket-url";
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
    isConnecting,
    isConnected,
    error,
    startRecording,
    stopRecording,
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
    }
  });

  const checkAuth = () => {
    try {
      const token = localStorage.getItem("ds_token") ?? sessionStorage.getItem("ds_token");
      setIsAuthenticated(Boolean(token));
    } catch (err) {
      setIsAuthenticated(false);
    }
  };

  const getDoctorId = () => {
    try {
      const userStr = localStorage.getItem("ds_user") ?? sessionStorage.getItem("ds_user");
      if (userStr) {
        const user = JSON.parse(userStr);
        return user.id;
      }
    } catch (err) {
      console.error("Failed to get doctor ID:", err);
    }
    return null;
  };

  useEffect(() => {
    checkAuth();

    const onStorage = (e: StorageEvent) => {
      if (e.key === "ds_token" || e.key === "ds_user") {
        checkAuth();
      }
    };
    window.addEventListener("storage", onStorage);

    return () => {
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const handleStartRecording = async () => {
    if (!isAuthenticated) {
      onError?.("Please log in to start recording.");
      navigate("/login");
      return;
    }

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

  // Handle generate note from uploaded file
  const handleGenerateNoteFromUpload = async () => {
    if (!selectedFile) {
      onError?.('No file selected');
      return;
    }

    setIsGeneratingFromUpload(true);
    clearError();

    try {
      // Convert file to base64 for processing using browser-compatible method
      const arrayBuffer = await selectedFile.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      const base64Audio = btoa(String.fromCharCode(...uint8Array));

      // Start recording session using the hook's method
      await startRecording();

      // Process the entire file in chunks to simulate real-time streaming
      await processAudioFileInChunks(base64Audio);

      // Stop recording to trigger final note generation
      await stopRecording();

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

  // Process audio file in chunks to simulate real-time streaming
  const processAudioFileInChunks = async (base64Audio: string) => {
    const chunkSize = 1024 * 16; // 16KB chunks
    const totalLength = base64Audio.length;
    let offset = 0;

    while (offset < totalLength) {
      const chunk = base64Audio.slice(offset, offset + chunkSize);
      
      // Send audio chunk through the existing WebSocket connection
      sendAudioChunk(chunk, Date.now());
      
      offset += chunkSize;
      
      // Small delay to simulate real-time streaming
      await new Promise(resolve => setTimeout(resolve, 100));
    }
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
      const response = await fetch("/api/upload-audio/save-recording", {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem("ds_token") || sessionStorage.getItem("ds_token")}`,
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
                label="Recording..."
                color="error"
                size="small"
                className="animate-pulse"
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
                <Button
                  variant="contained"
                  color="error"
                  startIcon={<StopIcon />}
                  onClick={() => handleStopRecording()}
                  className="normal-case"
                >
                  Stop Recording
                </Button>
              )}
            </>
          ) : null}
        </div>

        {isRecording && (
          <p className="text-center text-sm text-red-600 mt-2 animate-pulse">
            Recording in progress... Speak clearly into your microphone.
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
