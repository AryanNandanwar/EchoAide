import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type PendingClinicalNoteState = {
  noteId: string | null;
  patientDetails: Record<string, string> | null;
  isGenerating: boolean;
  isReady: boolean;
  isExistingDraft: boolean;
};

type PendingClinicalNoteContextValue = PendingClinicalNoteState & {
  beginNote: (noteId: string, patientDetails?: Record<string, string>) => void;
  openDraftNote: (noteId: string, patientDetails?: Record<string, string>) => void;
  markNoteReady: () => void;
  setGenerating: (value: boolean) => void;
  clearPendingNote: (options?: { saved?: boolean }) => void;
  abortNoteGeneration: () => void;
  registerOnNoteSaved: (callback: () => void) => () => void;
};

const PendingClinicalNoteContext = createContext<PendingClinicalNoteContextValue | null>(null);

export function PendingClinicalNoteProvider({ children }: { children: ReactNode }) {
  const [noteId, setNoteId] = useState<string | null>(null);
  const [patientDetails, setPatientDetails] = useState<Record<string, string> | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [isExistingDraft, setIsExistingDraft] = useState(false);
  const onSavedRef = useRef<(() => void) | null>(null);

  const beginNote = useCallback((nextNoteId: string, details?: Record<string, string>) => {
    setNoteId(nextNoteId);
    setPatientDetails(details ?? null);
    setIsGenerating(true);
    setIsReady(false);
    setIsExistingDraft(false);
  }, []);

  const openDraftNote = useCallback((nextNoteId: string, details?: Record<string, string>) => {
    setNoteId(nextNoteId);
    setPatientDetails(details ?? null);
    setIsGenerating(false);
    setIsReady(true);
    setIsExistingDraft(true);
  }, []);

  const markNoteReady = useCallback(() => {
    setIsReady(true);
    setIsGenerating(false);
  }, []);

  const setGenerating = useCallback((value: boolean) => {
    setIsGenerating(value);
  }, []);

  const clearPendingNote = useCallback((options?: { saved?: boolean }) => {
    setNoteId(null);
    setPatientDetails(null);
    setIsGenerating(false);
    setIsReady(false);
    setIsExistingDraft(false);
    if (options?.saved) {
      onSavedRef.current?.();
    }
  }, []);

  const abortNoteGeneration = useCallback(() => {
    setNoteId(null);
    setPatientDetails(null);
    setIsGenerating(false);
    setIsReady(false);
    setIsExistingDraft(false);
  }, []);

  const registerOnNoteSaved = useCallback((callback: () => void) => {
    onSavedRef.current = callback;
    return () => {
      if (onSavedRef.current === callback) {
        onSavedRef.current = null;
      }
    };
  }, []);

  const value = useMemo(
    () => ({
      noteId,
      patientDetails,
      isGenerating,
      isReady,
      isExistingDraft,
      beginNote,
      openDraftNote,
      markNoteReady,
      setGenerating,
      clearPendingNote,
      abortNoteGeneration,
      registerOnNoteSaved,
    }),
    [
      noteId,
      patientDetails,
      isGenerating,
      isReady,
      isExistingDraft,
      beginNote,
      openDraftNote,
      markNoteReady,
      setGenerating,
      clearPendingNote,
      abortNoteGeneration,
      registerOnNoteSaved,
    ],
  );

  return (
    <PendingClinicalNoteContext.Provider value={value}>
      {children}
    </PendingClinicalNoteContext.Provider>
  );
}

export function usePendingClinicalNote() {
  const context = useContext(PendingClinicalNoteContext);
  if (!context) {
    throw new Error("usePendingClinicalNote must be used within PendingClinicalNoteProvider");
  }
  return context;
}
