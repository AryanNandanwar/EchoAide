/// <reference types="node" />

import assert from "node:assert/strict";
import test from "node:test";
import {
  getClinicalNotePatientLabel,
  getClinicalNotePreview,
  mapApiClinicalNoteToParsedNote,
  mergePatientDetails,
  parsePatientDetails,
  parseStringContent,
} from "./clinical-note-record.ts";

test("parseStringContent splits JSON array strings and filters Not mentioned", () => {
  assert.deepEqual(parseStringContent('["Fever", "Not mentioned", "Cough"]'), [
    "Fever",
    "Cough",
  ]);
});

test("parseStringContent returns an empty array for blank content", () => {
  assert.deepEqual(parseStringContent(""), []);
  assert.deepEqual(parseStringContent(null), []);
});

test("getClinicalNotePatientLabel prefers linked patient name", () => {
  assert.equal(
    getClinicalNotePatientLabel({ name: "From note" }, "Linked Patient"),
    "Linked Patient",
  );
});

test("getClinicalNotePatientLabel falls back to parsed note name", () => {
  assert.equal(
    getClinicalNotePatientLabel("Name: Asha Rao, Age: 41"),
    "Asha Rao",
  );
  assert.equal(getClinicalNotePatientLabel({}), "Unknown patient");
});

test("getClinicalNotePreview summarizes problems or shows draft placeholder", () => {
  assert.equal(getClinicalNotePreview("Headache, dizziness, nausea"), "Headache, dizziness");
  assert.equal(
    getClinicalNotePreview([]),
    "Draft note — review and complete patient details",
  );
});

test("mapApiClinicalNoteToParsedNote maps camelCase API payloads", () => {
  const parsed = mapApiClinicalNoteToParsedNote({
    patientDetails: { name: "Asha Rao" },
    medicalHistory: ["Diabetes"],
    problemsFaced: "Headache",
    findings: ["BP elevated"],
    diagnosis: ["Hypertension"],
    investigationsAdvised: ["CBC"],
    doctorInstructions: ["Follow up"],
    medicationPrescribed: ["Amlodipine 5mg"],
  });

  assert.deepEqual(parsed.patientDetails, { name: "Asha Rao" });
  assert.deepEqual(parsed.medicalHistory, ["Diabetes"]);
  assert.equal(parsed.problemFaced, "Headache");
});

test("mergePatientDetails preserves weight from receptionist card details", () => {
  assert.deepEqual(
    mergePatientDetails({ weight: "75 kg from conversation" }, { name: "Asha Rao", weight: "68 kg" }),
    { name: "Asha Rao", weight: "68 kg" },
  );
});

test("parsePatientDetails normalizes fullName aliases", () => {
  assert.deepEqual(parsePatientDetails({ fullName: "Asha Rao", age: "41" }), {
    name: "Asha Rao",
    age: "41",
  });
});
