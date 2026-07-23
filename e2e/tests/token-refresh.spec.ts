import { test, expect } from '@playwright/test';
import {
  loginDoctorViaUi,
  resetE2eDatabase,
} from '../fixtures/helpers';

test.describe('Token refresh on 401', () => {
  test.beforeEach(async ({ request }) => {
    await resetE2eDatabase(request);
  });

  test('refreshes access token and retries API calls after 401', async ({ page }) => {
    await loginDoctorViaUi(page);

    let patientsCalls = 0;
    await page.route('**/api/doctor/me/patients**', async (route) => {
      patientsCalls += 1;
      if (patientsCalls === 1) {
        await route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Unauthorized' }),
        });
        return;
      }
      await route.continue();
    });

    const originalToken = await page.evaluate(() => localStorage.getItem('ds_token'));

    await page.goto('/patients');

    await expect(page.getByText(/my patients/i)).toBeVisible({ timeout: 30_000 });
    expect(patientsCalls).toBeGreaterThanOrEqual(2);

    const refreshedToken = await page.evaluate(() => localStorage.getItem('ds_token'));
    expect(refreshedToken).toBeTruthy();
    expect(refreshedToken).not.toBe(originalToken);
  });
});
