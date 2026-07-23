export type FetchClinicalNote = (noteId: string) => Promise<unknown>;

export const DEFAULT_EXISTING_NOTE_FETCH_DELAY_MS = 7000;

export async function fetchExistingClinicalNote(
  noteId: string,
  fetchClinicalNote: FetchClinicalNote,
  delayMs = DEFAULT_EXISTING_NOTE_FETCH_DELAY_MS,
): Promise<unknown> {
  const effectiveDelay =
    import.meta.env?.VITE_E2E_USE_API === 'true' ? 0 : delayMs;

  if (effectiveDelay > 0) {
    await new Promise((resolve) => setTimeout(resolve, effectiveDelay));
  }

  return fetchClinicalNote(noteId);
}
