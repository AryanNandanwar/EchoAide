import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useStreamingTranscription } from './use-streaming-transcription';

const mockWs = {
  connect: vi.fn(),
  disconnect: vi.fn(),
  isConnected: vi.fn(),
  onStatus: vi.fn(),
  onMessage: vi.fn(),
  startRecording: vi.fn(),
  pauseRecording: vi.fn(),
  resumeRecording: vi.fn(),
  stopRecording: vi.fn(),
  cancelRecording: vi.fn(),
  sendAudioChunk: vi.fn(),
};

vi.mock('../services/websocket-service', () => ({
  SocketIOService: vi.fn(() => mockWs),
}));

describe('useStreamingTranscription', () => {
  beforeEach(() => {
    Object.values(mockWs).forEach((fn) => {
      if (typeof fn === 'function' && 'mockReset' in fn) {
        fn.mockReset();
      }
    });

    mockWs.connect.mockResolvedValue(undefined);
    mockWs.isConnected.mockReturnValue(true);
    mockWs.onStatus.mockImplementation(() => undefined);
    mockWs.onMessage.mockImplementation(() => undefined);
  });

  it('registers websocket status and message handlers on mount', () => {
    renderHook(() =>
      useStreamingTranscription({
        websocketUrl: 'http://localhost:3000',
      }),
    );

    expect(mockWs.connect).toHaveBeenCalled();
    expect(mockWs.onStatus).toHaveBeenCalled();
    expect(mockWs.onMessage).toHaveBeenCalled();
  });

  it('forwards note_skipped status payloads to the callback', () => {
    const onNoteGenerationSkipped = vi.fn();
    let messageHandler: ((message: unknown) => void) | undefined;

    mockWs.onMessage.mockImplementation((handler) => {
      messageHandler = handler;
    });

    renderHook(() =>
      useStreamingTranscription({
        websocketUrl: 'http://localhost:3000',
        onNoteGenerationSkipped,
      }),
    );

    act(() => {
      messageHandler?.({
        type: 'recording_status',
        data: {
          data: {
            status: 'note_skipped',
            noteId: 'note-1',
            reason: 'empty_transcript',
          },
        },
      });
    });

    expect(onNoteGenerationSkipped).toHaveBeenCalledWith({
      noteId: 'note-1',
      reason: 'empty_transcript',
    });
  });

  it('does not start recording when the socket is disconnected', async () => {
    mockWs.isConnected.mockReturnValue(false);

    const { result } = renderHook(() =>
      useStreamingTranscription({
        websocketUrl: 'http://localhost:3000',
      }),
    );

    await act(async () => {
      await result.current.startRecording();
    });

    expect(result.current.error).toContain('Not connected');
    expect(mockWs.startRecording).not.toHaveBeenCalled();
  });
});
