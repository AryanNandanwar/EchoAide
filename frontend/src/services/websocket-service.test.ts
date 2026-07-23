/// <reference types="node" />

import assert from "node:assert/strict";
import test from "node:test";
import { SocketIOService } from "./websocket-service.ts";

test("cancelRecording sends sessionId to backend", () => {
  const service = new SocketIOService("http://localhost:3000");
  const emitted: Array<{ event: string; data: unknown }> = [];

  (service as unknown as { socket: { connected: boolean; emit: (event: string, data: unknown) => void } }).socket = {
    connected: true,
    emit: (event, data) => emitted.push({ event, data }),
  };

  service.cancelRecording("session-123");

  assert.deepEqual(emitted, [
    {
      event: "cancel_recording",
      data: { sessionId: "session-123" },
    },
  ]);
});

test("stopRecording sends sessionId, doctorId, and provided noteId to backend", () => {
  const service = new SocketIOService("http://localhost:3000");
  const emitted: Array<{ event: string; data: unknown }> = [];

  (service as unknown as { socket: { connected: boolean; emit: (event: string, data: unknown) => void } }).socket = {
    connected: true,
    emit: (event, data) => emitted.push({ event, data }),
  };

  const returnedNoteId = service.stopRecording(
    "session-123",
    "doctor-456",
    "note-789",
  );

  assert.equal(returnedNoteId, "note-789");
  assert.deepEqual(emitted, [
    {
      event: "stop_recording",
      data: {
        sessionId: "session-123",
        noteId: "note-789",
        doctorId: "doctor-456",
      },
    },
  ]);
});

test("startRecording emits start_recording with sessionId", () => {
  const service = new SocketIOService("http://localhost:3000");
  const emitted: Array<{ event: string; data: unknown }> = [];

  (service as unknown as { socket: { connected: boolean; emit: (event: string, data: unknown) => void } }).socket = {
    connected: true,
    emit: (event, data) => emitted.push({ event, data }),
  };

  service.startRecording("session-abc");

  assert.deepEqual(emitted, [
    {
      event: "start_recording",
      data: { sessionId: "session-abc" },
    },
  ]);
});

test("pauseRecording and resumeRecording emit expected events", () => {
  const service = new SocketIOService("http://localhost:3000");
  const emitted: Array<{ event: string; data: unknown }> = [];

  (service as unknown as { socket: { connected: boolean; emit: (event: string, data: unknown) => void } }).socket = {
    connected: true,
    emit: (event, data) => emitted.push({ event, data }),
  };

  service.pauseRecording("session-abc");
  service.resumeRecording("session-abc");

  assert.deepEqual(emitted, [
    { event: "pause_recording", data: { sessionId: "session-abc" } },
    { event: "resume_recording", data: { sessionId: "session-abc" } },
  ]);
});

test("sendAudioChunk emits base64 audio payload", () => {
  const service = new SocketIOService("http://localhost:3000");
  const emitted: Array<{ event: string; data: unknown }> = [];

  (service as unknown as { socket: { connected: boolean; emit: (event: string, data: unknown) => void } }).socket = {
    connected: true,
    emit: (event, data) => emitted.push({ event, data }),
  };

  service.sendAudioChunk("base64-audio", 1234567890);

  assert.deepEqual(emitted, [
    {
      event: "audio_chunk",
      data: {
        data: "base64-audio",
        timestamp: 1234567890,
      },
    },
  ]);
});

test("stopRecording includes patient context when provided", () => {
  const service = new SocketIOService("http://localhost:3000");
  const emitted: Array<{ event: string; data: unknown }> = [];

  (service as unknown as { socket: { connected: boolean; emit: (event: string, data: unknown) => void } }).socket = {
    connected: true,
    emit: (event, data) => emitted.push({ event, data }),
  };

  service.stopRecording("session-123", "doctor-456", "note-789", {
    patientId: "patient-1",
    intakeId: "intake-1",
    patientDetails: { name: "Asha Rao" },
  });

  assert.deepEqual(emitted, [
    {
      event: "stop_recording",
      data: {
        sessionId: "session-123",
        noteId: "note-789",
        doctorId: "doctor-456",
        patientId: "patient-1",
        intakeId: "intake-1",
        patientDetails: { name: "Asha Rao" },
      },
    },
  ]);
});
