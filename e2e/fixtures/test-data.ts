export const E2E_BACKEND_URL =
  process.env.E2E_BACKEND_URL ?? `http://127.0.0.1:${process.env.E2E_BACKEND_PORT ?? '3099'}`;

export const E2E_DOCTOR = {
  email: 'e2e-doctor@test.local',
  password: 'E2eDoctor123!',
} as const;

export const E2E_RECEPTIONIST = {
  email: 'e2e-receptionist@test.local',
  password: 'E2eReceptionist123!',
} as const;

export const MOCK_NOTE_PATIENT_NAME = 'WebSocket Patient';
