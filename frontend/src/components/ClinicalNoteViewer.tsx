import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  Typography,
  Button,
  CircularProgress,
  TextField,
} from "@mui/material";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import SaveIcon from "@mui/icons-material/Save";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import api from "../lib/api";
import SnackbarToast from "./SnackbarToast";
import ConfirmDialog from "./ConfirmDialog";
import NoPatientFoundDialog from "./NoPatientFoundDialog";
import { type ParsedNote } from "../types/clinical-note";
import { useClinicalNoteSubscription } from "../hooks/use-clinical-note-subscription";

type Props = {
  source?: ParsedNote; // Optional for new flow
  noteId?: string; // New prop for Supabase subscription flow
  className?: string;
  onNoteSaved?: () => void;
  onNoteDiscarded?: () => void;
};

export default function ClinicalNoteViewer({
  source,
  noteId,
  className,
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

  // Supabase subscription for new flow
  const { fetchNote } = useClinicalNoteSubscription({
    noteId,
    onNoteGenerated: (note) => {
      console.log('📋 Clinical note received from Supabase:', note);
      // Convert backend note format to ParsedNote format
      const parsedNote: ParsedNote = {
        patientDetails: parsePatientDetails(note.patient_details),
        medicalHistory: parseStringContent(note.medical_history),
        problemFaced: parseStringContent(note.problems_faced).join(', '),
        findings: parseStringContent(note.findings),
        diagnosis: parseStringContent(note.diagnosis),
        investigationsAdvised: parseStringContent(note.investigations_advised),
        doctorInstructions: parseStringContent(note.doctor_instructions),
        medicationPrescribed: parseStringContent(note.medication_prescribed),
      };
      console.log('📋 Parsed note data:', parsedNote);
      console.log('📋 Patient Details:', parsedNote.patientDetails);
      console.log('📋 Medical History:', parsedNote.medicalHistory);
      console.log('📋 Problem Faced:', parsedNote.problemFaced);
      setParsed(parsedNote);
      setError(null);
      // Notify parent that note is ready to reset transcribe bar state
      onNoteSaved?.();
    },
    onError: (error) => {
      console.error('❌ Error in clinical note subscription:', error);
      setError(error.message);
    }
  });

  useEffect(() => {
    // Handle new flow: noteId is handled by subscription hook
    if (noteId) {
      console.log('ClinicalNoteViewer: noteId provided, subscription hook will handle fetching:', noteId);
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
  }, [source, noteId, fetchNote]);

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

  // Parse patient details from string format
  const parsePatientDetails = (patientDetails: any): Record<string, string> => {
    if (typeof patientDetails === 'object' && patientDetails !== null) {
      return patientDetails;
    }
    
    if (typeof patientDetails === 'string') {
      const details: Record<string, string> = {};
      // Parse "Name: Amol Gaikwad (Daivashala), Age: 16 years, Gender: Female"
      const parts = patientDetails.split(',').map(part => part.trim());
      
      parts.forEach(part => {
        const match = part.match(/^(Name|Age|Gender|Contact):\s*(.+)$/);
        if (match) {
          const [, key, value] = match;
          details[key.toLowerCase()] = value.trim();
        }
      });
      
      return details;
    }
    
    return {};
  };

  // Parse string content into array of entries
  const parseStringContent = (content: any): string[] => {
    if (Array.isArray(content)) {
      return content;
    }
    
    if (typeof content === 'string' && content.trim()) {
      let processedContent = content.trim();
      
      // Handle JSON string format like ["G2P1 - Previous normal delivery\nCurrent pregnancy at 3 months gestation"]
      if (processedContent.startsWith('[') && processedContent.endsWith(']')) {
        try {
          // Try to parse as JSON array
          const parsed = JSON.parse(processedContent);
          if (Array.isArray(parsed)) {
            processedContent = parsed.join('\n');
          }
        } catch (e) {
          // If JSON parsing fails, remove brackets and quotes manually
          processedContent = processedContent
            .slice(1, -1) // Remove [ and ]
            .replace(/^"|"$/g, '') // Remove surrounding quotes
            .replace(/"/g, '') // Remove all remaining quotes
            .replace(/^\[|\]$/g, '') // Remove any remaining brackets
            .replace(/^\[|\]$/g, ''); // Double check for brackets
        }
      }
      
      // Also handle cases where brackets might be in the middle of the content
      processedContent = processedContent
        .replace(/^\[|\]$/g, '') // Remove brackets at start/end
        .replace(/^"|"$/g, '') // Remove quotes at start/end
        .replace(/"/g, ''); // Remove all remaining quotes
      
      // Split by \n, commas, periods, and other common delimiters
      const items = processedContent
        .split(/(?:\\n|\n|,\s*|\.\s*|\r\n)/)
        .map(item => item.trim())
        .filter(item => item.length > 0 && item !== 'Not mentioned' && item !== '""');
      
      return items;
    }
    
    return [];
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

  // Search for patient in database
  const searchPatient = async (patientName: string) => {
    if (!patientName.trim()) return null;
    
    setPatientSearchLoading(true);
    try {
      const response = await api.get(`/doctor/me/patients?q=${encodeURIComponent(patientName.trim())}`);
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
        medicalHistory: noteToSave.medicalHistory || [],
        problemFaced: noteToSave.problemFaced || "",
        findings: noteToSave.findings || [],
        diagnosis: noteToSave.diagnosis || [],
        investigationsAdvised: noteToSave.investigationsAdvised || [],
        doctorInstructions: noteToSave.doctorInstructions || [],
        medicationPrescribed: noteToSave.medicationPrescribed || [],
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
      const patientResponse = await api.post('/doctor/me/patients', patientData);
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

  // Copy to clipboard
  const handleCopy = async () => {
    if (!parsed) return;
    
    const sections = [];
    
    if (parsed.patientDetails && Object.keys(parsed.patientDetails).length > 0) {
      sections.push('Patient Details\n' + Object.entries(parsed.patientDetails)
        .map(([key, value]) => `${key}: ${value}`)
        .join('\n'));
    }
    
    const arrayFields = [
      { name: 'Medical History', data: parsed.medicalHistory },
      { name: 'Chief Complaint', data: Array.isArray(parsed.problemFaced) ? parsed.problemFaced : [parsed.problemFaced].filter(Boolean) },
      { name: 'Findings', data: parsed.findings },
      { name: 'Diagnosis', data: parsed.diagnosis },
      { name: 'Investigations Advised', data: parsed.investigationsAdvised },
      { name: 'Doctor Instructions', data: parsed.doctorInstructions },
      { name: 'Medication Prescribed', data: parsed.medicationPrescribed }
    ];
    
    arrayFields.forEach(({ name, data }) => {
      if (data && Array.isArray(data) && data.length > 0) {
        const items = data.map(item => {
          if (typeof item === 'string') {
            return `• ${item}`;
          } else if (typeof item === 'object' && item !== null) {
            // Handle medication objects
            const parts = [];
            if (item.name) parts.push(item.name);
            if (item.dosage) parts.push(`(${item.dosage})`);
            if (item.duration) parts.push(`for ${item.duration}`);
            if (item.instructions) parts.push(`- ${item.instructions}`);
            if (item.purpose) parts.push(`[${item.purpose}]`);
            return `• ${parts.join(' ')}`;
          }
          return `• ${String(item)}`;
        });
        sections.push(`${name}\n${items.join('\n')}`);
      }
    });
    
    const text = sections.join('\n\n');
    
    try {
      await navigator.clipboard.writeText(text);
      showToast("Note copied to clipboard!", "success");
    } catch (error) {
      showToast("Failed to copy to clipboard", "error");
    }
  };

  // Edit functions
  const handleEdit = () => {
    setEditMode(true);
    setEditedValues(parsed ? { ...parsed } : null);
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
    if (editedValues?.patientDetails) {
      setEditedValues({
        ...editedValues,
        patientDetails: { ...editedValues.patientDetails, [key]: value }
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

  if (error) {
    return (
      <Card className={className}>
        <CardContent>
          <Typography color="error">{error}</Typography>
        </CardContent>
      </Card>
    );
  }

  if (!parsed) {
    return (
      <Card className={className}>
        <CardContent>
          <Typography color="textSecondary">No clinical note data available</Typography>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className={className}>
        <CardContent>
          {/* Header with actions */}
          <div className="flex justify-between items-center mb-4">
            <Typography variant="h5">Clinical Note</Typography>
            <div className="flex gap-2">
              {!editMode && (
                <>
                  <Button
                    variant="outlined"
                    startIcon={<ContentCopyIcon />}
                    onClick={handleCopy}
                    size="small"
                  >
                    Copy
                  </Button>
                  <Button
                    variant="outlined"
                    startIcon={<EditIcon />}
                    onClick={handleEdit}
                    size="small"
                  >
                    Edit
                  </Button>
                  <Button
                    variant="contained"
                    startIcon={<SaveIcon />}
                    onClick={handleSave}
                    disabled={saving}
                    size="small"
                  >
                    {saving ? <CircularProgress size={16} /> : <SaveIcon />}
                    Save
                  </Button>
                  <Button
                    variant="outlined"
                    color="error"
                    startIcon={<DeleteIcon />}
                    onClick={handleDiscardNote}
                    size="small"
                  >
                    Discard
                  </Button>
                </>
              )}
            </div>
          </div>

          {editMode && editedValues ? (
            <div className="space-y-6">
              <Typography variant="h5" color="primary" gutterBottom>
                Edit Clinical Note
              </Typography>
              
              {/* Patient Details */}
              {editedValues.patientDetails && Object.keys(editedValues.patientDetails).length > 0 && (
                <div>
                  <Typography variant="h6" color="primary" className="mb-3">
                    Patient Details
                  </Typography>
                  <div className="space-y-2">
                    {[
                      { key: 'name', label: 'Name' },
                      { key: 'age', label: 'Age' },
                      { key: 'gender', label: 'Gender' },
                      { key: 'contact', label: 'Contact' }
                    ].map(({ key, label }) => {
                      const value = editedValues.patientDetails?.[key] || 
                                   editedValues.patientDetails?.[key.charAt(0).toUpperCase() + key.slice(1)] ||
                                   editedValues.patientDetails?.[key === 'name' ? 'Name' : key === 'age' ? 'Age' : key === 'gender' ? 'Gender' : key === 'contact' ? 'Contact' : ''];
                      
                      return (
                        <div key={key} className="flex items-center gap-3">
                          <Typography variant="body2" className="w-32 font-medium text-gray-700">
                            {label} -
                          </Typography>
                          <TextField
                            fullWidth
                            size="small"
                            value={value || ''}
                            onChange={(e) => handlePatientDetailChange(key, e.target.value)}
                            variant="outlined"
                            className="flex-1"
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Medical History */}
              {editedValues.medicalHistory && (
                <div>
                  <Typography variant="body2" className="w-32 font-medium text-gray-700 mb-2">
                    Medical History -
                  </Typography>
                  <TextField
                    fullWidth
                    multiline
                    rows={3}
                    value={Array.isArray(editedValues.medicalHistory) ? editedValues.medicalHistory.join('\n') : editedValues.medicalHistory}
                    onChange={(e) => handleFieldChange('medicalHistory', e.target.value.split('\n').filter(Boolean))}
                    variant="outlined"
                    placeholder="Enter medical history (one item per line)"
                  />
                </div>
              )}

              {/* Chief Complaint */}
              {editedValues.problemFaced && (
                <div>
                  <Typography variant="body2" className="w-32 font-medium text-gray-700 mb-2">
                    Chief Complaint -
                  </Typography>
                  <TextField
                    fullWidth
                    multiline
                    rows={2}
                    value={Array.isArray(editedValues.problemFaced) ? editedValues.problemFaced.join('\n') : editedValues.problemFaced}
                    onChange={(e) => handleFieldChange('problemFaced', e.target.value)}
                    variant="outlined"
                    placeholder="Enter chief complaint"
                  />
                </div>
              )}

              {/* Findings */}
              {editedValues.findings && (
                <div>
                  <Typography variant="body2" className="w-32 font-medium text-gray-700 mb-2">
                    Findings -
                  </Typography>
                  <TextField
                    fullWidth
                    multiline
                    rows={3}
                    value={Array.isArray(editedValues.findings) ? editedValues.findings.join('\n') : editedValues.findings}
                    onChange={(e) => handleFieldChange('findings', e.target.value.split('\n').filter(Boolean))}
                    variant="outlined"
                    placeholder="Enter findings (one item per line)"
                  />
                </div>
              )}

              {/* Diagnosis */}
              {editedValues.diagnosis && (
                <div>
                  <Typography variant="body2" className="w-32 font-medium text-gray-700 mb-2">
                    Diagnosis -
                  </Typography>
                  <TextField
                    fullWidth
                    multiline
                    rows={2}
                    value={Array.isArray(editedValues.diagnosis) ? editedValues.diagnosis.join('\n') : editedValues.diagnosis}
                    onChange={(e) => handleFieldChange('diagnosis', e.target.value.split('\n').filter(Boolean))}
                    variant="outlined"
                    placeholder="Enter diagnosis (one item per line)"
                  />
                </div>
              )}

              {/* Investigations Advised */}
              {editedValues.investigationsAdvised && (
                <div>
                  <Typography variant="body2" className="w-32 font-medium text-gray-700 mb-2">
                    Investigations Advised -
                  </Typography>
                  <TextField
                    fullWidth
                    multiline
                    rows={2}
                    value={Array.isArray(editedValues.investigationsAdvised) ? editedValues.investigationsAdvised.join('\n') : editedValues.investigationsAdvised}
                    onChange={(e) => handleFieldChange('investigationsAdvised', e.target.value.split('\n').filter(Boolean))}
                    variant="outlined"
                    placeholder="Enter investigations (one item per line)"
                  />
                </div>
              )}

              {/* Doctor Instructions */}
              {editedValues.doctorInstructions && (
                <div>
                  <Typography variant="body2" className="w-32 font-medium text-gray-700 mb-2">
                    Doctor Instructions -
                  </Typography>
                  <TextField
                    fullWidth
                    multiline
                    rows={3}
                    value={Array.isArray(editedValues.doctorInstructions) ? editedValues.doctorInstructions.join('\n') : editedValues.doctorInstructions}
                    onChange={(e) => handleFieldChange('doctorInstructions', e.target.value.split('\n').filter(Boolean))}
                    variant="outlined"
                    placeholder="Enter instructions (one item per line)"
                  />
                </div>
              )}

              {/* Medication Prescribed */}
              {editedValues.medicationPrescribed && (
                <div>
                  <Typography variant="body2" className="w-32 font-medium text-gray-700 mb-2">
                    Medication Prescribed -
                  </Typography>
                  <TextField
                    fullWidth
                    multiline
                    rows={3}
                    value={Array.isArray(editedValues.medicationPrescribed) 
                      ? editedValues.medicationPrescribed.map(med => 
                          typeof med === 'string' 
                            ? med 
                            : typeof med === 'object' && med !== null
                              ? (() => {
                                  const parts = [];
                                  if (med.name) parts.push(med.name);
                                  if (med.dosage) parts.push(`(${med.dosage})`);
                                  if (med.duration) parts.push(`for ${med.duration}`);
                                  if (med.instructions) parts.push(`- ${med.instructions}`);
                                  if (med.purpose) parts.push(`[${med.purpose}]`);
                                  return parts.join(' ');
                                })()
                              : String(med)
                        ).join('\n')
                      : editedValues.medicationPrescribed
                    }
                    onChange={(e) => handleFieldChange('medicationPrescribed', e.target.value.split('\n').filter(Boolean))}
                    variant="outlined"
                    placeholder="Enter medications (one item per line)"
                  />
                </div>
              )}

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
              {parsed.patientDetails && Object.keys(parsed.patientDetails).length > 0 && (
                <div>
                  <Typography variant="h6" color="primary">
                    Patient Details
                  </Typography>
                  <div className="grid grid-cols-1 gap-2 mt-2">
                    {[
                      { key: 'name', label: 'Name' },
                      { key: 'age', label: 'Age' },
                      { key: 'gender', label: 'Gender' },
                      { key: 'contact', label: 'Contact' }
                    ].map(({ key, label }) => {
                      const value = parsed.patientDetails?.[key] || 
                                   parsed.patientDetails?.[key.charAt(0).toUpperCase() + key.slice(1)] ||
                                   parsed.patientDetails?.[key === 'name' ? 'Name' : key === 'age' ? 'Age' : key === 'gender' ? 'Gender' : key === 'contact' ? 'Contact' : ''];
                      
                      if (!value) return null;
                      
                      return (
                        <div key={key} className="flex items-center">
                          <Typography variant="subtitle2" color="textSecondary" className="w-24">
                            {label} -
                          </Typography>
                          <Typography variant="body2">{value}</Typography>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Medical History */}
              {parsed.medicalHistory && parsed.medicalHistory.length > 0 && (
                <div>
                  <Typography variant="h6" color="primary">
                    Medical History
                  </Typography>
                  <div className="mt-2">
                    {parsed.medicalHistory.map((item, index) => (
                      <Typography key={index} variant="body2" className="mb-1">
                        • {item}
                      </Typography>
                    ))}
                  </div>
                </div>
              )}

              {/* Problem Faced */}
              {parsed.problemFaced && 
               (Array.isArray(parsed.problemFaced) ? parsed.problemFaced.length > 0 : parsed.problemFaced) && (
                <div>
                  <Typography variant="h6" color="primary">
                    Chief Complaint
                  </Typography>
                  <Typography variant="body2" className="mt-2">
                    {Array.isArray(parsed.problemFaced) 
                      ? parsed.problemFaced.join(', ')
                      : parsed.problemFaced
                    }
                  </Typography>
                </div>
              )}

              {/* Findings */}
              {parsed.findings && 
               (Array.isArray(parsed.findings) ? parsed.findings.length > 0 : parsed.findings) && (
                <div>
                  <Typography variant="h6" color="primary">
                    Findings
                  </Typography>
                  <div className="mt-2">
                    {Array.isArray(parsed.findings) 
                      ? parsed.findings.map((finding, index) => (
                          <Typography key={index} variant="body2" className="mb-1">
                            • {finding}
                          </Typography>
                        ))
                      : typeof parsed.findings === 'object' 
                        ? Object.entries(parsed.findings).map(([key, value]) => (
                            <Typography key={key} variant="body2" className="mb-1">
                              • <strong>{key}:</strong> {renderNestedValue(value)}
                            </Typography>
                          ))
                        : (
                            <Typography variant="body2" className="mb-1">
                              • {parsed.findings}
                            </Typography>
                        )
                    }
                  </div>
                </div>
              )}

              {/* Diagnosis */}
              {parsed.diagnosis && 
               (Array.isArray(parsed.diagnosis) ? parsed.diagnosis.length > 0 : parsed.diagnosis) && (
                <div>
                  <Typography variant="h6" color="primary">
                    Diagnosis
                  </Typography>
                  <div className="mt-2">
                    {Array.isArray(parsed.diagnosis) 
                      ? parsed.diagnosis.map((diagnosis, index) => (
                          <Typography key={index} variant="body2" className="mb-1">
                            • {diagnosis}
                          </Typography>
                        ))
                      : typeof parsed.diagnosis === 'object' 
                        ? Object.entries(parsed.diagnosis).map(([key, value]) => (
                            <Typography key={key} variant="body2" className="mb-1">
                              • <strong>{key}:</strong> {renderNestedValue(value)}
                            </Typography>
                          ))
                        : (
                            <Typography variant="body2" className="mb-1">
                              • {parsed.diagnosis}
                            </Typography>
                        )
                    }
                  </div>
                </div>
              )}

              {/* Investigations Advised */}
              {parsed.investigationsAdvised && 
               (Array.isArray(parsed.investigationsAdvised) ? parsed.investigationsAdvised.length > 0 : parsed.investigationsAdvised) && (
                <div>
                  <Typography variant="h6" color="primary">
                    Investigations Advised
                  </Typography>
                  <div className="mt-2">
                    {Array.isArray(parsed.investigationsAdvised) 
                      ? parsed.investigationsAdvised.map((investigation, index) => (
                          <Typography key={index} variant="body2" className="mb-1">
                            • {investigation}
                          </Typography>
                        ))
                      : typeof parsed.investigationsAdvised === 'object' 
                        ? Object.entries(parsed.investigationsAdvised).map(([key, value]) => (
                            <Typography key={key} variant="body2" className="mb-1">
                              • <strong>{key}:</strong> {renderNestedValue(value)}
                            </Typography>
                          ))
                        : (
                            <Typography variant="body2" className="mb-1">
                              • {parsed.investigationsAdvised}
                            </Typography>
                        )
                    }
                  </div>
                </div>
              )}

              {/* Doctor Instructions */}
              {parsed.doctorInstructions && 
               (Array.isArray(parsed.doctorInstructions) ? parsed.doctorInstructions.length > 0 : parsed.doctorInstructions) && (
                <div>
                  <Typography variant="h6" color="primary">
                    Doctor Instructions
                  </Typography>
                  <div className="mt-2">
                    {Array.isArray(parsed.doctorInstructions) 
                      ? parsed.doctorInstructions.map((instruction, index) => (
                          <Typography key={index} variant="body2" className="mb-1">
                            • {instruction}
                          </Typography>
                        ))
                      : typeof parsed.doctorInstructions === 'object' 
                        ? Object.entries(parsed.doctorInstructions).map(([key, value]) => (
                            <Typography key={key} variant="body2" className="mb-1">
                              • <strong>{key}:</strong> {renderNestedValue(value)}
                            </Typography>
                          ))
                        : (
                            <Typography variant="body2" className="mb-1">
                              • {parsed.doctorInstructions}
                            </Typography>
                        )
                    }
                  </div>
                </div>
              )}

              {/* Medication Prescribed */}
              {parsed.medicationPrescribed && 
               (Array.isArray(parsed.medicationPrescribed) ? parsed.medicationPrescribed.length > 0 : parsed.medicationPrescribed) && (
                <div>
                  <Typography variant="h6" color="primary">
                    Medication Prescribed
                  </Typography>
                  <div className="mt-2">
                    {Array.isArray(parsed.medicationPrescribed) 
                      ? parsed.medicationPrescribed.map((medication, index) => (
                          <Typography key={index} variant="body2" className="mb-1">
                            {typeof medication === 'string' 
                              ? `* ${medication}`
                              : typeof medication === 'object' && medication !== null
                                ? (() => {
                                    const parts = [];
                                    if (medication.name) parts.push(medication.name);
                                    if (medication.dosage) parts.push(`(${medication.dosage})`);
                                    if (medication.duration) parts.push(`for ${medication.duration}`);
                                    if (medication.instructions) parts.push(`- ${medication.instructions}`);
                                    if (medication.purpose) parts.push(`[${medication.purpose}]`);
                                    return `* ${parts.join(' ')}`;
                                  })()
                                : `* ${medication}`
                            }
                          </Typography>
                        ))
                      : typeof parsed.medicationPrescribed === 'object' 
                        ? Object.entries(parsed.medicationPrescribed).map(([key, value]) => (
                            <Typography key={key} variant="body2" className="mb-1">
                              <strong>{key}:</strong> {renderNestedValue(value)}
                            </Typography>
                          ))
                        : (
                            <Typography variant="body2" className="mb-1">
                              {parsed.medicationPrescribed}
                            </Typography>
                        )
                    }
                  </div>
                </div>
              )}
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
