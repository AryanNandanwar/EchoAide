import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
import {
  loginDoctorViaUi,
  resetE2eDatabase,
  uploadAudioAndGenerateNote,
  waitForClinicalNoteContent,
} from '../fixtures/helpers';

const sampleAudioPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../fixtures/sample.wav',
);

test.describe('Doctor upload recording (WebSocket)', () => {
  test.beforeEach(async ({ request }) => {
    await resetE2eDatabase(request);
  });

  test('upload audio over WebSocket and render a pending note', async ({ page }) => {
    test.skip(
      process.env.E2E_FULL_WS !== '1',
      'Set E2E_FULL_WS=1 to run the live WebSocket upload journey (requires stable Socket.IO).',
    );

    await loginDoctorViaUi(page);
    await uploadAudioAndGenerateNote(page, sampleAudioPath);

    await expect(
      page.getByRole('region', { name: /pending clinical note/i }),
    ).toBeVisible({ timeout: 90_000 });

    await waitForClinicalNoteContent(page);
  });
});
