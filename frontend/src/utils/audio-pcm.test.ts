/// <reference types="node" />

import assert from "node:assert/strict";
import test from "node:test";
import {
  STREAMING_AUDIO_BITS_PER_SAMPLE,
  STREAMING_AUDIO_CONTEXT_OPTIONS,
  STREAMING_AUDIO_NUM_CHANNELS,
  STREAMING_AUDIO_SAMPLE_RATE,
  STREAMING_MEDIA_TRACK_CONSTRAINTS,
  WAV_AUDIO_FORMAT_PCM,
  encodeFloat32AsPcmWav,
  float32SamplesToPcmS16le,
  isStreamingPcm16kMono,
  parseWavFormat,
} from "./audio-pcm.ts";

test("streaming audio constants require 16 kHz mono PCM", () => {
  assert.equal(STREAMING_AUDIO_SAMPLE_RATE, 16_000);
  assert.equal(STREAMING_AUDIO_BITS_PER_SAMPLE, 16);
  assert.equal(STREAMING_AUDIO_NUM_CHANNELS, 1);
  assert.equal(WAV_AUDIO_FORMAT_PCM, 1);
  assert.equal(STREAMING_AUDIO_CONTEXT_OPTIONS.sampleRate, 16_000);
  assert.equal(STREAMING_MEDIA_TRACK_CONSTRAINTS.sampleRate, 16_000);
  assert.equal(STREAMING_MEDIA_TRACK_CONSTRAINTS.channelCount, 1);
});

test("float32SamplesToPcmS16le converts samples to signed 16-bit PCM", () => {
  const pcm = float32SamplesToPcmS16le([0, 1, -1, 0.5, -0.5]);

  assert.deepEqual(Array.from(pcm), [0, 0x7fff, -0x7fff, 0x3fff, -0x3fff]);
});

test("encodeFloat32AsPcmWav produces 16 kHz PCM mono WAV chunks", () => {
  const wav = encodeFloat32AsPcmWav([0, 0.25, -0.25, 1, -1]);
  const format = parseWavFormat(wav);

  assert.equal(format.audioFormat, WAV_AUDIO_FORMAT_PCM);
  assert.equal(format.sampleRate, STREAMING_AUDIO_SAMPLE_RATE);
  assert.equal(format.bitsPerSample, STREAMING_AUDIO_BITS_PER_SAMPLE);
  assert.equal(format.numChannels, STREAMING_AUDIO_NUM_CHANNELS);
  assert.equal(isStreamingPcm16kMono(wav), true);
});

test("encoded PCM payload length matches sample count", () => {
  const samples = new Float32Array(2000);
  samples[0] = 0.1;
  samples[1999] = -0.1;

  const wav = encodeFloat32AsPcmWav(samples);

  assert.equal(wav.length, 44 + samples.length * 2);
  assert.equal(isStreamingPcm16kMono(wav), true);
});
