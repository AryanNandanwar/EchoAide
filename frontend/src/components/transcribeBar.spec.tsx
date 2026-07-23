import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AudioRecorder } from './transcribeBar';

const mockNavigate = vi.fn();
const mockStreaming = {
  isRecording: false,
  isPaused: false,
  isConnecting: false,
  isConnected: true,
  error: null as string | null,
  startRecording: vi.fn(),
  pauseRecording: vi.fn(),
  resumeRecording: vi.fn(),
  stopRecording: vi.fn(),
  cancelRecording: vi.fn(),
  clearError: vi.fn(),
  sendAudioChunk: vi.fn(),
};

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('../hooks/use-streaming-transcription', () => ({
  useStreamingTranscription: () => mockStreaming,
}));

vi.mock('../lib/auth', () => ({
  ensureValidAccessToken: vi.fn(),
  getStoredUser: vi.fn(() => ({ id: 'doc-1' })),
  hasValidSession: vi.fn(),
}));

import { hasValidSession } from '../lib/auth';

describe('AudioRecorder (transcribeBar)', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockStreaming.error = null;
    vi.mocked(hasValidSession).mockReturnValue(false);
  });

  it('prompts unauthenticated users to log in', () => {
    render(<AudioRecorder websocketUrl="http://localhost:3000" />);

    expect(screen.getByText(/must be logged in to record audio/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /login/i })).toBeInTheDocument();
  });

  it('shows the note generation loading state', () => {
    vi.mocked(hasValidSession).mockReturnValue(true);

    render(<AudioRecorder websocketUrl="http://localhost:3000" isGeneratingNote />);

    expect(screen.getByText(/getting your note ready/i)).toBeInTheDocument();
  });

  it('shows start recording for authenticated connected users', () => {
    vi.mocked(hasValidSession).mockReturnValue(true);

    render(<AudioRecorder websocketUrl="http://localhost:3000" />);

    expect(screen.getByRole('button', { name: /start recording/i })).toBeInTheDocument();
  });

  it('navigates to login when the login button is clicked', async () => {
    const user = userEvent.setup();
    render(<AudioRecorder websocketUrl="http://localhost:3000" />);

    await user.click(screen.getByRole('button', { name: /login/i }));
    expect(mockNavigate).toHaveBeenCalledWith('/login');
  });
});
