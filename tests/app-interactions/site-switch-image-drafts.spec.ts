import { expect, test } from '@playwright/test';
import { installAppApiFixture, QA_SITE_B_ID, QA_SITE_ID } from './app-api-fixture';
import {
  openApp,
  openImageWorkspace,
  switchSite,
  uploadFakeImage,
} from './helpers';

test('switching sites clears local image drafts so leftovers cannot follow the user', async ({ page }) => {
  const api = await installAppApiFixture(page, { multiSite: true });
  await openApp(page);

  await uploadFakeImage(page, 'site-a-draft.png');
  await expect(page.getByTestId('image-processing-layout')).toBeVisible();
  await expect(page.getByTestId('image-preview-card')).toBeVisible();
  // Empty dropzone is replaced by the processing layout while drafts exist.
  await expect(page.getByTestId('image-empty-upload-dropzone')).toHaveCount(0);

  await switchSite(page, QA_SITE_B_ID);
  await expect.poll(() => api.getActiveSiteId()).toBe(QA_SITE_B_ID);
  await expect(page.getByText('第二 QA 站点').first()).toBeVisible();

  await openImageWorkspace(page);
  // Site B should start with no image drafts.
  await expect(page.getByTestId('image-empty-upload-dropzone')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('image-processing-layout')).toHaveCount(0);

  await switchSite(page, QA_SITE_ID);
  await expect.poll(() => api.getActiveSiteId()).toBe(QA_SITE_ID);
  await openImageWorkspace(page);
  // Drafts were cleared on leave — A does not restore the fake image either.
  await expect(page.getByTestId('image-empty-upload-dropzone')).toBeVisible();
  await expect(page.getByTestId('image-processing-layout')).toHaveCount(0);

  await api.assertClean();
});
