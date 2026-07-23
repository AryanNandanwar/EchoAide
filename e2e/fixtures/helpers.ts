import { APIRequestContext, Page, expect } from '@playwright/test';
import { E2E_BACKEND_URL, E2E_DOCTOR, E2E_RECEPTIONIST } from './test-data';

type LoginAccountType = 'doctor' | 'receptionist';

export async function resetE2eDatabase(request: APIRequestContext) {
  const response = await request.post(`${E2E_BACKEND_URL}/api/e2e/reset`);
  expect(response.ok()).toBeTruthy();
}

export async function loginViaApi(
  request: APIRequestContext,
  accountType: LoginAccountType,
) {
  const credentials =
    accountType === 'doctor' ? E2E_DOCTOR : E2E_RECEPTIONIST;

  const response = await request.post(`${E2E_BACKEND_URL}/api/auth/login`, {
    data: {
      email: credentials.email,
      password: credentials.password,
      accountType,
    },
  });

  expect(response.ok()).toBeTruthy();
  const body = await response.json();

  return {
    accessToken: body.accessToken as string,
    refreshToken: body.refreshToken as string,
    user: { ...body.user, role: accountType },
  };
}

export async function injectAuthSession(
  page: Page,
  session: {
    accessToken: string;
    refreshToken: string;
    user: Record<string, unknown>;
  },
) {
  await page.addInitScript(
    ({ accessToken, refreshToken, user }) => {
      localStorage.setItem('ds_token', accessToken);
      localStorage.setItem('ds_refresh_token', refreshToken);
      localStorage.setItem('ds_user', JSON.stringify(user));
    },
    session,
  );
}

export async function simulateRecordingNote(
  request: APIRequestContext,
  accessToken: string,
  options: { patientDetails?: Record<string, string> } = {},
) {
  const response = await request.post(`${E2E_BACKEND_URL}/api/e2e/simulate-recording`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: options,
  });
  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  return body.noteId as string;
}

export async function openPendingNote(
  page: Page,
  noteId: string,
  patientName?: string,
) {
  const query = new URLSearchParams({ e2eNote: noteId });
  if (patientName) {
    query.set('e2ePatientName', patientName);
  }
  await page.goto(`/?${query.toString()}`);
}

export async function loginDoctorViaUi(page: Page) {
  await page.goto('/login');
  await page.getByRole('textbox', { name: /email/i }).fill(E2E_DOCTOR.email);
  await page.getByLabel(/^password/i).fill(E2E_DOCTOR.password);
  await page.getByRole('button', { name: /log in as doctor/i }).click();
  await expect(page).toHaveURL('/');
}

export async function loginReceptionistViaUi(page: Page) {
  await page.goto('/login');
  await page.getByRole('tab', { name: /receptionist/i }).click();
  await page.getByRole('textbox', { name: /email/i }).fill(E2E_RECEPTIONIST.email);
  await page.getByLabel(/^password/i).fill(E2E_RECEPTIONIST.password);
  await page.getByRole('button', { name: /log in as receptionist/i }).click();
  await expect(page).toHaveURL('/receptionist/intake');
}

export async function waitForStreamingConnected(page: Page) {
  await expect(page.getByText('Connected', { exact: true })).toBeVisible({
    timeout: 30_000,
  });
}

export async function uploadAudioAndGenerateNote(page: Page, filePath: string) {
  await waitForStreamingConnected(page);

  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles(filePath);

  await expect(
    page.getByRole('button', { name: /generate note from/i }),
  ).toBeVisible({ timeout: 10_000 });

  await page.getByRole('button', { name: /generate note from/i }).click();
}

export async function waitForClinicalNoteContent(page: Page) {
  await expect(page.getByText(/clinical note/i).first()).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByText(/websocket patient|fever|viral uri/i).first()).toBeVisible({
    timeout: 60_000,
  });
}

export async function createPatientViaApi(
  request: APIRequestContext,
  accessToken: string,
  fullName: string,
) {
  const response = await request.post(`${E2E_BACKEND_URL}/api/doctor/me/patients`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: { fullName, gender: 'female', age: '35' },
  });
  expect(response.ok()).toBeTruthy();
  return response.json();
}
