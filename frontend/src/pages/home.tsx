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
import ResponsiveAppBar from "../components/navbar.tsx";
import AudioRecorder from "../components/transcribeBar.tsx";
import ClinicalNoteViewer from "../components/ClinicalNoteViewer.tsx";
import api from "../lib/api.ts";
import { useStreamingTranscription } from "../hooks/use-streaming-transcription.ts";
import { getWebSocketUrl } from "../lib/websocket-url.ts";

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
    ...(patient.phone ? { contact: patient.phone } : {}),
  };
}

function getDoctorId(): string | null {
  try {
    const userStr = localStorage.getItem("ds_user") ?? sessionStorage.getItem("ds_user");
    if (userStr) {
      const user = JSON.parse(userStr);
      return user.id ?? null;
    }
  } catch (err) {
    console.error("Failed to get doctor ID:", err);
  }
  return null;
}

function isAuthenticated(): boolean {
  try {
    const token = localStorage.getItem("ds_token") ?? sessionStorage.getItem("ds_token");
    return Boolean(token);
  } catch {
    return false;
  }
}

export default function HomePage() {
  const navigate = useNavigate();
  const [currentNoteId, setCurrentNoteId] = useState<string | null>(null);
  const [isGeneratingNote, setIsGeneratingNote] = useState(false);
  const [isNoteReady, setIsNoteReady] = useState(false);
  const [queue, setQueue] = useState<IntakeCard[]>([]);
  const [queueLoading, setQueueLoading] = useState(false);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [activeIntakeId, setActiveIntakeId] = useState<string | null>(null);
  const [activePatientId, setActivePatientId] = useState<string | null>(null);
  const [activePatientDetails, setActivePatientDetails] = useState<Record<string, string> | null>(null);
  const [intakeRecordingError, setIntakeRecordingError] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  const {
    isRecording,
    isConnecting,
    isConnected,
    error: streamingError,
    startRecording,
    stopRecording,
    clearError,
  } = useStreamingTranscription({
    websocketUrl: getWebSocketUrl(),
    onError: (message) => setIntakeRecordingError(message),
    onSessionStart: (sessionId) => console.log("Intake session started:", sessionId),
    onSessionEnd: () => console.log("Intake session ended"),
  });

  useEffect(() => {
    const raw = localStorage.getItem("ds_user") ?? sessionStorage.getItem("ds_user");
    if (!raw) {
      setUserRole(null);
      return;
    }

    try {
      const user = JSON.parse(raw);
      setUserRole(user.role ?? "doctor");
    } catch {
      setUserRole(null);
    }
  }, []);

  const fetchQueue = useCallback(async () => {
    const raw = localStorage.getItem("ds_user") ?? sessionStorage.getItem("ds_user");
    if (!raw) return;

    try {
      const user = JSON.parse(raw);
      if (user.role === "receptionist") return;
    } catch {
      return;
    }

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
  }, []);

  useEffect(() => {
    fetchQueue();
    const intervalId = window.setInterval(fetchQueue, 5000);
    return () => window.clearInterval(intervalId);
  }, [fetchQueue]);

  const requestWakeLock = async () => {
    try {
      if ("wakeLock" in navigator) {
        wakeLockRef.current = await navigator.wakeLock.request("screen");
      }
    } catch {
      // Wake lock not supported or failed
    }
  };

  const releaseWakeLock = () => {
    if (wakeLockRef.current) {
      void wakeLockRef.current.release();
      wakeLockRef.current = null;
    }
  };

  const resetIntakeRecording = () => {
    setActiveIntakeId(null);
    setActivePatientId(null);
    setActivePatientDetails(null);
    setIntakeRecordingError(null);
    releaseWakeLock();
  };

  const handleNoteIdGenerated = (noteId: string) => {
    console.log("Note ID generated:", noteId);
    setCurrentNoteId(noteId);
    setIsGeneratingNote(true);
    setIsNoteReady(false);
  };

  const handleSessionStart = (sessionId: string) => {
    console.log("Session started:", sessionId);
  };

  const handleSessionEnd = () => {
    console.log("Session ended");
  };

  const handleNoteReady = () => {
    console.log("Clinical note ready");
    setIsNoteReady(true);
    setIsGeneratingNote(false);
    resetIntakeRecording();
  };

  const handleNoteSaved = () => {
    console.log("Note saved successfully");
    setCurrentNoteId(null);
    setIsNoteReady(false);
    setIsGeneratingNote(false);
    resetIntakeRecording();
    fetchQueue();
  };

  const handleNoteDiscarded = () => {
    console.log("Note discarded");
    setCurrentNoteId(null);
    setIsNoteReady(false);
    setIsGeneratingNote(false);
    resetIntakeRecording();
  };

  const handleStartRecording = async (options?: { resetIntakeOnFailure?: boolean }) => {
    if (!isAuthenticated()) {
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

  const handleStopRecording = async () => {
    try {
      const noteId = generateUUID();
      handleNoteIdGenerated(noteId);

      const doctorId = getDoctorId();
      if (!doctorId) {
        setIntakeRecordingError("Doctor ID not found. Please log in again.");
        return;
      }

      if (!activePatientDetails) {
        setIntakeRecordingError("Patient details missing. Please try again.");
        return;
      }

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

  return (
    <div className="min-h-screen">
      <ResponsiveAppBar />

      <main className="pt-20 pb-32 bg-gray-50 min-h-screen flex flex-col">
        <div className="flex-1 w-full">
          <div className="mb-6 px-4 md:px-8 max-w-3xl mx-auto text-center">
            <h1 className="text-3xl font-bold">Welcome</h1>
            <p className="text-gray-700">
              Record an audio note using the bar below. The clinical note will appear
              in real-time as you speak.
            </p>
          </div>

          {userRole !== "receptionist" && !currentNoteId && (
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
                              label={isActive ? (isRecording ? "Recording" : "Connecting") : "Pending"}
                            />
                          </div>

                          <div className="flex flex-wrap gap-2 mt-3">
                            {patient.gender && <Chip size="small" label={`Gender: ${patient.gender}`} />}
                            {patient.age && <Chip size="small" label={`Age: ${patient.age}`} />}
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
                                    <Typography variant="body2" className="text-red-600 animate-pulse">
                                      Recording in progress… Speak clearly into your microphone.
                                    </Typography>
                                    <Button
                                      variant="contained"
                                      color="error"
                                      size="small"
                                      startIcon={<StopIcon />}
                                      onClick={() => void handleStopRecording()}
                                      disabled={isGeneratingNote}
                                      sx={{ textTransform: "none", alignSelf: "flex-start" }}
                                    >
                                      Stop Recording
                                    </Button>
                                  </>
                                ) : (
                                  <div className="flex items-center gap-2">
                                    <CircularProgress size={18} />
                                    <Typography variant="body2" color="text.secondary">
                                      {isConnecting || !isConnected ? "Connecting…" : "Starting microphone…"}
                                    </Typography>
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

          {currentNoteId && (
            <div className="px-4 md:px-8 max-w-3xl mx-auto">
              <ClinicalNoteViewer
                noteId={currentNoteId}
                className="w-full"
                initialPatientDetails={activePatientDetails ?? undefined}
                onNoteReady={handleNoteReady}
                onNoteSaved={handleNoteSaved}
                onNoteDiscarded={handleNoteDiscarded}
              />
            </div>
          )}
        </div>
      </main>

      {userRole !== "receptionist" && !activeIntakeId && !currentNoteId && (
        <AudioRecorder
          websocketUrl={getWebSocketUrl()}
          isGeneratingNote={isGeneratingNote}
          isNoteReady={isNoteReady}
          onSessionStart={handleSessionStart}
          onSessionEnd={handleSessionEnd}
          onNoteIdGenerated={handleNoteIdGenerated}
        />
      )}
    </div>
  );
}
