import { test, expect } from '@playwright/test';
import {
  loginDoctorViaUi,
  loginReceptionistViaUi,
  loginViaApi,
  openPendingNote,
  resetE2eDatabase,
  simulateRecordingNote,
} from '../fixtures/helpers';

test.describe('Receptionist intake → doctor queue', () => {
  test.beforeEach(async ({ request }) => {
    await resetE2eDatabase(request);
  });

  test('receptionist intake appears on doctor home and note can be opened', async ({
    browser,
    request,
  }) => {
    const patientName = `E2E Queue ${Date.now()}`;

    const receptionistContext = await browser.newContext();
    const receptionistPage = await receptionistContext.newPage();
    await loginReceptionistViaUi(receptionistPage);

    await receptionistPage.getByLabel(/^name/i).fill(patientName);
    await receptionistPage.getByLabel(/^gender/i).click();
    await receptionistPage.getByRole('option', { name: /^female$/i }).click();
    await receptionistPage.getByLabel(/^age/i).fill('42');
    await receptionistPage.getByRole('button', { name: /^save$/i }).click();

    await expect(
      receptionistPage.getByText(/patient added to the doctor's queue/i),
    ).toBeVisible();
    await receptionistContext.close();

    const doctorPage = await browser.newPage();
    await loginDoctorViaUi(doctorPage);

    await expect(doctorPage.getByText(patientName)).toBeVisible({ timeout: 30_000 });

    const doctorSession = await loginViaApi(request, 'doctor');
    const noteId = await simulateRecordingNote(request, doctorSession.accessToken, {
      patientDetails: { name: patientName },
    });
    await openPendingNote(doctorPage, noteId, patientName);

    await expect(
      doctorPage.getByRole('region', { name: /pending clinical note/i }),
    ).toBeVisible({ timeout: 60_000 });
    await expect(doctorPage.getByText(patientName)).toBeVisible({ timeout: 30_000 });

    await doctorPage.close();
  });
});
