import { test, expect } from '@playwright/test';
import {
  loginDoctorViaUi,
  loginViaApi,
  openPendingNote,
  resetE2eDatabase,
  simulateRecordingNote,
  waitForClinicalNoteContent,
} from '../fixtures/helpers';

test.describe('Doctor recording journey', () => {
  test.beforeEach(async ({ request }) => {
    await resetE2eDatabase(request);
  });

  test('login → home → simulated recording → pending note appears', async ({
    page,
    request,
  }) => {
    await loginDoctorViaUi(page);

    await expect(page.getByRole('heading', { name: /welcome/i })).toBeVisible();

    const session = await loginViaApi(request, 'doctor');
    const noteId = await simulateRecordingNote(request, session.accessToken);
    await openPendingNote(page, noteId);

    await expect(
      page.getByRole('region', { name: /pending clinical note/i }),
    ).toBeVisible({ timeout: 60_000 });

    await waitForClinicalNoteContent(page);
  });
});
