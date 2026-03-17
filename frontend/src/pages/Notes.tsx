import { useEffect, useState, useMemo, useRef } from "react";
import api from "../lib/api";
import {
  Card,
  CardContent,
  Typography,
  Chip,
  CircularProgress,
  TextField,
  InputAdornment,
  MenuItem,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import EditIcon from "@mui/icons-material/Edit";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import PrintIcon from "@mui/icons-material/Print";
import SaveIcon from "@mui/icons-material/Save";
import CloseIcon from "@mui/icons-material/Close";
import ResponsiveAppBar from "../components/navbar";

type ClinicalNote = {
  id: string;
  createdAt: string;
  patient: {
    fullName: string;
  };
  medicalHistory: string;
  problemsFaced: string;
  doctorInstructions: string;
  medicationPrescribed: string;
  patientDetails?: Record<string, string>;
};

const parseText = (v: string) => {
  try {
    const parsed = JSON.parse(v);
    return Array.isArray(parsed) ? parsed.join(", ") : parsed;
  } catch {
    return v;
  }
};

export default function NotesPage() {
  const [notes, setNotes] = useState<ClinicalNote[]>([]);
  const [loading, setLoading] = useState(true);
  const noteRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Search, Filter, and Sort State
  const [search, setSearch] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [sortOrder, setSortOrder] = useState<"latest" | "earliest">("latest");

  // Edit dialog state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<ClinicalNote | null>(null);
  const [saving, setSaving] = useState(false);
  const [editForm, setEditForm] = useState({
    medicalHistory: "",
    problemsFaced: "",
    doctorInstructions: "",
    medicationPrescribed: "",
  });

  useEffect(() => {
    api.get("/api/clinical-notes")
      .then((res) => setNotes(res.data))
      .finally(() => setLoading(false));
  }, []);

  // Handle URL hash for scrolling to specific note
  useEffect(() => {
    const hash = window.location.hash.slice(1); // Remove # from hash
    if (hash && noteRefs.current[hash]) {
      setTimeout(() => {
        noteRefs.current[hash]?.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'center' 
        });
        // Highlight the note briefly
        const element = noteRefs.current[hash];
        if (element) {
          element.style.transition = 'background-color 0.3s';
          element.style.backgroundColor = '#fef3c7';
          setTimeout(() => {
            element.style.backgroundColor = '';
          }, 2000);
        }
      }, 100);
    }
  }, [notes]);

  // Edit handlers
  const handleEditNote = (note: ClinicalNote) => {
    setEditingNote(note);
    setEditForm({
      medicalHistory: note.medicalHistory,
      problemsFaced: note.problemsFaced,
      doctorInstructions: note.doctorInstructions,
      medicationPrescribed: note.medicationPrescribed,
    });
    setEditDialogOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!editingNote) return;
    
    setSaving(true);
    try {
      await api.patch(`/api/clinical-notes/${editingNote.id}`, editForm);
      
      // Update local state
      setNotes(notes.map(note => 
        note.id === editingNote.id 
          ? { ...note, ...editForm }
          : note
      ));
      
      setEditDialogOpen(false);
      setEditingNote(null);
    } catch (error) {
      console.error('Failed to update note:', error);
    } finally {
      setSaving(false);
    }
  };

  const handlePrintPdf = async (noteId: string) => {
    try {
      // Get the PDF as a blob
      const response = await api.get(`/api/clinical-notes/${noteId}/pdf`, {
        responseType: 'blob'
      });
      
      // Check if response is actually a PDF
      const contentType = response.headers['content-type'];
      if (contentType && contentType.includes('application/pdf')) {
        // Create blob URL
        const blob = new Blob([response.data], { type: 'application/pdf' });
        const url = window.URL.createObjectURL(blob);
        
        // Open in new window
        const printWindow = window.open(url, '_blank');
        
        if (printWindow) {
          printWindow.onload = () => {
            // Trigger print dialog after PDF loads
            setTimeout(() => {
              printWindow.print();
            }, 500);
          };
          
          // Clean up URL after printing
          printWindow.onafterprint = () => {
            printWindow.close();
            window.URL.revokeObjectURL(url);
          };
          
          // Fallback cleanup in case onafterprint doesn't fire
          setTimeout(() => {
            if (!printWindow.closed) {
              window.URL.revokeObjectURL(url);
            }
          }, 10000);
        } else {
          // Fallback: if popup is blocked, download instead
          const a = document.createElement('a');
          a.href = url;
          a.download = `clinical_note_${noteId}.pdf`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          window.URL.revokeObjectURL(url);
          alert('Popup was blocked. PDF downloaded instead.');
        }
      } else {
        const errorText = await response.data.text();
        console.error('Server returned non-PDF response:', errorText);
        alert('Failed to generate PDF for printing. Please try again later.');
      }
    } catch (error: any) {
      console.error('Failed to print PDF:', error);
      
      if (error.response?.data instanceof Blob) {
        try {
          const errorText = await error.response.data.text();
          const errorObj = JSON.parse(errorText);
          alert(`PDF generation failed: ${errorObj.message || errorObj.error || 'Unknown error'}`);
        } catch {
          alert('PDF generation failed. Please try again later.');
        }
      } else {
        alert(`PDF generation failed: ${error.message || 'Unknown error'}`);
      }
    }
  };

  const handleDownloadPdf = async (noteId: string) => {
    try {
      const response = await api.get(`/api/clinical-notes/${noteId}/pdf`, {
        responseType: 'blob'
      });
      
      // Check if response is actually a PDF (content-type)
      const contentType = response.headers['content-type'];
      if (contentType && contentType.includes('application/pdf')) {
        const blob = new Blob([response.data], { type: 'application/pdf' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `clinical_note_${noteId}.pdf`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      } else {
        // If it's not a PDF, it's probably an error response
        const errorText = await response.data.text();
        console.error('Server returned non-PDF response:', errorText);
        alert('Failed to generate PDF. Please try again later.');
      }
    } catch (error: any) {
      console.error('Failed to download PDF:', error);
      
      // Try to extract error message if it's a blob
      if (error.response?.data instanceof Blob) {
        try {
          const errorText = await error.response.data.text();
          const errorObj = JSON.parse(errorText);
          alert(`PDF generation failed: ${errorObj.message || errorObj.error || 'Unknown error'}`);
        } catch {
          alert('PDF generation failed. Please try again later.');
        }
      } else {
        alert(`PDF generation failed: ${error.message || 'Unknown error'}`);
      }
    }
  };

  // Filter AND Sort Logic
  const filteredNotes = useMemo(() => {
    return notes
      .filter((n) => {
        // 1. Search Filter
        const searchLower = search.toLowerCase();
        const matchesSearch =
          search === "" ||
          n.patient.fullName.toLowerCase().includes(searchLower) ||
          n.medicalHistory.toLowerCase().includes(searchLower) ||
          n.problemsFaced.toLowerCase().includes(searchLower) ||
          n.doctorInstructions.toLowerCase().includes(searchLower) ||
          n.medicationPrescribed.toLowerCase().includes(searchLower);

        // 2. Date Filter
        const noteDate = new Date(n.createdAt).toISOString().split("T")[0];
        const matchesDate = selectedDate === "" || noteDate === selectedDate;

        return matchesSearch && matchesDate;
      })
      .sort((a, b) => {
        // 3. Sorting Logic
        const dateA = new Date(a.createdAt).getTime();
        const dateB = new Date(b.createdAt).getTime();
        return sortOrder === "latest" ? dateB - dateA : dateA - dateB;
      });
  }, [notes, search, selectedDate, sortOrder]);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-[70vh]">
        <CircularProgress />
      </div>
    );
  }

  return (
    <>
      <ResponsiveAppBar />

      <div className="pt-20 min-h-screen bg-slate-50 px-8 py-6">
        <div className="max-w-6xl mx-auto">
          {/* Header Section */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
            <Typography variant="h5" className="font-semibold text-slate-800">
              Clinical Notes
            </Typography>

            {/* Controls Container */}
            <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
              {/* Search Input */}
              <TextField
                placeholder="Search..."
                size="small"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="bg-white"
                sx={{ minWidth: 200 }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon className="text-slate-400" />
                    </InputAdornment>
                  ),
                }}
              />

              {/* Date Filter */}
              <TextField
                type="date"
                size="small"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="bg-white"
                sx={{ minWidth: 150 }}
              />

              {/* Sort Dropdown */}
              <TextField
                select
                size="small"
                value={sortOrder}
                onChange={(e) =>
                  setSortOrder(e.target.value as "latest" | "earliest")
                }
                className="bg-white"
                sx={{ minWidth: 140 }}
              >
                <MenuItem value="latest">Latest First</MenuItem>
                <MenuItem value="earliest">Oldest First</MenuItem>
              </TextField>
            </div>
          </div>

          {/* Cards Grid */}
          <div className="grid grid-cols-1 gap-6">
            {filteredNotes.map((n) => (
              <Card
                key={n.id}
                ref={(el) => { noteRefs.current[n.id] = el; }}
                className="
                    rounded-3xl 
                    border border-slate-200 
                    bg-white 
                    shadow-sm 
                    hover:shadow-md 
                    transition 
                    overflow-hidden
                "
              >
                <div className="bg-gradient-to-r from-indigo-50 to-cyan-50 px-6 py-3 border-b">
                  <div className="flex items-center justify-between">
                    <div>
                      <Typography className="font-semibold text-lg text-slate-800">
                        {n.patient.fullName}
                      </Typography>
                      <Typography variant="caption" className="text-slate-500">
                        Clinical Visit
                      </Typography>
                    </div>

                    <div className="flex items-center gap-2">
                      <Chip
                        label={new Date(n.createdAt).toLocaleDateString()}
                        size="small"
                        className="bg-indigo-100 text-indigo-700"
                      />
                      <IconButton
                        size="small"
                        onClick={() => handleEditNote(n)}
                        className="text-blue-600 hover:bg-blue-50"
                        title="Edit note"
                      >
                        <EditIcon fontSize="small" />
                      </IconButton>
                      <IconButton
                        size="small"
                        onClick={() => handlePrintPdf(n.id)}
                        className="text-green-600 hover:bg-green-50"
                        title="Print PDF"
                      >
                        <PrintIcon fontSize="small" />
                      </IconButton>
                      <IconButton
                        size="small"
                        onClick={() => handleDownloadPdf(n.id)}
                        className="text-red-600 hover:bg-red-50"
                        title="Download PDF"
                      >
                        <PictureAsPdfIcon fontSize="small" />
                      </IconButton>
                    </div>
                  </div>
                </div>

                <CardContent className="space-y-5 px-6 py-5">
                  <MedicalBlock title="Medical History" value={n.medicalHistory} />
                  <MedicalBlock title="Problems Faced" value={n.problemsFaced} />
                  <MedicalBlock
                    title="Doctor Instructions"
                    value={n.doctorInstructions}
                  />
                  <MedicalBlock
                    title="Medication Prescribed"
                    value={n.medicationPrescribed}
                  />
                </CardContent>
              </Card>
            ))}
          </div>

          {filteredNotes.length === 0 && (
            <div className="text-center text-slate-500 mt-20">
              No notes match your filters
            </div>
          )}
        </div>
      </div>

      {/* Edit Dialog */}
      <Dialog 
        open={editDialogOpen} 
        onClose={() => setEditDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle className="flex items-center justify-between">
          Edit Clinical Note
          <IconButton onClick={() => setEditDialogOpen(false)} size="small">
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent className="space-y-4">
          <TextField
            label="Medical History"
            multiline
            rows={3}
            fullWidth
            value={editForm.medicalHistory}
            onChange={(e) => setEditForm(prev => ({ ...prev, medicalHistory: e.target.value }))}
          />
          <TextField
            label="Problems Faced"
            multiline
            rows={3}
            fullWidth
            value={editForm.problemsFaced}
            onChange={(e) => setEditForm(prev => ({ ...prev, problemsFaced: e.target.value }))}
          />
          <TextField
            label="Doctor Instructions"
            multiline
            rows={3}
            fullWidth
            value={editForm.doctorInstructions}
            onChange={(e) => setEditForm(prev => ({ ...prev, doctorInstructions: e.target.value }))}
          />
          <TextField
            label="Medication Prescribed"
            multiline
            rows={3}
            fullWidth
            value={editForm.medicationPrescribed}
            onChange={(e) => setEditForm(prev => ({ ...prev, medicationPrescribed: e.target.value }))}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialogOpen(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleSaveEdit} 
            variant="contained" 
            disabled={saving}
            startIcon={<SaveIcon />}
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

function MedicalBlock({ title, value }: { title: string; value: string }) {
  const parsed = parseText(value);

  return (
    <div className="rounded-xl bg-slate-50 border px-4 py-3">
      <Typography className="text-xs uppercase tracking-wide text-indigo-600 font-semibold mb-1">
        {title}
      </Typography>

      <Typography className="whitespace-pre-line text-sm text-slate-700 leading-relaxed">
        {parsed}
      </Typography>
    </div>
  );
}
