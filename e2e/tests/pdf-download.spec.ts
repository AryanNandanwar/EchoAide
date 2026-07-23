import { test, expect } from '@playwright/test';
import {
  loginDoctorViaUi,
  loginViaApi,
  openPendingNote,
  resetE2eDatabase,
  simulateRecordingNote,
  waitForClinicalNoteContent,
} from '../fixtures/helpers';
import { E2E_BACKEND_URL } from '../fixtures/test-data';

test.describe('PDF download', () => {
  test.beforeEach(async ({ request }) => {
    await resetE2eDatabase(request);
  });

  test('downloads a clinical note PDF from /notes', async ({ page, request }) => {
    await loginDoctorViaUi(page);

    const doctorSession = await loginViaApi(request, 'doctor');
    const noteId = await simulateRecordingNote(request, doctorSession.accessToken);
    await openPendingNote(page, noteId);

    await expect(
      page.getByRole('region', { name: /pending clinical note/i }),
    ).toBeVisible({ timeout: 60_000 });
    await waitForClinicalNoteContent(page);

    await page.goto('/notes');
    await expect(page.getByRole('heading', { name: /clinical notes/i })).toBeVisible();

    const downloadPromise = page.waitForEvent('download');
    await page.getByTitle('Download PDF').first().click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/clinical_note_.*\.pdf$/);

    const notesResponse = await request.get(`${E2E_BACKEND_URL}/api/clinical-notes`, {
      headers: { Authorization: `Bearer ${doctorSession.accessToken}` },
    });
    expect(notesResponse.ok()).toBeTruthy();
  });
});
