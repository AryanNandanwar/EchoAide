/// <reference types="node" />

import assert from "node:assert/strict";
import test from "node:test";
import {
  getNoteGenerationErrorMessage,
  isNoteNotFoundError,
  noteSkipReasonToMessage,
  parseRecordingStatusMessage,
} from "./recording-status.ts";

test("parseRecordingStatusMessage returns null for non-status messages", () => {
  assert.equal(parseRecordingStatusMessage({ type: "error", data: {} }), null);
  assert.equal(parseRecordingStatusMessage({}), null);
});

test("noteSkipReasonToMessage covers all skip reasons", () => {
  assert.equal(
    noteSkipReasonToMessage("transcript_too_short"),
    "Recording was too short to generate a note. Please record again.",
  );
  assert.equal(
    noteSkipReasonToMessage("no_doctor_id"),
    "Unable to verify your account. Please log in and try again.",
  );
  assert.equal(
    noteSkipReasonToMessage("unknown_reason"),
    "Could not generate a clinical note from this recording. Please record again.",
  );
});

test("isNoteNotFoundError detects backend note generation failures", () => {
  assert.equal(isNoteNotFoundError("Clinical note not found"), true);
  assert.equal(isNoteNotFoundError("NOTE_NOT_CREATED"), true);
  assert.equal(isNoteNotFoundError("NOTE_GENERATION_FAILED"), true);
  assert.equal(isNoteNotFoundError("Network timeout"), false);
});

test("getNoteGenerationErrorMessage maps generation failures to doctor-friendly text", () => {
  assert.equal(
    getNoteGenerationErrorMessage("NOTE_GENERATION_FAILED"),
    "No speech was detected. Please record again.",
  );
  assert.equal(
    getNoteGenerationErrorMessage("Server unavailable"),
    "Server unavailable",
  );
});
