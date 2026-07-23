import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import HomePage from './home';
import { renderWithRouter } from '../test/test-utils';

vi.mock('../hooks/use-require-auth', () => ({
  useRequireAuth: () => ({ authorized: true, user: { id: 'doc-1', role: 'doctor' } }),
}));

vi.mock('../hooks/use-streaming-transcription', () => ({
  useStreamingTranscription: () => ({
    isRecording: false,
    isPaused: false,
    isConnecting: false,
    isConnected: true,
    error: null,
    startRecording: vi.fn(),
    pauseRecording: vi.fn(),
    resumeRecording: vi.fn(),
    stopRecording: vi.fn(),
    cancelRecording: vi.fn(),
    clearError: vi.fn(),
  }),
}));

vi.mock('../components/transcribeBar.tsx', () => ({
  default: () => <div data-testid="transcribe-bar">Transcribe bar</div>,
}));

vi.mock('../lib/api', () => ({
  default: {
    get: vi.fn(),
    patch: vi.fn(),
  },
}));

import api from '../lib/api';

describe('Home page', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset();
    vi.mocked(api.get).mockResolvedValue({ data: [] });
  });

  it('shows the welcome copy and empty intake queue for authorized doctors', async () => {
    renderWithRouter(<HomePage />, { withPendingNoteProvider: true });

    expect(screen.getByText(/welcome/i)).toBeInTheDocument();
    expect(await screen.findByText(/no patients waiting/i)).toBeInTheDocument();
    expect(screen.getByTestId('transcribe-bar')).toBeInTheDocument();
  });

  it('loads pending intake cards from the queue API', async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: [{
        id: 'intake-1',
        patientId: 'patient-1',
        status: 'pending',
        createdAt: '2026-07-01T10:00:00.000Z',
        patient: {
          id: 'patient-1',
          fullName: 'Queue Patient',
          gender: 'female',
          age: '32',
        },
      }],
    });

    renderWithRouter(<HomePage />, { withPendingNoteProvider: true });

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/api/intake/queue?status=pending');
    });
    expect(await screen.findByText('Queue Patient')).toBeInTheDocument();
  });
});
