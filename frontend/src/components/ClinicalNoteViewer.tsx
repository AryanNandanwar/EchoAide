import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  Typography,
  Button,
  CircularProgress,
  TextField,
} from "@mui/material";
import SaveIcon from "@mui/icons-material/Save";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import PrintIcon from "@mui/icons-material/Print";
import RemoveIcon from "@mui/icons-material/Remove";
import IconButton from "@mui/material/IconButton";
import { type Medication } from "../types/clinical-note";
import api from "../lib/api";
import SnackbarToast from "./SnackbarToast";
import ConfirmDialog from "./ConfirmDialog";
import NoPatientFoundDialog from "./NoPatientFoundDialog";
import { type ParsedNote } from "../types/clinical-note";
import { useClinicalNoteSubscription } from "../hooks/use-clinical-note-subscription";
import {
  mapClinicalNoteRecordToParsedNote,
  mapApiClinicalNoteToParsedNote,
  mergePatientDetails,
  parsePatientDetails,
  parseStringContent,
} from "../utils/clinical-note-record";
import { printClinicalNotePdf } from "../utils/clinical-note-pdf.ts";
import { getNoteGenerationErrorMessage } from "../utils/recording-status.ts";

const patientDetailFields = [
  { key: 'name', label: 'Name' },
  { key: 'age', label: 'Age' },
  { key: 'gender', label: 'Gender' },
  { key: 'weight', label: 'Weight' },
  { key: 'contact', label: 'Contact' },
];

function itemToEditableString(item: unknown): string {
  if (item === null || item === undefined) return "";
  if (typeof item === "string") return item;
  if (typeof item === "number" || typeof item === "boolean") return String(item);
  if (Array.isArray(item)) return item.map(itemToEditableString).join(", ");
  if (typeof item === "object") {
    return Object.entries(item as Record<string, unknown>)
      .map(([key, val]) => `${key}: ${itemToEditableString(val)}`)
      .join(", ");
  }
  return String(item);
}

function medicationToEditableString(medication: string | Medication): string {
  if (typeof medication === "string") return medication;
  const parts: string[] = [];
  if (medication.name) parts.push(medication.name);
  if (medication.dosage) parts.push(`(${medication.dosage})`);
  if (medication.duration) parts.push(`for ${medication.duration}`);
  if (medication.instructions) parts.push(`- ${medication.instructions}`);
  if (medication.purpose) parts.push(`[${medication.purpose}]`);
  return parts.join(" ");
}

function normalizeFieldForEdit(value: unknown): string[] {
  if (Array.isArray(value)) {
    const items = value.map(itemToEditableString);
    return items.length > 0 ? items : [""];
  }
  if (typeof value === "object" && value !== null) {
    const items = Object.entries(value as Record<string, unknown>).map(
      ([key, val]) => `${key}: ${itemToEditableString(val)}`,
    );
    return items.length > 0 ? items : [""];
  }
  if (typeof value === "string" && value.trim()) {
    return [value];
  }
  return [""];
}

function normalizeMedicationsForEdit(
  medications: ParsedNote["medicationPrescribed"],
): string[] {
  if (!Array.isArray(medications) || medications.length === 0) return [""];
  return medications.map((med) =>
    typeof med === "string" ? med : medicationToEditableString(med),
  );
}

function getEditItems(items: string[] | undefined): string[] {
  return items && items.length > 0 ? items : [""];
}

type EditableStringArraySectionProps = {
  label: string;
  items: string[];
  onChange: (items: string[]) => void;
  placeholder?: string;
};

function EditableStringArraySection({
  label,
  items,
  onChange,
  placeholder,
}: EditableStringArraySectionProps) {
  const updateItem = (index: number, text: string) => {
    const next = [...items];
    next[index] = text;
    onChange(next);
  };

  const removeItem = (index: number) => {
    const next = items.filter((_, i) => i !== index);
    onChange(next.length > 0 ? next : [""]);
  };

  const addItem = () => {
    onChange([...items, ""]);
  };

  return (
    <div>
      <Typography variant="body2" className="w-32 font-medium text-gray-700 mb-2">
        {label}
      </Typography>
      <div className="space-y-2">
        {items.map((item, index) => (
          <div key={index} className="flex gap-2 items-center">
            <TextField
              fullWidth
              size="small"
              value={item}
              onChange={(e) => updateItem(index, e.target.value)}
              variant="outlined"
              placeholder={placeholder}
            />
            <IconButton
              size="small"
              onClick={() => removeItem(index)}
              disabled={items.length === 1 && item === ""}
              aria-label="Remove item"
            >
              <RemoveIcon fontSize="small" />
            </IconButton>
          </div>
        ))}
      </div>
      <Button
        size="small"
        onClick={addItem}
        sx={{ mt: 1, textTransform: "none" }}
      >
        Add item
      </Button>
    </div>
  );
}

type Props = {
  source?: ParsedNote; // Optional for new flow
  noteId?: string; // New prop for Supabase subscription flow
  className?: string;
  initialPatientDetails?: Record<string, string>;
  loadExisting?: boolean;
  onNoteReady?: () => void;
  onNoteSaved?: () => void;
  onNoteDiscarded?: () => void;
};

export default function ClinicalNoteViewer({
  source,
  noteId,
  className,
  initialPatientDetails,
  loadExisting = false,
  onNoteReady,
  onNoteSaved,
  onNoteDiscarded,
}: Props) {
  const [parsed, setParsed] = useState<ParsedNote | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Edit state
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editedValues, setEditedValues] = useState<ParsedNote | null>(null);

  // Snackbar state
  const [toastOpen, setToastOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [toastSeverity, setToastSeverity] = useState<"success" | "info" | "warning" | "error">("success");

  // Discard note confirm dialog
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false);
  
  // Patient search state
  const [patientSearchOpen, setPatientSearchOpen] = useState(false);
  const [noPatientFoundOpen, setNoPatientFoundOpen] = useState(false);
  const [foundPatient, setFoundPatient] = useState<any>(null);
  const [patientSearchLoading, setPatientSearchLoading] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [loadingExisting, setLoadingExisting] = useState(loadExisting);

  // Supabase subscription for newly generated notes
  useClinicalNoteSubscription({
    noteId: loadExisting ? undefined : noteId,
    onNoteGenerated: (note) => {
      console.log('📋 Clinical note received from Supabase:', note);
      const parsedNote = mapClinicalNoteRecordToParsedNote(note);
      parsedNote.patientDetails = mergePatientDetails(
        parsedNote.patientDetails,
        initialPatientDetails,
      );
      console.log('📋 Parsed note data:', parsedNote);
      console.log('📋 Patient Details:', parsedNote.patientDetails);
      console.log('📋 Medical History:', parsedNote.medicalHistory);
      console.log('📋 Problem Faced:', parsedNote.problemFaced);
      setParsed(parsedNote);
      setError(null);
      onNoteReady?.();
    },
    onError: (error) => {
      console.error('❌ Error in clinical note subscription:', error);
      setError(error.message);
    }
  });

  useEffect(() => {
    if (!loadExisting || !noteId) {
      return;
    }

    let cancelled = false;
    setLoadingExisting(true);
    setError(null);
    setParsed(null);

    api.get(`/api/clinical-notes/${noteId}`)
      .then((response) => {
        if (cancelled) return;

        const parsedNote = mapApiClinicalNoteToParsedNote(response.data);
        parsedNote.patientDetails = mergePatientDetails(
          parsedNote.patientDetails,
          initialPatientDetails,
        );
        setParsed(parsedNote);
        onNoteReady?.();
      })
      .catch((fetchError) => {
        if (cancelled) return;
        console.error("Error loading existing clinical note:", fetchError);
        setError(fetchError?.response?.data?.message || "Failed to load clinical note");
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingExisting(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [loadExisting, noteId, initialPatientDetails, onNoteReady]);

  useEffect(() => {
    // Handle new flow: noteId is handled by subscription hook
    if (noteId || loadExisting) {
      if (noteId && !loadExisting) {
        console.log('ClinicalNoteViewer: noteId provided, subscription hook will handle fetching:', noteId);
      }
      return;
    }

    // Handle old flow: use source prop
    console.log('ClinicalNoteViewer: source received:', source);
    console.log('ClinicalNoteViewer: current parsed state:', parsed);
    if (source && typeof source === 'object') {
      try {
        // Backend now sends data in the correct ParsedNote format
        // Just ensure we have proper defaults for missing fields
        const parsed: ParsedNote = {
          patientDetails: parsePatientDetails(source.patientDetails),
          medicalHistory: parseStringContent(source.medicalHistory),
          problemFaced: parseStringContent(source.problemFaced).join(', '),
          findings: parseStringContent(source.findings),
          diagnosis: parseStringContent(source.diagnosis),
          investigationsAdvised: parseStringContent(source.investigationsAdvised),
          doctorInstructions: parseStringContent(source.doctorInstructions),
          medicationPrescribed: parseStringContent(source.medicationPrescribed),
          raw: source.raw || JSON.stringify(source, null, 2)
        };
        
        console.log('ClinicalNoteViewer: parsed result from source:', parsed);
        setParsed(parsed);
        setError(null);
      } catch (error) {
        console.error('Error processing clinical note:', error);
        setError('Failed to process clinical note');
      }
    } else {
      console.log('ClinicalNoteViewer: No valid source data');
      setParsed(null);
    }
  }, [source, noteId, loadExisting]);

  // Cleanup effect
  useEffect(() => {
    return () => {
      // Component cleanup - any additional cleanup can go here
      console.log('ClinicalNoteViewer: Component cleanup');
    };
  }, []);

  
  // Helper functions
  const showToast = (message: string, severity: "success" | "info" | "warning" | "error") => {
    setToastMessage(message);
    setToastSeverity(severity);
    setToastOpen(true);
  };

  // Helper function to render nested objects properly
  const renderNestedValue = (value: any): string => {
    if (value === null || value === undefined) {
      return '';
    }
    
    if (typeof value === 'string') {
      return value;
    }
    
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    
    if (Array.isArray(value)) {
      return value.join(', ');
    }
    
    if (typeof value === 'object') {
      // Handle nested objects by converting to readable string
      const entries = Object.entries(value);
      if (entries.length === 0) return '';
      
      return entries
        .map(([key, val]) => {
          const renderedVal = renderNestedValue(val);
          return `${key}: ${renderedVal}`;
        })
        .join(', ');
    }
    
    return String(value);
  };

  const getPatientDetailValue = (details: Record<string, string> | undefined, key: string): string => {
    if (!details) return '';

    return details[key] ||
      details[key.charAt(0).toUpperCase() + key.slice(1)] ||
      details[key === 'name' ? 'Name' : key === 'age' ? 'Age' : key === 'gender' ? 'Gender' : key === 'weight' ? 'Weight' : key === 'contact' ? 'Contact' : ''] ||
      '';
  };

  const renderArraySection = (items: unknown) => {
    if (!Array.isArray(items) || items.length === 0) {
      return <Typography variant="body2" className="mt-2">&nbsp;</Typography>;
    }

    return (
      <div className="mt-2">
        {items.map((item, index) => (
          <Typography key={index} variant="body2" className="mb-1">
            • {renderNestedValue(item)}
          </Typography>
        ))}
      </div>
    );
  };

  const renderFlexibleSection = (value: unknown) => {
    if (Array.isArray(value)) {
      return renderArraySection(value);
    }

    if (!value) {
      return <Typography variant="body2" className="mt-2">&nbsp;</Typography>;
    }

    if (typeof value === 'object') {
      const entries = Object.entries(value);
      if (entries.length === 0) {
        return <Typography variant="body2" className="mt-2">&nbsp;</Typography>;
      }

      return (
        <div className="mt-2">
          {entries.map(([key, entryValue]) => (
            <Typography key={key} variant="body2" className="mb-1">
              • <strong>{key}:</strong> {renderNestedValue(entryValue)}
            </Typography>
          ))}
        </div>
      );
    }

    return (
      <Typography variant="body2" className="mt-2">
        {String(value)}
      </Typography>
    );
  };

  const renderMedicationSection = (medications: ParsedNote['medicationPrescribed']) => {
    if (!Array.isArray(medications) || medications.length === 0) {
      return <Typography variant="body2" className="mt-2">&nbsp;</Typography>;
    }

    return (
      <div className="mt-2">
        {medications.map((medication, index) => (
          <Typography key={index} variant="body2" className="mb-1">
            {typeof medication === 'string'
              ? `• ${medication}`
              : typeof medication === 'object' && medication !== null
                ? (() => {
                    const parts = [];
                    if (medication.name) parts.push(medication.name);
                    if (medication.dosage) parts.push(`(${medication.dosage})`);
                    if (medication.duration) parts.push(`for ${medication.duration}`);
                    if (medication.instructions) parts.push(`- ${medication.instructions}`);
                    if (medication.purpose) parts.push(`[${medication.purpose}]`);
                    return `• ${parts.join(' ')}`;
                  })()
                : `• ${renderNestedValue(medication)}`
            }
          </Typography>
        ))}
      </div>
    );
  };

  // Search for patient in database
  const searchPatient = async (patientName: string) => {
    if (!patientName.trim()) return null;
    
    setPatientSearchLoading(true);
    try {
      const response = await api.get(`/api/doctor/me/patients?q=${encodeURIComponent(patientName.trim())}`);
      const patients = response.data;
      
      if (patients && patients.length > 0) {
        // Return the first matching patient
        return patients[0];
      }
      return null;
    } catch (error) {
      console.error('Error searching patient:', error);
      return null;
    } finally {
      setPatientSearchLoading(false);
    }
  };

  // Save note to database with patient search
  const handleSave = async () => {
    const noteToSave = editMode ? editedValues : parsed;
    if (!noteToSave) return;
    
    // Extract patient name from patient details
    const patientName = noteToSave.patientDetails?.name || 
                       noteToSave.patientDetails?.Name || 
                       noteToSave.patientDetails?.fullName || 
                       noteToSave.patientDetails?.patientName || '';
    
    if (!patientName.trim()) {
      // If no patient name, just save the note
      saveNoteDirectly(noteToSave);
      return;
    }
    
    // Search for patient
    const patient = await searchPatient(patientName);
    
    if (patient) {
      // Patient found - show confirmation dialog
      setFoundPatient(patient);
      setPatientSearchOpen(true);
    } else {
      // No patient found - show create patient dialog
      setNoPatientFoundOpen(true);
    }
  };

  // Save note directly (when no patient search needed)
  const saveNoteDirectly = async (noteToSave: ParsedNote, patientId?: string) => {
    setSaving(true);
    try {
      const payload = {
        patientDetails: noteToSave.patientDetails || {},
        medicalHistory: (noteToSave.medicalHistory || []).filter(Boolean),
        problemFaced: Array.isArray(noteToSave.problemFaced)
          ? noteToSave.problemFaced.filter(Boolean)
          : noteToSave.problemFaced
            ? [noteToSave.problemFaced]
            : [],
        findings: (Array.isArray(noteToSave.findings) ? noteToSave.findings : []).filter(Boolean),
        diagnosis: (noteToSave.diagnosis || []).filter(Boolean),
        investigationsAdvised: (noteToSave.investigationsAdvised || []).filter(Boolean),
        doctorInstructions: (noteToSave.doctorInstructions || []).filter(Boolean),
        medicationPrescribed: (noteToSave.medicationPrescribed || []).filter(Boolean),
        status: 'Confirmed' as const,
        ...(patientId && { patientId }) // Add patientId if provided
      };

      if (noteId) {
        // New flow: update existing note
        console.log(`📝 Updating existing clinical note: ${noteId}`);
        await api.patch(`/api/clinical-notes/${noteId}`, payload);
      } else {
        // Old flow: create new note
        console.log('📝 NOteId not found');
       
      }
      
      if (editMode) {
        // Update parsed with edited values and exit edit mode
        setParsed(noteToSave);
        setEditMode(false);
        setEditedValues(null);
      }
      
      showToast("Clinical note saved successfully!", "success");
      onNoteSaved?.();
    } catch (error: any) {
      console.error('Error saving note:', error);
      showToast(error.response?.data?.message || "Failed to save note", "error");
    } finally {
      setSaving(false);
    }
  };

  // Handle patient confirmation
  const handlePatientConfirm = async () => {
    setPatientSearchOpen(false);
    const noteToSave = editMode ? editedValues : parsed;
    if (noteToSave && foundPatient) {
      await saveNoteDirectly(noteToSave, foundPatient.id);
    }
    setFoundPatient(null);
  };

  // Handle patient confirmation cancel
  const handlePatientConfirmCancel = () => {
    setPatientSearchOpen(false);
    setFoundPatient(null);
  };

  // Handle create new patient and save
  const handleCreatePatientAndSave = async (patientData: any) => {
    setNoPatientFoundOpen(false);
    
    try {
      // Create new patient
      const patientResponse = await api.post('/api/doctor/me/patients', patientData);
      const newPatient = patientResponse.data;
      
      // Save note with new patient ID
      const noteToSave = editMode ? editedValues : parsed;
      if (noteToSave) {
        await saveNoteDirectly(noteToSave, newPatient.id);
      }
    } catch (error: any) {
      console.error('Error creating patient:', error);
      showToast(error.response?.data?.message || "Failed to create patient", "error");
    }
  };

  const handlePrint = async () => {
    if (!noteId) {
      showToast("Save the note before printing.", "warning");
      return;
    }

    setPrinting(true);
    try {
      await printClinicalNotePdf(noteId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to print note";
      showToast(message, "error");
    } finally {
      setPrinting(false);
    }
  };

  // Edit functions
  const handleEdit = () => {
    if (!parsed) return;
    setEditMode(true);
    setEditedValues({
      ...parsed,
      medicalHistory: normalizeFieldForEdit(parsed.medicalHistory),
      problemFaced: normalizeFieldForEdit(parsed.problemFaced),
      findings: normalizeFieldForEdit(parsed.findings),
      diagnosis: normalizeFieldForEdit(parsed.diagnosis),
      investigationsAdvised: normalizeFieldForEdit(parsed.investigationsAdvised),
      doctorInstructions: normalizeFieldForEdit(parsed.doctorInstructions),
      medicationPrescribed: normalizeMedicationsForEdit(parsed.medicationPrescribed),
    });
  };

  const handleCancelEdit = () => {
    setEditMode(false);
    setEditedValues(null);
  };

  const handleFieldChange = (field: keyof ParsedNote, value: any) => {
    if (editedValues) {
      setEditedValues({ ...editedValues, [field]: value });
    }
  };

  const handlePatientDetailChange = (key: string, value: string) => {
    if (editedValues) {
      setEditedValues({
        ...editedValues,
        patientDetails: { ...(editedValues.patientDetails || {}), [key]: value }
      });
    }
  };

  const handleDiscardNote = () => {
    setConfirmDiscardOpen(true);
  };

  const confirmDiscard = () => {
    setConfirmDiscardOpen(false);
    onNoteDiscarded?.();
  };

  const renderNoteActions = () => (
    <div className="flex flex-wrap gap-2 justify-end mt-6 pt-4 border-t border-gray-200">
      <Button
        variant="outlined"
        startIcon={<EditIcon />}
        onClick={handleEdit}
        size="small"
        sx={{ textTransform: "none" }}
      >
        Edit
      </Button>
      <Button
        variant="outlined"
        startIcon={printing ? <CircularProgress size={16} /> : <PrintIcon />}
        onClick={() => void handlePrint()}
        disabled={printing || !noteId}
        size="small"
        sx={{ textTransform: "none" }}
      >
        Print
      </Button>
      <Button
        variant="contained"
        startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />}
        onClick={handleSave}
        disabled={saving}
        size="small"
        sx={{ textTransform: "none" }}
      >
        Save
      </Button>
      <Button
        variant="outlined"
        color="error"
        startIcon={<DeleteIcon />}
        onClick={handleDiscardNote}
        size="small"
        sx={{ textTransform: "none" }}
      >
        Discard
      </Button>
    </div>
  );

  if (error) {
    return (
      <Card className={className}>
        <CardContent className="space-y-4">
          <Typography color="error">{getNoteGenerationErrorMessage(error)}</Typography>
          <Button
            variant="contained"
            onClick={() => {
              setError(null);
              onNoteDiscarded?.();
            }}
            sx={{ textTransform: "none" }}
          >
            Back to home
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!parsed) {
    return (
      <Card className={className}>
        <CardContent>
          <Typography color="textSecondary">
            {loadExisting || loadingExisting
              ? "Loading clinical note..."
              : "Your clinical note is being generated..."}
          </Typography>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className={className}>
        <CardContent>
          <Typography variant="h5" className="mb-4">
            Clinical Note
          </Typography>

          {editMode && editedValues ? (
            <div className="space-y-6">
              <Typography variant="h5" color="primary" gutterBottom>
                Edit Clinical Note
              </Typography>
              
              {/* Patient Details */}
              <div>
                <Typography variant="h6" color="primary" className="mb-3">
                  Patient Details
                </Typography>
                <div className="space-y-2">
                  {patientDetailFields.map(({ key, label }) => {
                    const value = getPatientDetailValue(editedValues.patientDetails, key);
                    
                    return (
                      <div key={key} className="flex items-center gap-3">
                        <Typography variant="body2" className="w-32 font-medium text-gray-700">
                          {label} -
                        </Typography>
                        <TextField
                          fullWidth
                          size="small"
                          value={value}
                          onChange={(e) => handlePatientDetailChange(key, e.target.value)}
                          variant="outlined"
                          className="flex-1"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              <EditableStringArraySection
                label="Medical History -"
                items={getEditItems(editedValues.medicalHistory)}
                onChange={(items) => handleFieldChange("medicalHistory", items)}
                placeholder="Enter medical history item"
              />

              <EditableStringArraySection
                label="Chief Complaint -"
                items={getEditItems(
                  Array.isArray(editedValues.problemFaced)
                    ? editedValues.problemFaced
                    : editedValues.problemFaced
                      ? [editedValues.problemFaced]
                      : undefined,
                )}
                onChange={(items) => handleFieldChange("problemFaced", items)}
                placeholder="Enter chief complaint"
              />

              <EditableStringArraySection
                label="Findings -"
                items={getEditItems(
                  Array.isArray(editedValues.findings) ? editedValues.findings : undefined,
                )}
                onChange={(items) => handleFieldChange("findings", items)}
                placeholder="Enter finding"
              />

              <EditableStringArraySection
                label="Diagnosis -"
                items={getEditItems(editedValues.diagnosis)}
                onChange={(items) => handleFieldChange("diagnosis", items)}
                placeholder="Enter diagnosis"
              />

              <EditableStringArraySection
                label="Investigations Advised -"
                items={getEditItems(editedValues.investigationsAdvised)}
                onChange={(items) => handleFieldChange("investigationsAdvised", items)}
                placeholder="Enter investigation"
              />

              <EditableStringArraySection
                label="Doctor Instructions -"
                items={getEditItems(editedValues.doctorInstructions)}
                onChange={(items) => handleFieldChange("doctorInstructions", items)}
                placeholder="Enter instruction"
              />

              <EditableStringArraySection
                label="Medication Prescribed -"
                items={getEditItems(
                  Array.isArray(editedValues.medicationPrescribed)
                    ? editedValues.medicationPrescribed.map((med) =>
                        typeof med === "string" ? med : medicationToEditableString(med),
                      )
                    : undefined,
                )}
                onChange={(items) => handleFieldChange("medicationPrescribed", items)}
                placeholder="Enter medication"
              />

              {/* Edit Actions */}
              <div className="flex gap-3 mt-6 pt-4 border-t">
                <Button
                  variant="contained"
                  startIcon={<SaveIcon />}
                  onClick={handleSave}
                  disabled={saving}
                  size="medium"
                >
                  {saving ? <CircularProgress size={16} /> : <SaveIcon />}
                  Save Changes
                </Button>
                <Button
                  variant="outlined"
                  onClick={handleCancelEdit}
                  size="medium"
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Patient Details */}
              <div>
                <Typography variant="h6" color="primary">
                  Patient Details
                </Typography>
                <div className="grid grid-cols-1 gap-2 mt-2">
                  {patientDetailFields.map(({ key, label }) => (
                    <div key={key} className="flex items-center">
                      <Typography variant="subtitle2" color="textSecondary" className="w-24">
                        {label} -
                      </Typography>
                      <Typography variant="body2">
                        {getPatientDetailValue(parsed.patientDetails, key) || '\u00a0'}
                      </Typography>
                    </div>
                  ))}
                </div>
              </div>

              {/* Medical History */}
              <div>
                <Typography variant="h6" color="primary">
                  Medical History
                </Typography>
                {renderArraySection(parsed.medicalHistory)}
              </div>

              {/* Problem Faced */}
              <div>
                <Typography variant="h6" color="primary">
                  Chief Complaint
                </Typography>
                {renderFlexibleSection(parsed.problemFaced)}
              </div>

              {/* Findings */}
              <div>
                <Typography variant="h6" color="primary">
                  Findings
                </Typography>
                {renderFlexibleSection(parsed.findings)}
              </div>

              {/* Diagnosis */}
              <div>
                <Typography variant="h6" color="primary">
                  Diagnosis
                </Typography>
                {renderFlexibleSection(parsed.diagnosis)}
              </div>

              {/* Investigations Advised */}
              <div>
                <Typography variant="h6" color="primary">
                  Investigations Advised
                </Typography>
                {renderFlexibleSection(parsed.investigationsAdvised)}
              </div>

              {/* Doctor Instructions */}
              <div>
                <Typography variant="h6" color="primary">
                  Doctor Instructions
                </Typography>
                {renderFlexibleSection(parsed.doctorInstructions)}
              </div>

              {/* Medication Prescribed */}
              <div>
                <Typography variant="h6" color="primary">
                  Medication Prescribed
                </Typography>
                {renderMedicationSection(parsed.medicationPrescribed)}
              </div>

              {renderNoteActions()}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Toast */}
      <SnackbarToast
        open={toastOpen}
        message={toastMessage}
        severity={toastSeverity}
        onClose={() => setToastOpen(false)}
      />

      {/* Discard Confirmation Dialog */}
      <ConfirmDialog
        open={confirmDiscardOpen}
        title="Discard Clinical Note"
        description="Are you sure you want to discard this clinical note? This action cannot be undone."
        confirmLabel="Discard"
        cancelLabel="Cancel"
        onConfirm={confirmDiscard}
        onCancel={() => setConfirmDiscardOpen(false)}
      />

      {/* Patient Found Confirmation Dialog */}
      <ConfirmDialog
        open={patientSearchOpen}
        title="Patient Found"
        description={`Found matching patient: ${foundPatient?.fullName || foundPatient?.name || 'Unknown'} (${foundPatient?.age || 'Unknown'}, ${foundPatient?.gender || 'Unknown'}). Do you want to attach this clinical note to this patient?`}
        confirmLabel="Yes, Attach Note"
        cancelLabel="Cancel"
        onConfirm={handlePatientConfirm}
        onCancel={handlePatientConfirmCancel}
        loading={patientSearchLoading}
      />

      {/* No Patient Found Dialog */}
      <NoPatientFoundDialog
        open={noPatientFoundOpen}
        initial={editMode ? editedValues?.patientDetails : parsed?.patientDetails}
        onCancel={() => setNoPatientFoundOpen(false)}
        onCreateAndSave={handleCreatePatientAndSave}
        loading={patientSearchLoading}
        title="No Patient Found"
        description="No existing patient matched the extracted details. Create a new patient to attach this clinical note."
      />
    </>
  );
}
