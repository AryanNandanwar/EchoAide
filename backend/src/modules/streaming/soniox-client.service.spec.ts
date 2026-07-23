import { createMockSonioxWsServer, type MockSonioxWsServer } from 'test/utils/mock-soniox-ws-server';
import { SonioxClientService } from './soniox-client.service';

async function waitFor(
  predicate: () => boolean,
  timeoutMs = 3000,
  intervalMs = 25,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) {
      throw new Error('Timed out waiting for condition');
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

describe('SonioxClientService contract', () => {
  let service: SonioxClientService;
  let mockServer: MockSonioxWsServer;
  const originalEnv = { ...process.env };

  beforeAll(async () => {
    mockServer = await createMockSonioxWsServer();
  });

  afterAll(async () => {
    mockServer.reset();
  }, 15000);

  beforeEach(() => {
    mockServer.reset();
    process.env = {
      ...originalEnv,
      SONIOX_WS_URL: mockServer.url,
      SONIOX_API_KEY: 'contract-test-key',
      SONIOX_MODEL: 'stt-rt-preview',
      SONIOX_AUDIO_FORMAT: 'pcm_s16le',
      SONIOX_SAMPLE_RATE: '16000',
      SONIOX_NUM_CHANNELS: '1',
      SONIOX_ENABLE_SPEAKER_DIARIZATION: 'false',
      SONIOX_ENABLE_LANGUAGE_IDENTIFICATION: 'false',
      SONIOX_ENABLE_ENDPOINT_DETECTION: 'true',
      SONIOX_MAX_ENDPOINT_DELAY_MS: '2000',
    };
    delete process.env.SONIOX_ENABLE_TRANSLATION;

    service = new SonioxClientService();
  });

  afterEach(async () => {
    await service.cancelSession('config-session').catch(() => undefined);
    await service.cancelSession('transcript-session').catch(() => undefined);
    await service.cancelSession('audio-session').catch(() => undefined);
    await service.cancelSession('restart-session').catch(() => undefined);
    await service.cancelSession('dup-session').catch(() => undefined);
    mockServer.reset();
    process.env = { ...originalEnv };
  });

  it('sends the Soniox config JSON on WebSocket open', async () => {
    const onTranscript = jest.fn();
    await service.startSession('config-session', onTranscript);

    await waitFor(() => mockServer.getLastConfig() !== null);

    expect(mockServer.getLastConfig()).toMatchObject({
      api_key: 'contract-test-key',
      model: 'stt-rt-preview',
      audio_format: 'pcm_s16le',
      sample_rate: 16000,
      num_channels: 1,
      enable_endpoint_detection: true,
      max_endpoint_delay_ms: 2000,
    });
    expect(service.isSessionActive('config-session')).toBe(true);
  });

  it('parses final and partial transcript token frames', async () => {
    const onTranscript = jest.fn();
    await service.startSession('transcript-session', onTranscript);
    await waitFor(() => mockServer.getConnections().length >= 1);

    mockServer.sendJson({
      tokens: [{ text: 'Patient reports ', is_final: false }],
    });
    mockServer.sendJson({
      tokens: [{ text: 'fever and cough', is_final: true }],
    });

    await waitFor(() => onTranscript.mock.calls.length >= 2);

    expect(onTranscript).toHaveBeenCalledWith('Patient reports', true);
    expect(onTranscript).toHaveBeenCalledWith('fever and cough', false);
    expect(service.getFinalTranscript('transcript-session')).toEqual(['fever and cough']);
  });

  it('ignores finished frames and emits gateway error on Soniox error payloads', async () => {
    const onTranscript = jest.fn();
    const gatewayEmit = jest.fn();
    service.setWebSocketGateway({
      streamingService: {
        findClientIdBySessionId: () => 'client-1',
      },
      server: { to: () => ({ emit: gatewayEmit }) },
    });

    await service.startSession('error-session', onTranscript);
    await waitFor(() => mockServer.getConnections().length >= 1);

    mockServer.sendJson({ finished: true });
    mockServer.sendJson({ error: { message: 'Invalid audio format' } });

    await waitFor(() => gatewayEmit.mock.calls.length >= 1);

    expect(onTranscript).not.toHaveBeenCalled();
    expect(gatewayEmit).toHaveBeenCalledWith(
      'error',
      expect.objectContaining({
        type: 'error',
        data: expect.objectContaining({
          message: expect.stringContaining('Invalid audio format'),
        }),
      }),
    );
    expect(service.isSessionActive('error-session')).toBe(false);
  });

  it('sends keepalive JSON and binary audio after configuration', async () => {
    const onTranscript = jest.fn();
    await service.startSession('audio-session', onTranscript);
    await waitFor(() => mockServer.getConnections().length >= 1);
    await waitFor(() => mockServer.getLastConfig() !== null);

    const audio = new Uint8Array([1, 2, 3, 4]).buffer;

    await service.sendAudioChunk('audio-session', audio);
    await service.sendKeepalive('audio-session');

    await waitFor(() => {
      const messages = mockServer.getReceivedMessages();
      return messages.some(
        (message) =>
          message.kind === 'json' &&
          typeof message.value === 'string' &&
          message.value.includes('keepalive'),
      );
    });

    const messages = mockServer.getReceivedMessages();
    expect(
      messages.some(
        (message) => message.kind === 'binary' && (message.value as Buffer).length === 4,
      ),
    ).toBe(true);
  });

  it('restarts the session when the upstream connection closes abnormally', async () => {
    const onTranscript = jest.fn();
    await service.startSession('restart-session', onTranscript);
    await waitFor(() => mockServer.getConnections().length >= 1);

    mockServer.closeConnection(1006, 'upstream lost');
    await waitFor(() => service.needsSessionRestart('restart-session'));

    await service.restartSessionIfNeeded('restart-session', onTranscript);
    await waitFor(() => mockServer.getConnections().length >= 1);
    expect(service.isSessionActive('restart-session')).toBe(true);
  });

  it('throws when starting a duplicate session or when API key is missing', async () => {
    const onTranscript = jest.fn();
    await service.startSession('dup-session', onTranscript);
    await expect(service.startSession('dup-session', onTranscript)).rejects.toThrow(
      /already exists/i,
    );

    delete process.env.SONIOX_API_KEY;
    const noKeyService = new SonioxClientService();
    await expect(noKeyService.startSession('no-key', onTranscript)).rejects.toThrow(
      /API key not configured/i,
    );
  });
});
