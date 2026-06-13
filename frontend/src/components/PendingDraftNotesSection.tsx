import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Button,
  Card,
  CardActionArea,
  CardContent,
  Chip,
  CircularProgress,
  Typography,
} from "@mui/material";
import RefreshIcon from "@mui/icons-material/Refresh";
import api from "../lib/api";
import {
  getClinicalNotePatientLabel,
  getClinicalNotePreview,
  parsePatientDetails,
} from "../utils/clinical-note-record";

type DraftClinicalNote = {
  id: string;
  createdAt: string;
  status: string;
  patientDetails?: unknown;
  problemsFaced?: unknown;
  patient?: {
    fullName?: string;
  } | null;
};

type Props = {
  activeNoteId?: string | null;
  onOpenNote: (noteId: string, patientDetails?: Record<string, string>) => void;
  refreshToken?: number;
};

export default function PendingDraftNotesSection({
  activeNoteId,
  onOpenNote,
  refreshToken = 0,
}: Props) {
  const [notes, setNotes] = useState<DraftClinicalNote[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDraftNotes = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get("/api/clinical-notes?status=Draft");
      setNotes(response.data);
    } catch (fetchError: any) {
      if (fetchError?.response?.status !== 401 && fetchError?.response?.status !== 403) {
        setError(fetchError?.response?.data?.message || "Failed to load pending notes.");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchDraftNotes();
  }, [fetchDraftNotes, refreshToken]);

  const visibleNotes = notes.filter((note) => note.id !== activeNoteId);

  return (
    <section className="px-4 md:px-8 max-w-5xl mx-auto mb-8 w-full">
      <div className="flex items-center justify-between gap-4 mb-3">
        <Typography variant="h6" className="font-semibold text-slate-800">
          Complete your pending notes
        </Typography>
        <Button
          size="small"
          variant="outlined"
          startIcon={loading ? <CircularProgress size={14} /> : <RefreshIcon />}
          onClick={() => void fetchDraftNotes()}
          disabled={loading}
          sx={{ textTransform: "none" }}
        >
          Refresh
        </Button>
      </div>

      {error && <Alert severity="error" className="mb-3">{error}</Alert>}

      {loading && visibleNotes.length === 0 ? (
        <Card className="border shadow-sm">
          <CardContent className="flex items-center gap-3">
            <CircularProgress size={20} />
            <Typography variant="body2" color="text.secondary">
              Loading pending notes...
            </Typography>
          </CardContent>
        </Card>
      ) : visibleNotes.length === 0 ? (
        <Card className="border shadow-sm">
          <CardContent>
            <Typography variant="body2" color="text.secondary">
              You have no incomplete notes.
            </Typography>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {visibleNotes.map((note) => {
            const patientDetails = parsePatientDetails(note.patientDetails);
            const patientName = getClinicalNotePatientLabel(
              note.patientDetails,
              note.patient?.fullName,
            );
            const preview = getClinicalNotePreview(note.problemsFaced);

            return (
              <Card key={note.id} className="border shadow-sm hover:shadow-md transition-shadow">
                <CardActionArea
                  onClick={() => onOpenNote(note.id, patientDetails)}
                  sx={{ height: "100%" }}
                >
                  <CardContent>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Typography variant="h6" className="text-slate-900 truncate">
                          {patientName}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {new Date(note.createdAt).toLocaleString()}
                        </Typography>
                      </div>
                      <Chip size="small" color="warning" label="Draft" />
                    </div>

                    <Typography
                      variant="body2"
                      color="text.secondary"
                      className="mt-3 line-clamp-2"
                    >
                      {preview}
                    </Typography>
                  </CardContent>
                </CardActionArea>
              </Card>
            );
          })}
        </div>
      )}
    </section>
  );
}
