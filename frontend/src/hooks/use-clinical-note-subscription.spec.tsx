import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useClinicalNoteSubscription } from './use-clinical-note-subscription';

const subscribeToClinicalNote = vi.fn();
const fetchClinicalNote = vi.fn();
const fetchExistingClinicalNote = vi.fn();

vi.mock('../services/supabase-service', () => ({
  supabaseService: {
    subscribeToClinicalNote: (...args: unknown[]) => subscribeToClinicalNote(...args),
    fetchClinicalNote: (...args: unknown[]) => fetchClinicalNote(...args),
  },
}));

vi.mock('../utils/clinical-note-polling', () => ({
  fetchExistingClinicalNote: (...args: unknown[]) => fetchExistingClinicalNote(...args),
}));

describe('useClinicalNoteSubscription', () => {
  beforeEach(() => {
    subscribeToClinicalNote.mockReset();
    fetchClinicalNote.mockReset();
    fetchExistingClinicalNote.mockReset();

    subscribeToClinicalNote.mockImplementation(() => {
      return () => undefined;
    });
    fetchExistingClinicalNote.mockResolvedValue(null);
  });

  it('subscribes to Supabase when noteId is provided', async () => {
    renderHook(() =>
      useClinicalNoteSubscription({
        noteId: 'note-abc',
        onNoteGenerated: vi.fn(),
      }),
    );

    await waitFor(() => {
      expect(subscribeToClinicalNote).toHaveBeenCalledWith(
        expect.objectContaining({ noteId: 'note-abc' }),
      );
    });
  });

  it('delivers notes from the realtime subscription callback', async () => {
    const onNoteGenerated = vi.fn();

    subscribeToClinicalNote.mockImplementation(({ onNoteGenerated: callback }) => {
      callback({ id: 'note-abc', status: 'Draft' });
      return () => undefined;
    });

    renderHook(() =>
      useClinicalNoteSubscription({
        noteId: 'note-abc',
        onNoteGenerated,
      }),
    );

    await waitFor(() => {
      expect(onNoteGenerated).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'note-abc' }),
      );
    });
  });

  it('fires NOTE_NOT_CREATED after the 15s timeout', async () => {
    vi.useFakeTimers();
    const onError = vi.fn();

    renderHook(() =>
      useClinicalNoteSubscription({
        noteId: 'note-timeout',
        onError,
      }),
    );

    await act(async () => {
      vi.advanceTimersByTime(15_000);
    });

    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'NOTE_NOT_CREATED' }));
  });

  it('retries subscription errors before surfacing onError', async () => {
    vi.useFakeTimers();
    const onError = vi.fn();
    let errorHandler: ((error: Error) => void) | undefined;

    subscribeToClinicalNote.mockImplementation(({ onError: callback }) => {
      errorHandler = callback;
      return () => undefined;
    });

    renderHook(() =>
      useClinicalNoteSubscription({
        noteId: 'note-retry',
        onError,
      }),
    );

    act(() => {
      errorHandler?.(new Error('CHANNEL_ERROR'));
    });

    expect(onError).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(2_000);
    });

    expect(subscribeToClinicalNote.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});
