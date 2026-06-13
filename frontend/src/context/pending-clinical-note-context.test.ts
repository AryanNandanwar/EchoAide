/// <reference types="node" />

import assert from "node:assert/strict";
import test from "node:test";

type PendingClinicalNoteState = {
  noteId: string | null;
  patientDetails: Record<string, string> | null;
  isGenerating: boolean;
  isReady: boolean;
};

function createPendingClinicalNoteStore() {
  let state: PendingClinicalNoteState = {
    noteId: null,
    patientDetails: null,
    isGenerating: false,
    isReady: false,
  };
  let onSaved: (() => void) | null = null;

  return {
    getState: () => state,
    beginNote: (noteId: string, patientDetails?: Record<string, string>) => {
      state = {
        noteId,
        patientDetails: patientDetails ?? null,
        isGenerating: true,
        isReady: false,
      };
    },
    markNoteReady: () => {
      state = { ...state, isGenerating: false, isReady: true };
    },
    clearPendingNote: (options?: { saved?: boolean }) => {
      state = {
        noteId: null,
        patientDetails: null,
        isGenerating: false,
        isReady: false,
      };
      if (options?.saved) {
        onSaved?.();
      }
    },
    registerOnNoteSaved: (callback: () => void) => {
      onSaved = callback;
      return () => {
        if (onSaved === callback) {
          onSaved = null;
        }
      };
    },
  };
}

test("pending note state survives until saved or discarded", () => {
  const store = createPendingClinicalNoteStore();

  store.beginNote("note-123", { name: "Asha Rao" });
  assert.equal(store.getState().noteId, "note-123");
  assert.equal(store.getState().isGenerating, true);

  store.markNoteReady();
  assert.equal(store.getState().isReady, true);
  assert.equal(store.getState().isGenerating, false);
  assert.equal(store.getState().noteId, "note-123");

  store.clearPendingNote();
  assert.equal(store.getState().noteId, null);
});

test("saved pending note triggers refresh callback", () => {
  const store = createPendingClinicalNoteStore();
  const calls: string[] = [];

  store.registerOnNoteSaved(() => {
    calls.push("refresh");
  });
  store.beginNote("note-456");
  store.clearPendingNote({ saved: true });

  assert.deepEqual(calls, ["refresh"]);
  assert.equal(store.getState().noteId, null);
});
