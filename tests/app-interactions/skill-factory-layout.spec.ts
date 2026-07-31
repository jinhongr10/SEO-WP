import { expect, test } from '@playwright/test';

test('selected knowledge navigation cards contain their two-line description', async ({ page }) => {
  await page.route('**/api/**', route => route.fulfill({
    json: { ok: true, sources: [], artifacts: [], rulePack: { version: 0, fieldRules: {}, taskContexts: {} } },
  }));
  await page.setViewportSize({ width: 1320, height: 860 });
  await page.goto('/tests/app-interactions/harness.html?theme=light&scale=1');
  await expect(page.locator('body')).toHaveAttribute('data-layout-ready', 'true');

  const card = page.getByRole('button', { name: /\u4ea7品 \/ SKU 信息/ });
  await card.click();

  const geometry = await card.evaluate(element => {
    const buttonRect = element.getBoundingClientRect();
    const description = element.querySelector<HTMLElement>('[data-navigation-card-description]');
    const descriptionRect = description?.getBoundingClientRect();
    return {
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
      buttonBottom: buttonRect.bottom,
      descriptionBottom: descriptionRect?.bottom || 0,
    };
  });

  expect(geometry.scrollHeight).toBeLessThanOrEqual(geometry.clientHeight + 1);
  expect(geometry.descriptionBottom).toBeLessThanOrEqual(geometry.buttonBottom + 1);
});
