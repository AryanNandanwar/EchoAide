const PATIENT_IDENTITY_KEYS = ['name', 'age', 'gender', 'contact'] as const;

function normalizePatientDetailKeys(
  details: Record<string, string>,
): Record<string, string> {
  const normalized: Record<string, string> = {};

  for (const [key, value] of Object.entries(details)) {
    if (value === null || value === undefined) continue;
    const lowerKey = key.toLowerCase();
    if (lowerKey === 'fullname' || lowerKey === 'patientname') {
      normalized.name = String(value).trim();
    } else {
      normalized[lowerKey] = String(value).trim();
    }
  }

  return normalized;
}

function hasReceptionistPatientDetails(
  details: Record<string, string>,
): boolean {
  return PATIENT_IDENTITY_KEYS.some(
    (key) => (details[key] ?? '').trim().length > 0,
  );
}

export function mergePatientDetails(
  fromNote: Record<string, string> | undefined,
  fromCard: Record<string, string> | undefined,
): Record<string, string> {
  const normalizedCard = normalizePatientDetailKeys(fromCard ?? {});

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

  return normalizePatientDetailKeys(fromNote ?? {});
}
