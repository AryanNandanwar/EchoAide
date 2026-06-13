import ClinicalNoteViewer from "./ClinicalNoteViewer";
import { usePendingClinicalNote } from "../context/pending-clinical-note-context";

export default function PendingClinicalNotePanel() {
  const {
    noteId,
    patientDetails,
    isExistingDraft,
    markNoteReady,
    clearPendingNote,
  } = usePendingClinicalNote();

  if (!noteId) {
    return null;
  }

  return (
    <section
      aria-label="Pending clinical note"
      className="px-4 md:px-8 max-w-3xl mx-auto mb-6 w-full"
    >
      <ClinicalNoteViewer
        key={noteId}
        noteId={noteId}
        className="w-full"
        loadExisting={isExistingDraft}
        initialPatientDetails={patientDetails ?? undefined}
        onNoteReady={markNoteReady}
        onNoteSaved={() => clearPendingNote({ saved: true })}
        onNoteDiscarded={() => clearPendingNote()}
      />
    </section>
  );
}
