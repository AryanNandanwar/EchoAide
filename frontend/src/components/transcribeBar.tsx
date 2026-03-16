import React, { useEffect, useRef, useState } from "react";
import WaveSurfer from "wavesurfer.js";
import RecordPlugin from "wavesurfer.js/dist/plugins/record.js";
import { Button, CircularProgress, Alert } from "@mui/material";
import MicIcon from "@mui/icons-material/Mic";
import StopIcon from "@mui/icons-material/Stop";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import axios from "axios";
import { useNavigate } from "react-router-dom";

interface AudioRecorderProps {
  onUploadComplete?: (s3Url: string) => void;
  onError?: (error: string) => void;
  getPresignedUrl: (filename: string) => Promise<string>;
}

export const AudioRecorder: React.FC<AudioRecorderProps> = ({
  onUploadComplete,
  onError,
  getPresignedUrl,
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

  const navigate = useNavigate();

  
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
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    if (!waveformRef.current) return;

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

    // Initialize Record Plugin
    const record = waveSurfer.registerPlugin(
      RecordPlugin.create({
        scrollingWaveform: true,
        renderRecordedAudio: true,
      })
    );

    // Handle recording state changes
    record.on("record-start", () => {
      setIsRecording(true);
      setRecordedBlob(null);
      setSelectedFileName(null);
    });

    record.on("record-end", (blob: Blob) => {
      setIsRecording(false);
      setRecordedBlob(blob);
      setSelectedFileName("Recorded audio");
    });

    record.on("record-pause", () => {
      setIsRecording(false);
    });

    record.on("record-resume", () => {
      setIsRecording(true);
    });

    waveSurferRef.current = waveSurfer;
    recordRef.current = record;

    return () => {
      waveSurfer.destroy();
    };
  }, []);

  const handleStartRecording = async () => {
    try {
      if (!recordRef.current) return;

      // clear any previous upload selection
      setRecordedBlob(null);
      setSelectedFileName(null);

      await recordRef.current.startMic();
      await recordRef.current.startRecording();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to start recording";
      onError?.(msg);
    }
  };

  const handleStopRecording = async () => {
    try {
      if (recordRef.current) {
        recordRef.current.stopRecording();
      }
    } catch (error) {
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
    if (!recordedBlob) return;

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
      const uploadFilename = buildUploadFilename();
      const presignedUrl = await getPresignedUrl(uploadFilename);

      const contentType =
        (recordedBlob as any)?.type && (recordedBlob as any).type.length > 0
          ? (recordedBlob as any).type
          : "audio/wav";

      // Use axios PUT to upload the blob/file
      const response = await axios.put(presignedUrl, recordedBlob, {
        headers: {
          "Content-Type": contentType,
        },
      });

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
      const errorMessage = error instanceof Error ? error.message : "Upload failed";
      onError?.(errorMessage);
    } finally {
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
          {!recordedBlob && isAuthenticated ? (
            <>
              {/* NEW: Upload button */}
              <Button
                variant="outlined"
                startIcon={<UploadFileIcon />}
                onClick={() => fileInputRef.current?.click()}
                sx={{ textTransform: "none" }}
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
                >
                  Start Recording
                </Button>
              ) : (
                <Button
                  variant="contained"
                  color="error"
                  startIcon={<StopIcon />}
                  onClick={handleStopRecording}
                  className="normal-case"
                >
                  Stop Recording
                </Button>
              )}
            </>
          ) : (
            <>
              <Button
                variant="contained"
                color="success"
                onClick={handleUploadToS3}
                disabled={isUploading}
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

              <Button variant="outlined" onClick={handleDiscard} className="normal-case">
                Discard
              </Button>
            </>
          )}
        </div>

        {isRecording && (
          <p className="text-center text-sm text-red-600 mt-2 animate-pulse">
            Recording in progress...
          </p>
        )}
      </div>
    </div>
  );
};

export default AudioRecorder;
