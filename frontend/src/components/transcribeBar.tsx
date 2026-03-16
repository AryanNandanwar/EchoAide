import React, { useEffect, useRef, useState } from "react";
import WaveSurfer from "wavesurfer.js";
import RecordPlugin from "wavesurfer.js/dist/plugins/record.js";
import { Button, CircularProgress, Alert } from "@mui/material";
import MicIcon from "@mui/icons-material/Mic";
import StopIcon from "@mui/icons-material/Stop";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import PauseIcon from "@mui/icons-material/Pause";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import axios from "axios";
import { useNavigate } from "react-router-dom";

interface AudioRecorderProps {
  onUploadComplete?: (s3Url: string) => void;
  onError?: (error: string) => void;
  getPresignedUrl: (filename: string) => Promise<string>;
  isGeneratingNote?: boolean;
  isNoteReady?: boolean;
  onNoteSaved?: () => void;
}

export const AudioRecorder: React.FC<AudioRecorderProps> = ({
  onUploadComplete,
  onError,
  getPresignedUrl,
  isGeneratingNote = false,
  isNoteReady = false

}) => {
  const waveformRef = useRef<HTMLDivElement>(null);
  const waveSurferRef = useRef<WaveSurfer | null>(null);
  const recordRef = useRef<RecordPlugin | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isRecording, setIsRecording] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);

  // NEW: filename display (for uploaded file)
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  // const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const [wakeLock, setWakeLock] = useState<any>(null);
  const [isPaused, setIsPaused] = useState(false);

  const navigate = useNavigate();

  // const addDebugLog = (message: string) => {
  //   const timestamp = new Date().toLocaleTimeString();
  //   const logEntry = `[${timestamp}] ${message}`;
  //   // console.log(logEntry); // Commented out to reduce console noise
  //   setDebugLogs(prev => [...prev.slice(-20), logEntry]); // Keep last 20 logs
  // };

  // Request wake lock to prevent screen from sleeping during recording
  const requestWakeLock = async () => {
    try {
      if ('wakeLock' in navigator) {
        const lock = await (navigator as any).wakeLock.request('screen');
        setWakeLock(lock);
        // addDebugLog('Wake lock acquired');
      } else {
        // addDebugLog('Wake lock not supported on this device');
      }
    } catch (err) {
      // addDebugLog('Wake lock request failed: ' + err);
    }
  };

  // Release wake lock when done
  const releaseWakeLock = () => {
    if (wakeLock) {
      wakeLock.release();
      setWakeLock(null);
      // addDebugLog('Wake lock released');
    }
  };

  // Handle phone call interruption
  const handlePhoneCallInterruption = () => {
    if (isRecording && !isPaused) {
      // addDebugLog('Phone call detected - pausing recording');
      handlePauseRecording();
    }
  };

  // Pause recording
  const handlePauseRecording = async () => {
    try {
      if (recordRef.current && isRecording && !isPaused) {
        // addDebugLog('Pausing recording...');
        await recordRef.current.pauseRecording();
        setIsPaused(true);
        // addDebugLog('Recording paused');
      }
    } catch (error) {
      // addDebugLog('Error pausing recording: ' + error);
    }
  };

  // Resume recording
  const handleResumeRecording = async () => {
    try {
      if (recordRef.current && isRecording && isPaused) {
        // addDebugLog('Resuming recording...');
        await recordRef.current.resumeRecording();
        setIsPaused(false);
        // addDebugLog('Recording resumed');
      }
    } catch (error) {
      // addDebugLog('Error resuming recording: ' + error);
    }
  };

  
  const mimeToExtension = (mimeType?: string): string => {
    const lower = (mimeType || "").toLowerCase();
    if (lower.includes("wav")) return "wav";
    if (lower.includes("mpeg") || lower.includes("mp3")) return "mp3";
    if (lower.includes("mp4") || lower.includes("m4a")) return "m4a";
    if (lower.includes("flac")) return "flac";
    if (lower.includes("webm")) return "webm";
    if (lower.includes("ogg")) return "ogg";
    return "wav";
  };

  const buildUploadFilename = (): string => {
    const random = Math.random().toString(36).substring(2, 15);

    if (recordedBlob instanceof File && recordedBlob.name) {
      const extension = recordedBlob.name.split(".").pop()?.toLowerCase();
      if (extension) {
        return `audio-${Date.now()}-${random}.${extension}`;
      }
    }

    const extension = mimeToExtension(recordedBlob?.type);
    return `audio-${Date.now()}-${random}.${extension}`;
  };

  const checkAuth = () => {
    try {
      const token = localStorage.getItem("ds_token") ?? sessionStorage.getItem("ds_token");
      setIsAuthenticated(Boolean(token));
    } catch (err) {
      setIsAuthenticated(false);
    }
  };

  useEffect(() => {
    checkAuth();

    const onStorage = (e: StorageEvent) => {
      if (e.key === "ds_token" || e.key === "ds_user") {
        checkAuth();
      }
    };
    window.addEventListener("storage", onStorage);

    // Handle page visibility changes (phone calls, app switching)
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // addDebugLog('Page hidden - possible phone call or app switch');
        handlePhoneCallInterruption();
      } else {
        // addDebugLog('Page visible - user returned');
      }
    };

    // Handle focus/blur events (additional phone call detection)
    const handleBlur = () => {
      // addDebugLog('Window blurred - possible phone call');
      handlePhoneCallInterruption();
    };

    const handleFocus = () => {
      // addDebugLog('Window focused - user returned');
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);

    return () => {
      window.removeEventListener("storage", onStorage);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);
    };
  }, [isRecording, isPaused]); // Add dependencies

  useEffect(() => {
    // addDebugLog('Initializing WaveSurfer...');
    // addDebugLog('User Agent: ' + navigator.userAgent);
    // addDebugLog('Is standalone: ' + window.matchMedia('(display-mode: standalone)').matches);
    // addDebugLog('Is iOS: ' + /iPad|iPhone|iPod/.test(navigator.userAgent));
    
    if (!waveformRef.current) {
      // addDebugLog('Waveform ref is null');
      return;
    }

    // Initialize WaveSurfer
    const waveSurfer = WaveSurfer.create({
      container: waveformRef.current,
      waveColor: "#3f51b5",
      progressColor: "#1976d2",
      cursorColor: "#1976d2",
      height: 60,
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
      normalize: true,
    });

    // addDebugLog('WaveSurfer created: ' + waveSurfer);

    // Initialize Record Plugin
    let record: RecordPlugin;
    try {
      record = waveSurfer.registerPlugin(
        RecordPlugin.create({
          scrollingWaveform: true,
          renderRecordedAudio: true,
        })
      );
      // addDebugLog('Record plugin created successfully: ' + record);
    } catch (error) {
      // addDebugLog('Error creating record plugin: ' + error);
      return;
    }

    // Handle recording state changes
    record.on("record-start", () => {
      setIsRecording(true);
      setRecordedBlob(null);
      setSelectedFileName(null);
      requestWakeLock(); // Prevent screen sleep during recording
    });

    record.on("record-end", (blob: Blob) => {
      // addDebugLog('Recording ended, blob size: ' + blob.size + ', type: ' + blob.type);
      releaseWakeLock(); // Release wake lock when recording ends
      
      // Check if blob is empty (iPhone PWA issue)
      if (blob.size === 0) {
        // addDebugLog('ERROR: Audio blob is empty - this is a known iPhone PWA issue');
        onError?.('Recording failed: No audio data captured. This can happen on iPhone PWAs. Please try recording again or use the Upload Audio option.');
        return;
      }
      
      setIsRecording(false);
      setRecordedBlob(blob);
      setSelectedFileName("Recorded audio");
    });

    record.on("record-pause", () => {
      // addDebugLog('Recording paused by plugin');
      setIsPaused(true);
    });

    record.on("record-resume", () => {
      // addDebugLog('Recording resumed by plugin');
      setIsPaused(false);
    });

    waveSurferRef.current = waveSurfer;
    recordRef.current = record;

    return () => {
      waveSurfer.destroy();
    };
  }, []);

  const handleStartRecording = async () => {
    try {
      // addDebugLog('Starting recording...');
      if (!recordRef.current) {
        // addDebugLog('Record ref is null');
        return;
      }

      // clear any previous upload selection
      setRecordedBlob(null);
      setSelectedFileName(null);

      // addDebugLog('Requesting microphone access...');
      await recordRef.current.startMic();
      // addDebugLog('Microphone access granted, starting recording...');
      await recordRef.current.startRecording();
      // addDebugLog('Recording started successfully');
    } catch (err) {
      // addDebugLog('Error starting recording: ' + err);
      const msg = err instanceof Error ? err.message : "Failed to start recording";
      onError?.(msg);
    }
  };

  const handleStopRecording = async () => {
    try {
      // addDebugLog('Stopping recording...');
      if (recordRef.current) {
        // If paused, resume first to ensure proper stop
        if (isPaused) {
          // addDebugLog('Resuming before stopping to ensure proper finalization');
          await recordRef.current.resumeRecording();
          setIsPaused(false);
        }
        recordRef.current.stopRecording();
        // addDebugLog('Recording stop command sent');
      } else {
        // addDebugLog('Record ref is null when trying to stop');
      }
    } catch (error) {
      // addDebugLog('Error stopping recording: ' + error);
      const errorMessage = error instanceof Error ? error.message : "Failed to stop recording";
      onError?.(errorMessage);
    }
  };

  // NEW: upload file selection
  const handleSelectFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedExt = [".wav", ".mp3", ".m4a", ".flac"];
    const lower = file.name.toLowerCase();
    const ok = allowedExt.some((ext) => lower.endsWith(ext));
    if (!ok) {
      onError?.("Unsupported format. Please upload WAV/MP3/M4A/FLAC.");
      return;
    }

    // treat uploaded file like recorded blob
    setRecordedBlob(file);
    setSelectedFileName(file.name);

    // reset waveform view
    if (waveSurferRef.current) {
      waveSurferRef.current.seekTo(0);
    }

    // allow selecting the same file again later
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleUploadToS3 = async () => {
    // addDebugLog('handleUploadToS3 called');
    // addDebugLog('recordedBlob: ' + (recordedBlob ? 'exists' : 'null'));
    // addDebugLog('isAuthenticated: ' + isAuthenticated);
    
    if (!recordedBlob) {
      // addDebugLog('No recorded blob found');
      return;
    }

    if (recordedBlob.size === 0) {
      onError?.("Recorded audio is empty. Please record again before uploading.");
      return;
    }

    if (!isAuthenticated) {
      const msg = "Please log in to upload recordings.";
      onError?.(msg);
      navigate("/login");
      return;
    }

    setIsUploading(true);

    try {
      // addDebugLog('Starting upload process...');
      const uploadFilename = buildUploadFilename();
      // addDebugLog('Upload filename: ' + uploadFilename);
      
      const presignedUrl = await getPresignedUrl(uploadFilename);
      // addDebugLog('Presigned URL obtained: ' + presignedUrl.substring(0, 100) + '...');

      const contentType =
        (recordedBlob as any)?.type && (recordedBlob as any).type.length > 0
          ? (recordedBlob as any).type
          : "audio/wav";
      
      // addDebugLog('Content type: ' + contentType);
      // addDebugLog('Blob size: ' + recordedBlob.size);

      // Use axios PUT to upload the blob/file
      const response = await axios.put(presignedUrl, recordedBlob, {
        headers: {
          "Content-Type": contentType,
        },
      });

      // addDebugLog('Upload response status: ' + response.status);

      // Confirm upload success with status 200 range
      if (response.status < 200 || response.status >= 300) {
        throw new Error(`Upload failed with status ${response.status}`);
      }

      const s3Url = presignedUrl.split("?")[0];
      onUploadComplete?.(s3Url);

      // reset state
      setRecordedBlob(null);
      setSelectedFileName(null);

      if (waveSurferRef.current) {
        waveSurferRef.current.seekTo(0);
      }
    } catch (error) {
      // addDebugLog('Upload error occurred: ' + error);
      const errorMessage = error instanceof Error ? error.message : "Upload failed";
      // addDebugLog('Error message: ' + errorMessage);
      onError?.(errorMessage);
    } finally {
      // addDebugLog('Upload process completed, setting isUploading to false');
      setIsUploading(false);
    }
  };

  const handleDiscard = () => {
    setRecordedBlob(null);
    setSelectedFileName(null);

    if (waveSurferRef.current) {
      waveSurferRef.current.seekTo(0);
    }
  };

  // Always render the waveform container & control visibility via CSS
  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-300 shadow-lg p-4 z-50">
      <div className="max-w-2xl mx-auto">
        {/* Debug info - commented out for clean UI */}
        {/* <div className="mb-2 text-xs text-gray-500 p-2 bg-gray-100 rounded">
          <div>Debug: recordedBlob={recordedBlob ? 'exists' : 'null'}, isRecording={isRecording}, isAuthenticated={isAuthenticated}, isPaused={isPaused}</div>
          <div>User Agent: {typeof navigator !== 'undefined' ? navigator.userAgent.split(' ')[0] : 'N/A'}</div>
          <div>iOS: {typeof navigator !== 'undefined' ? /iPad|iPhone|iPod/.test(navigator.userAgent).toString() : 'N/A'}</div>
          <div>PWA: {typeof window !== 'undefined' ? window.matchMedia('(display-mode: standalone)').matches.toString() : 'N/A'}</div>
          <div className="mt-2">
            <button 
              onClick={() => {
                const logs = debugLogs.join('\n');
                navigator.clipboard.writeText(logs).then(() => alert('Debug logs copied!'));
              }}
              className="px-2 py-1 bg-blue-500 text-white rounded text-xs mr-2"
            >
              Copy Logs
            </button>
            <button 
              onClick={() => setDebugLogs([])}
              className="px-2 py-1 bg-red-500 text-white rounded text-xs"
            >
              Clear Logs
            </button>
          </div>
          {debugLogs.length > 0 && (
            <div className="mt-2 max-h-32 overflow-y-auto bg-white p-2 rounded border">
              {debugLogs.map((log, index) => (
                <div key={index} className="debug-log text-xs font-mono">{log}</div>
              ))}
            </div>
          )}
        </div> */}
        
        <div
          style={{
            display: isRecording || (recordedBlob && !isRecording) ? "block" : "none",
          }}
          className="mb-4 bg-gray-50 rounded-lg p-4"
        >
          <div ref={waveformRef} className="w-full" />

          {selectedFileName && (
            <p className="mt-2 text-center text-xs text-gray-600">
              Selected: <b>{selectedFileName}</b>
            </p>
          )}
        </div>

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
          {isGeneratingNote ? (
            <div className="flex flex-col items-center gap-2">
              <div className="flex items-center gap-2">
                <CircularProgress size={24} />
                <span className="text-sm text-gray-600">Getting your note ready, hang on...</span>
              </div>
            </div>
          ) : !recordedBlob && isAuthenticated ? (
            <>
              {/* NEW: Upload button */}
              <Button
                variant="outlined"
                startIcon={<UploadFileIcon />}
                onClick={() => fileInputRef.current?.click()}
                sx={{ textTransform: "none" }}
                disabled={isNoteReady}
              >
                Upload Audio
              </Button>

              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*,.wav,.mp3,.m4a,.flac"
                hidden
                onChange={handleSelectFile}
              />

              {/* Existing record controls */}
              {!isRecording ? (
                <Button
                  variant="contained"
                  color="primary"
                  startIcon={<MicIcon />}
                  onClick={handleStartRecording}
                  className="normal-case"
                  disabled={isNoteReady}
                >
                  Start Recording
                </Button>
              ) : (
                <div className="flex items-center gap-2">
                  {!isPaused ? (
                    <>
                      <Button
                        variant="contained"
                        color="warning"
                        startIcon={<PauseIcon />}
                        onClick={handlePauseRecording}
                        className="normal-case"
                      >
                        Pause
                      </Button>
                      <Button
                        variant="contained"
                        color="error"
                        startIcon={<StopIcon />}
                        onClick={handleStopRecording}
                        className="normal-case"
                      >
                        Stop Recording
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        variant="contained"
                        color="success"
                        startIcon={<PlayArrowIcon />}
                        onClick={handleResumeRecording}
                        className="normal-case"
                      >
                        Resume
                      </Button>
                      <Button
                        variant="contained"
                        color="error"
                        startIcon={<StopIcon />}
                        onClick={handleStopRecording}
                        className="normal-case"
                      >
                        Stop Recording
                      </Button>
                    </>
                  )}
                </div>
              )}
            </>
          ) : recordedBlob && !isGeneratingNote ? (
            <>
              {isNoteReady && (
                <div className="text-center text-sm text-green-600 mb-2">
                  Note is ready! Save it to record another.
                </div>
              )}
              <Button
                variant="contained"
                color="success"
                onClick={() => {
                  // addDebugLog('Generate Note button clicked');
                  // addDebugLog('Current state - recordedBlob: ' + (recordedBlob ? 'exists' : 'null'));
                  // addDebugLog('Current state - isRecording: ' + isRecording);
                  // addDebugLog('Current state - isAuthenticated: ' + isAuthenticated);
                  // addDebugLog('Current state - isUploading: ' + isUploading);
                 
                  handleUploadToS3();
                }}
                disabled={isUploading || isNoteReady}
                className="normal-case"
              >
                {isUploading ? (
                  <>
                    <CircularProgress size={20} className="mr-2" />
                    Uploading...
                  </>
                ) : (
                  "Generate Note"
                )}
              </Button>

              <Button variant="outlined" onClick={handleDiscard} className="normal-case" disabled={isNoteReady}>
                Discard
              </Button>
            </>
          ) : null}
        </div>

        {isRecording && (
          <p className="text-center text-sm text-red-600 mt-2 animate-pulse">
            {isPaused ? 'Recording paused - tap Resume to continue' : 'Recording in progress...'}
          </p>
        )}
      </div>
    </div>
  );
};

export default AudioRecorder;
