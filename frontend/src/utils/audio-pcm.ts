/** Streaming audio format expected by Soniox (pcm_s16le @ 16 kHz mono). */
export const STREAMING_AUDIO_SAMPLE_RATE = 16_000;
export const STREAMING_AUDIO_BITS_PER_SAMPLE = 16;
export const STREAMING_AUDIO_NUM_CHANNELS = 1;
export const WAV_AUDIO_FORMAT_PCM = 1;

export const STREAMING_AUDIO_CONTEXT_OPTIONS = {
  sampleRate: STREAMING_AUDIO_SAMPLE_RATE,
} as const;

export const STREAMING_MEDIA_TRACK_CONSTRAINTS = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  sampleRate: STREAMING_AUDIO_SAMPLE_RATE,
  channelCount: STREAMING_AUDIO_NUM_CHANNELS,
} as const;

export type WavFormat = {
  audioFormat: number;
  numChannels: number;
  sampleRate: number;
  bitsPerSample: number;
};

export function float32SamplesToPcmS16le(samples: ArrayLike<number>): Int16Array {
  const pcm = new Int16Array(samples.length);

  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    pcm[i] = clamped * 0x7fff;
  }

  return pcm;
}

export function createPcmWavHeader(sampleCount: number): Uint8Array {
  const header = new ArrayBuffer(44);
  const view = new DataView(header);

  const sampleRate = STREAMING_AUDIO_SAMPLE_RATE;
  const numChannels = STREAMING_AUDIO_NUM_CHANNELS;
  const bitsPerSample = STREAMING_AUDIO_BITS_PER_SAMPLE;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = sampleCount * 2;

  view.setUint32(0, 0x46464952, true); // "RIFF"
  view.setUint32(4, 36 + dataSize, true);
  view.setUint32(8, 0x45564157, true); // "WAVE"
  view.setUint32(12, 0x20746d66, true); // "fmt "
  view.setUint32(16, 16, true);
  view.setUint16(20, WAV_AUDIO_FORMAT_PCM, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  view.setUint32(36, 0x61746164, true); // "data"
  view.setUint32(40, dataSize, true);

  return new Uint8Array(header);
}

export function encodeFloat32AsPcmWav(samples: ArrayLike<number>): Uint8Array {
  const pcm = float32SamplesToPcmS16le(samples);
  const header = createPcmWavHeader(pcm.length);
  const wav = new Uint8Array(header.length + pcm.byteLength);

  wav.set(header, 0);
  wav.set(new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength), header.length);

  return wav;
}

export function parseWavFormat(wavBytes: Uint8Array): WavFormat {
  if (wavBytes.length < 44) {
    throw new Error("WAV buffer too small");
  }

  const riff = String.fromCharCode(wavBytes[0], wavBytes[1], wavBytes[2], wavBytes[3]);
  const wave = String.fromCharCode(wavBytes[8], wavBytes[9], wavBytes[10], wavBytes[11]);

  if (riff !== "RIFF" || wave !== "WAVE") {
    throw new Error("Invalid WAV container");
  }

  const view = new DataView(wavBytes.buffer, wavBytes.byteOffset, wavBytes.byteLength);

  return {
    audioFormat: view.getUint16(20, true),
    numChannels: view.getUint16(22, true),
    sampleRate: view.getUint32(24, true),
    bitsPerSample: view.getUint16(34, true),
  };
}

export function isStreamingPcm16kMono(wavBytes: Uint8Array): boolean {
  const format = parseWavFormat(wavBytes);

  return (
    format.audioFormat === WAV_AUDIO_FORMAT_PCM &&
    format.sampleRate === STREAMING_AUDIO_SAMPLE_RATE &&
    format.bitsPerSample === STREAMING_AUDIO_BITS_PER_SAMPLE &&
    format.numChannels === STREAMING_AUDIO_NUM_CHANNELS
  );
}
