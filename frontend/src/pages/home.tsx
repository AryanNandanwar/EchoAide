// pages/HomePage.tsx
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Alert,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Typography,
} from "@mui/material";
import RefreshIcon from "@mui/icons-material/Refresh";
import StopIcon from "@mui/icons-material/Stop";
import PauseIcon from "@mui/icons-material/Pause";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import AudioRecorder from "../components/transcribeBar.tsx";
import ClinicalNoteViewer from "../components/ClinicalNoteViewer.tsx";
import api from "../lib/api.ts";
import { ensureValidAccessToken, getStoredUser } from "../lib/auth.ts";
import { useRequireAuth } from "../hooks/use-require-auth.ts";
import { useStreamingTranscription } from "../hooks/use-streaming-transcription.ts";
import { getWebSocketUrl } from "../lib/websocket-url.ts";
import { noteSkipReasonToMessage } from "../utils/recording-status.ts";
import { usePendingClinicalNote } from "../context/pending-clinical-note-context.tsx";

type IntakeCard = {
  id: string;
  patientId: string;
  status: "pending" | "in_progress" | "completed" | "cancelled";
  createdAt: string;
  patient: {
    id: string;
    fullName: string;
    gender?: string;
    age?: string;
    weight?: string;
    phone?: string;
  };
};

function generateUUID() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function intakePatientToDetails(patient: IntakeCard["patient"]): Record<string, string> {
  return {
    name: patient.fullName,
    ...(patient.gender ? { gender: patient.gender } : {}),
    ...(patient.age ? { age: patient.age } : {}),
    ...(patient.weight ? { weight: patient.weight } : {}),
    ...(patient.phone ? { contact: patient.phone } : {}),
  };
}

function getDoctorId(): string | null {
  const user = getStoredUser();
  return user?.id ?? null;
}

/**
 * UI dev preview — shown on home when `npm run dev` (import.meta.env.DEV).
 * Set to null before committing. Override via VITE_DEV_PREVIEW_NOTE_ID in .env.
 */
const DEV_PREVIEW_NOTE_ID_HARDCODED: string | null =
  null;

const isLocalUiPreview =
  import.meta.env.DEV || import.meta.env.VITE_DEV === "true";

const devPreviewNoteId: string | undefined = isLocalUiPreview
  ? import.meta.env.VITE_DEV_PREVIEW_NOTE_ID ||
    DEV_PREVIEW_NOTE_ID_HARDCODED ||
    undefined
  : undefined;

export default function HomePage() {
  const navigate = useNavigate();
  const { authorized } = useRequireAuth({
    requiredRole: "doctor",
    wrongRoleRedirect: "/receptionist/intake",
  });
  const {
    noteId: pendingNoteId,
    isGenerating: isGeneratingNote,
    isReady: isNoteReady,
    beginNote,
    markNoteReady,
    clearPendingNote,
    abortNoteGeneration,
    registerOnNoteSaved,
  } = usePendingClinicalNote();
  const viewerNoteId = pendingNoteId ?? devPreviewNoteId;
  const [queue, setQueue] = useState<IntakeCard[]>([]);
  const [queueLoading, setQueueLoading] = useState(false);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [activeIntakeId, setActiveIntakeId] = useState<string | null>(null);
  const [activePatientId, setActivePatientId] = useState<string | null>(null);
  const [activePatientDetails, setActivePatientDetails] = useState<Record<string, string> | null>(null);
  const [intakeRecordingError, setIntakeRecordingError] = useState<string | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  const releaseWakeLock = () => {
    if (wakeLockRef.current) {
      void wakeLockRef.current.release();
      wakeLockRef.current = null;
    }
  };

  const resetIntakeRecording = useCallback(() => {
    setActiveIntakeId(null);
    setActivePatientId(null);
    setActivePatientDetails(null);
    setIntakeRecordingError(null);
    releaseWakeLock();
  }, []);

  const handleNoteGenerationAborted = useCallback((reason: string) => {
    if (!devPreviewNoteId) abortNoteGeneration();
    resetIntakeRecording();
    setIntakeRecordingError(noteSkipReasonToMessage(reason));
  }, [abortNoteGeneration, devPreviewNoteId, resetIntakeRecording]);

  const {
    isRecording,
    isPaused,
    isConnecting,
    isConnected,
    error: streamingError,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    cancelRecording,
    clearError,
  } = useStreamingTranscription({
    websocketUrl: getWebSocketUrl(),
    onError: (message) => setIntakeRecordingError(message),
    onSessionStart: (sessionId) => console.log("Intake session started:", sessionId),
    onSessionEnd: () => console.log("Intake session ended"),
    onNoteGenerationSkipped: ({ reason }) => handleNoteGenerationAborted(reason),
    onNoteGenerationFailed: ({ reason }) => handleNoteGenerationAborted(reason),
  });

  const fetchQueue = useCallback(async () => {
    if (!authorized) return;

    setQueueLoading(true);
    setQueueError(null);
    try {
      const response = await api.get("/api/intake/queue?status=pending");
      setQueue(response.data);
    } catch (error: any) {
      if (error?.response?.status !== 401 && error?.response?.status !== 403) {
        setQueueError(error?.response?.data?.message || "Failed to load intake queue.");
      }
    } finally {
      setQueueLoading(false);
    }
  }, [authorized]);

  useEffect(() => {
    if (!authorized) return;

    fetchQueue();
    const intervalId = window.setInterval(fetchQueue, 5000);
    return () => window.clearInterval(intervalId);
  }, [authorized, fetchQueue]);

  const requestWakeLock = async () => {
    try {
      if ("wakeLock" in navigator) {
        wakeLockRef.current = await navigator.wakeLock.request("screen");
      }
    } catch {
      // Wake lock not supported or failed
    }
  };

  useEffect(() => {
    return registerOnNoteSaved(() => {
      void fetchQueue();
    });
  }, [registerOnNoteSaved, fetchQueue]);

  const handleNoteIdGenerated = (noteId: string) => {
    console.log("Note ID generated:", noteId);
    beginNote(noteId, activePatientDetails ?? undefined);
  };

  const handleSessionStart = (sessionId: string) => {
    console.log("Session started:", sessionId);
  };

  const handleSessionEnd = () => {
    console.log("Session ended");
  };

  const handleNoteReady = () => {
    console.log("Clinical note ready");
    markNoteReady();
    resetIntakeRecording();
  };

  const handleNoteSaved = () => {
    console.log("Note saved successfully");
    if (!devPreviewNoteId) clearPendingNote({ saved: true });
    resetIntakeRecording();
  };

  const handleNoteDiscarded = () => {
    console.log("Note discarded");
    if (!devPreviewNoteId) clearPendingNote();
    resetIntakeRecording();
  };

  const handleStartRecording = async (options?: { resetIntakeOnFailure?: boolean }) => {
    const token = await ensureValidAccessToken();
    if (!token) {
      setIntakeRecordingError("Please log in to start recording.");
      navigate("/login");
      return;
    }

    try {
      await requestWakeLock();
      clearError();
      setIntakeRecordingError(null);
      await startRecording();
      console.log("Recording started");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to start recording";
      setIntakeRecordingError(msg);
      releaseWakeLock();
      if (options?.resetIntakeOnFailure) {
        resetIntakeRecording();
      }
    }
  };

  const handleCancelRecording = async () => {
    try {
      await cancelRecording();
      if (!devPreviewNoteId) clearPendingNote();
      resetIntakeRecording();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to cancel recording";
      setIntakeRecordingError(msg);
    }
  };

  const handleStopRecording = async () => {
    try {
      const noteId = generateUUID();

      const doctorId = getDoctorId();
      if (!doctorId) {
        setIntakeRecordingError("Doctor ID not found. Please log in again.");
        return;
      }

      if (!activePatientDetails) {
        setIntakeRecordingError("Patient details missing. Please try again.");
        return;
      }

      beginNote(noteId, activePatientDetails);

      console.log("Stopping intake recording with data:", {
        noteId,
        doctorId,
        patientId: activePatientId,
        intakeId: activeIntakeId,
        patientDetails: activePatientDetails,
      });

      stopRecording(noteId, doctorId, {
        patientId: activePatientId ?? undefined,
        intakeId: activeIntakeId ?? undefined,
        patientDetails: activePatientDetails,
      });
      releaseWakeLock();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to stop recording";
      setIntakeRecordingError(msg);
    }
  };

  const handleIntakeRecord = async (intake: IntakeCard) => {
    if (activeIntakeId) return;

    const patient = intake.patient;
    setActiveIntakeId(intake.id);
    setActivePatientId(patient.id);
    setActivePatientDetails(intakePatientToDetails(patient));
    setIntakeRecordingError(null);

    await handleStartRecording({ resetIntakeOnFailure: true });
  };

  const cancelIntake = async (intakeId: string) => {
    try {
      await api.patch(`/api/intake/${intakeId}/status`, { status: "cancelled" });
      fetchQueue();
    } catch (error) {
      console.error("Failed to cancel intake:", error);
    }
  };

  const displayRecordingError = intakeRecordingError || streamingError;

  if (!authorized) {
    return null;
  }

  return (
    <>
      <main className="pb-32 min-h-screen flex flex-col">
        <div className="flex-1 w-full">
          <div className="mb-6 px-4 md:px-8 max-w-3xl mx-auto text-center pt-4">
            <h1 className="text-3xl font-bold">Welcome</h1>
            <p className="text-gray-700">
              Record an audio note using the bar below. The clinical note will appear
              in real-time as you speak.
            </p>
          </div>

          {intakeRecordingError && !viewerNoteId && (
            <Alert severity="warning" className="mx-4 md:mx-8 max-w-3xl mb-4">
              {intakeRecordingError}
            </Alert>
          )}

          {devPreviewNoteId && !pendingNoteId && (
            <Alert severity="info" className="mx-4 md:mx-8 max-w-3xl mb-4">
              Dev preview: Clinical Note Viewer (note {devPreviewNoteId.slice(0, 8)}…)
            </Alert>
          )}

          {devPreviewNoteId && !pendingNoteId && (
            <div className="px-4 md:px-8 max-w-3xl mx-auto mb-8">
              <ClinicalNoteViewer
                noteId={devPreviewNoteId}
                className="w-full"
                onNoteReady={handleNoteReady}
                onNoteSaved={handleNoteSaved}
                onNoteDiscarded={handleNoteDiscarded}
              />
            </div>
          )}

          {!viewerNoteId && (
            <section className="px-4 md:px-8 max-w-5xl mx-auto mb-8 w-full">
              <div className="flex items-center justify-between gap-4 mb-3">
                <Typography variant="h6" className="font-semibold text-slate-800">
                  Waiting Queue
                </Typography>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={queueLoading ? <CircularProgress size={14} /> : <RefreshIcon />}
                  onClick={fetchQueue}
                  disabled={queueLoading}
                  sx={{ textTransform: "none" }}
                >
                  Refresh
                </Button>
              </div>

              {queueError && <Alert severity="error" className="mb-3">{queueError}</Alert>}

              {queue.length === 0 ? (
                <Card className="border shadow-sm">
                  <CardContent>
                    <Typography variant="body2" color="text.secondary">
                      No patients waiting.
                    </Typography>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {queue.map((intake) => {
                    const patient = intake.patient;
                    const isActive = activeIntakeId === intake.id;

                    return (
                      <Card key={intake.id} className="border shadow-sm">
                        <CardContent>
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <Typography variant="h6" className="text-slate-900">
                                {patient.fullName}
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                Added {new Date(intake.createdAt).toLocaleTimeString()}
                              </Typography>
                            </div>
                            <Chip
                              size="small"
                              color={isActive ? "warning" : "default"}
                              label={
                                isActive
                                  ? isPaused
                                    ? "Paused"
                                    : isRecording
                                      ? "Recording"
                                      : "Connecting"
                                  : "Pending"
                              }
                            />
                          </div>

                          <div className="flex flex-wrap gap-2 mt-3">
                            {patient.gender && <Chip size="small" label={`Gender: ${patient.gender}`} />}
                            {patient.age && <Chip size="small" label={`Age: ${patient.age}`} />}
                            {patient.weight && <Chip size="small" label={`Weight: ${patient.weight}`} />}
                            {patient.phone && <Chip size="small" label={`Contact: ${patient.phone}`} />}
                          </div>

                          <div className="mt-4 space-y-2">
                            {isActive && displayRecordingError && (
                              <Alert severity="error" className="text-sm">
                                {displayRecordingError}
                              </Alert>
                            )}

                            {isActive ? (
                              <div className="flex flex-col gap-2">
                                {isRecording ? (
                                  <>
                                    <Typography
                                      variant="body2"
                                      className={isPaused ? "text-amber-700" : "text-red-600 animate-pulse"}
                                    >
                                      {isPaused
                                        ? "Recording paused. Resume when you are ready to continue."
                                        : "Recording in progress… Speak clearly into your microphone."}
                                    </Typography>
                                    <div className="flex flex-wrap gap-2">
                                      {isPaused ? (
                                        <Button
                                          variant="contained"
                                          color="primary"
                                          size="small"
                                          startIcon={<PlayArrowIcon />}
                                          onClick={() => resumeRecording()}
                                          disabled={isGeneratingNote}
                                          sx={{ textTransform: "none" }}
                                        >
                                          Resume
                                        </Button>
                                      ) : (
                                        <Button
                                          variant="outlined"
                                          color="primary"
                                          size="small"
                                          startIcon={<PauseIcon />}
                                          onClick={() => pauseRecording()}
                                          disabled={isGeneratingNote}
                                          sx={{ textTransform: "none" }}
                                        >
                                          Pause
                                        </Button>
                                      )}
                                      <Button
                                        variant="contained"
                                        color="error"
                                        size="small"
                                        startIcon={<StopIcon />}
                                        onClick={() => void handleStopRecording()}
                                        disabled={isGeneratingNote}
                                        sx={{ textTransform: "none" }}
                                      >
                                        Stop Recording
                                      </Button>
                                      <Button
                                        variant="outlined"
                                        color="inherit"
                                        size="small"
                                        onClick={() => void handleCancelRecording()}
                                        disabled={isGeneratingNote}
                                        sx={{ textTransform: "none" }}
                                      >
                                        Cancel
                                      </Button>
                                    </div>
                                  </>
                                ) : (
                                  <div className="flex flex-col gap-2">
                                    <div className="flex items-center gap-2">
                                      <CircularProgress size={18} />
                                      <Typography variant="body2" color="text.secondary">
                                        {isConnecting || !isConnected ? "Connecting…" : "Starting microphone…"}
                                      </Typography>
                                    </div>
                                    <Button
                                      variant="outlined"
                                      color="inherit"
                                      size="small"
                                      onClick={() => void handleCancelRecording()}
                                      disabled={isGeneratingNote}
                                      sx={{ textTransform: "none", alignSelf: "flex-start" }}
                                    >
                                      Cancel
                                    </Button>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="flex gap-2">
                                <Button
                                  variant="contained"
                                  size="small"
                                  onClick={() => void handleIntakeRecord(intake)}
                                  disabled={Boolean(activeIntakeId) || isConnecting}
                                  sx={{ textTransform: "none" }}
                                >
                                  Record
                                </Button>
                                <Button
                                  variant="outlined"
                                  color="error"
                                  size="small"
                                  onClick={() => cancelIntake(intake.id)}
                                  disabled={Boolean(activeIntakeId)}
                                  sx={{ textTransform: "none" }}
                                >
                                  Cancel
                                </Button>
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </section>
          )}

        </div>
      </main>

      {!activeIntakeId && !viewerNoteId && (
        <AudioRecorder
          websocketUrl={getWebSocketUrl()}
          onError={(message) => setIntakeRecordingError(message)}
          isGeneratingNote={isGeneratingNote}
          isNoteReady={isNoteReady}
          onSessionStart={handleSessionStart}
          onSessionEnd={handleSessionEnd}
          onNoteIdGenerated={handleNoteIdGenerated}
          onNoteGenerationSkipped={({ reason }) => handleNoteGenerationAborted(reason)}
          onNoteGenerationFailed={({ reason }) => handleNoteGenerationAborted(reason)}
        />
      )}
    </>
  );
}
