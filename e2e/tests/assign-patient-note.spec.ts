import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
import {
  createPatientViaApi,
  loginDoctorViaUi,
  loginViaApi,
  openPendingNote,
  resetE2eDatabase,
  simulateRecordingNote,
  waitForClinicalNoteContent,
} from '../fixtures/helpers';
import { MOCK_NOTE_PATIENT_NAME } from '../fixtures/test-data';

test.describe('Assign patient to note lifecycle', () => {
  test.beforeEach(async ({ request }) => {
    await resetE2eDatabase(request);
  });

  test('assign patient → confirm → note appears under /notes', async ({
    page,
    request,
  }) => {
    const doctorSession = await loginViaApi(request, 'doctor');
    await createPatientViaApi(
      request,
      doctorSession.accessToken,
      MOCK_NOTE_PATIENT_NAME,
    );

    await loginDoctorViaUi(page);

    const noteId = await simulateRecordingNote(request, doctorSession.accessToken);
    await openPendingNote(page, noteId);

    await expect(
      page.getByRole('region', { name: /pending clinical note/i }),
    ).toBeVisible({ timeout: 60_000 });
    await waitForClinicalNoteContent(page);

    await page.getByRole('region', { name: /pending clinical note/i })
      .getByRole('button', { name: /^save$/i })
      .click();

    await expect(page.getByRole('dialog', { name: /patient found/i })).toBeVisible();
    await page.getByRole('button', { name: /yes, attach note/i }).click();

    await page.goto('/notes');
    await expect(page.getByRole('heading', { name: /clinical notes/i })).toBeVisible();
    await expect(page.getByText(MOCK_NOTE_PATIENT_NAME)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/viral uri|fever|cough/i).first()).toBeVisible();
  });
});
