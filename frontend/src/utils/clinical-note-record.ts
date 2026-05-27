import { type ParsedNote } from "../types/clinical-note.ts";

export type ClinicalNoteRecord = {
  patient_details?: unknown;
  medical_history?: unknown;
  problems_faced?: unknown;
  findings?: unknown;
  diagnosis?: unknown;
  investigations_advised?: unknown;
  doctor_instructions?: unknown;
  medication_prescribed?: unknown;
};

function normalizePatientDetailKeys(details: Record<string, unknown>): Record<string, string> {
  const normalized: Record<string, string> = {};

  for (const [key, value] of Object.entries(details)) {
    if (value === null || value === undefined) continue;
    const lowerKey = key.toLowerCase();
    if (lowerKey === "fullname" || lowerKey === "patientname") {
      normalized.name = String(value).trim();
    } else {
      normalized[lowerKey] = String(value).trim();
    }
  }

  return normalized;
}

const PATIENT_IDENTITY_KEYS = ["name", "age", "gender", "contact"] as const;

function hasReceptionistPatientDetails(details: Record<string, string>): boolean {
  return PATIENT_IDENTITY_KEYS.some((key) => (details[key] ?? "").trim().length > 0);
}

export function mergePatientDetails(
  fromNote: Record<string, string> | undefined,
  fromCard: Record<string, string> | undefined,
): Record<string, string> {
  const normalizedCard = normalizePatientDetailKeys((fromCard ?? {}) as Record<string, unknown>);

  if (hasReceptionistPatientDetails(normalizedCard)) {
    const receptionistOnly: Record<string, string> = {};
    for (const key of PATIENT_IDENTITY_KEYS) {
      const value = normalizedCard[key]?.trim();
      if (value) {
        receptionistOnly[key] = value;
      }
    }
    return receptionistOnly;
  }

  return normalizePatientDetailKeys((fromNote ?? {}) as Record<string, unknown>);
}

export function parsePatientDetails(patientDetails: unknown): Record<string, string> {
  if (typeof patientDetails === "object" && patientDetails !== null && !Array.isArray(patientDetails)) {
    return normalizePatientDetailKeys(patientDetails as Record<string, unknown>);
  }

  if (typeof patientDetails === "string") {
    const trimmed = patientDetails.trim();
    if (!trimmed) return {};

    if (trimmed.startsWith("{")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
          return normalizePatientDetailKeys(parsed as Record<string, unknown>);
        }
      } catch {
        // Fall through to legacy "Name: …" parsing.
      }
    }

    const details: Record<string, string> = {};
    const parts = trimmed.split(",").map((part) => part.trim());

    parts.forEach((part) => {
      const match = part.match(/^(Name|Age|Gender|Weight|Contact):\s*(.+)$/i);
      if (match) {
        const [, key, value] = match;
        details[key.toLowerCase()] = value.trim();
      }
    });

    return details;
  }

  return {};
}

export function parseStringContent(content: unknown): string[] {
  if (Array.isArray(content)) {
    return content;
  }

  if (typeof content === "string" && content.trim()) {
    let processedContent = content.trim();

    if (processedContent.startsWith("[") && processedContent.endsWith("]")) {
      try {
        const parsed = JSON.parse(processedContent);
        if (Array.isArray(parsed)) {
          processedContent = parsed.join("\n");
        }
      } catch {
        processedContent = processedContent
          .slice(1, -1)
          .replace(/^"|"$/g, "")
          .replace(/"/g, "")
          .replace(/^\[|\]$/g, "")
          .replace(/^\[|\]$/g, "");
      }
    }

    processedContent = processedContent
      .replace(/^\[|\]$/g, "")
      .replace(/^"|"$/g, "")
      .replace(/"/g, "");

    return processedContent
      .split(/(?:\\n|\n|,\s*|\.\s*|\r\n)/)
      .map((item) => item.trim())
      .filter((item) => item.length > 0 && item !== "Not mentioned" && item !== '""');
  }

  return [];
}

export function mapClinicalNoteRecordToParsedNote(note: ClinicalNoteRecord): ParsedNote {
  return {
    patientDetails: parsePatientDetails(note.patient_details),
    medicalHistory: parseStringContent(note.medical_history),
    problemFaced: parseStringContent(note.problems_faced).join(", "),
    findings: parseStringContent(note.findings),
    diagnosis: parseStringContent(note.diagnosis),
    investigationsAdvised: parseStringContent(note.investigations_advised),
    doctorInstructions: parseStringContent(note.doctor_instructions),
    medicationPrescribed: parseStringContent(note.medication_prescribed),
  };
}
