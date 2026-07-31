import { expect, test } from '@playwright/test';
import { expectNoUnexpectedOverflow } from '../ui-layout/overflow';
import { defaultBlogFrameworkStandard } from '../../services/clientProfileService';

const frameworkPresets = defaultBlogFrameworkStandard().frameworks;

test.beforeEach(async ({ page }) => {
  await page.route('**/api/**', async route => {
    const request = route.request();
    if (request.url().includes('/bulk-blog-format') && request.method() === 'PUT') {
      const body = request.postDataJSON();
      return route.fulfill({ json: { ok: true, bulkBlogFormat: { ...body.bulkBlogFormat, status: 'configured', version: 3 } } });
    }
    if (request.url().includes('/blog-framework-standard/assistant') && request.method() === 'POST') {
      const body = request.postDataJSON();
      const standard = body.standard;
      const frameworks = standard.frameworks.map((framework: any) => framework.id === body.frameworkId
        ? { ...framework, voiceRules: ['开头直接回答，不写空泛介绍。', ...framework.voiceRules] }
        : framework);
      return route.fulfill({ json: {
        ok: true,
        standard: { ...standard, status: 'configured', frameworks },
        reply: '已把开头调整为直接回答。',
        warnings: [],
        changes: [{ path: 'voiceRules', label: '语气与可读性', before: [], after: frameworks[0].voiceRules, reason: '根据反馈调整' }],
      } });
    }
    if (request.url().includes('/blog-framework-standard') && request.method() === 'PUT') {
      const body = request.postDataJSON();
      return route.fulfill({ json: { ok: true, standard: { ...body.standard, status: 'configured', version: 1 }, presets: frameworkPresets } });
    }
    if (request.url().includes('/blog-framework-standard') && request.method() === 'GET') {
      return route.fulfill({ json: { ok: true, standard: defaultBlogFrameworkStandard(), presets: frameworkPresets } });
    }
    if (request.url().includes('/blog-frameworks') && request.method() === 'PUT') {
      return route.fulfill({ json: { ok: true, frameworks: request.postDataJSON().frameworks } });
    }
    return route.fulfill({ json: { ok: true, sources: [], artifacts: [], rulePack: { version: 0, fieldRules: {}, taskContexts: {}, sourceArtifactIds: [], status: 'draft', updatedAt: '' } } });
  });
  await page.goto('/tests/app-interactions/harness.html');
});

test('site knowledge base exposes the Blog framework AI workbench and article blueprint', async ({ page }) => {
  await expect(page.getByRole('button', { name: /博客写作框架/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /历史博客修复格式/ })).toBeVisible();
  await page.getByRole('button', { name: /博客写作框架/ }).click();
  await expect(page.getByRole('heading', { name: /博客撰写框架 AI 工作台/ })).toBeVisible();
  await expect(page.getByRole('tab', { name: '通用 SEO 文章' })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('tab', { name: '展会复盘' }).click();
  await expect(page.getByRole('tab', { name: '展会复盘' })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: '新增自定义框架' }).click();
  await expect(page.getByRole('tab', { name: '自定义博客框架' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('AI 最终按这张施工图生成文章')).toBeVisible();
  await expect(page.getByText('生成前必须提供')).toBeVisible();
  await expect(page.getByText('禁止编造')).toBeVisible();

  await page.getByPlaceholder(/开头直接回答/).fill('开头不要空话，直接回答读者的问题');
  await page.getByRole('button', { name: '让 AI 修改当前框架' }).click();
  await expect(page.getByRole('alert').getByText('已把开头调整为直接回答。')).toBeVisible();
  await expect(page.getByText(/语气与可读性 · 根据反馈调整/)).toBeVisible();
  await page.getByRole('button', { name: '已保存框架' }).click();
  await page.getByRole('button', { name: 'AI 修改后' }).click();
  await page.getByRole('button', { name: '保存为站点框架标准' }).click();
  await expect(page.getByText(/框架标准 v1 已保存/)).toBeVisible();
});

test('article type tabs keep adjacent states separate and the create action outside the tablist', async ({ page }) => {
  await page.getByRole('button', { name: /博客写作框架/ }).click();
  const projectTab = page.getByRole('tab', { name: '项目案例' });
  const videoTab = page.getByRole('tab', { name: '视频博客' });
  await projectTab.click();
  await videoTab.hover();

  const [projectBox, videoBox] = await Promise.all([projectTab.boundingBox(), videoTab.boundingBox()]);
  expect(projectBox).not.toBeNull();
  expect(videoBox).not.toBeNull();
  expect((videoBox?.x || 0) - ((projectBox?.x || 0) + (projectBox?.width || 0))).toBeGreaterThanOrEqual(4);

  const tabs = page.locator('.blog-framework-workbench__tabs');
  const addButton = page.getByRole('button', { name: '新增自定义框架' });
  await expect(addButton).toBeVisible();
  await expect(tabs.getByRole('button', { name: '新增自定义框架' })).toHaveCount(0);
});

test('AI prompt inputs keep a distinct action area', async ({ page }) => {
  const expectPromptGap = async (promptSelector: string) => {
    const prompt = page.locator(promptSelector);
    await expect(prompt).toBeVisible();
    const [textareaBox, actionBox] = await Promise.all([
      prompt.locator('textarea').first().boundingBox(),
      prompt.locator('.ui-action-group, button').last().boundingBox(),
    ]);
    expect(textareaBox).not.toBeNull();
    expect(actionBox).not.toBeNull();
    expect((actionBox?.y || 0) - ((textareaBox?.y || 0) + (textareaBox?.height || 0))).toBeGreaterThanOrEqual(12);
  };

  await page.getByRole('button', { name: /历史博客修复格式/ }).click();
  await expectPromptGap('.blog-format-standard-workbench .ui-prompt-stack');

  await page.getByRole('button', { name: /博客写作框架/ }).click();
  await expectPromptGap('.blog-framework-workbench .ui-prompt-stack');
});

test('FAQ library actions stay grouped and the section header adapts as one unit', async ({ page }) => {
  const assertFaqActions = async (expectRightAligned: boolean) => {
    await page.getByRole('button', { name: /FAQ 库/ }).click();
    const heading = page.getByRole('heading', { name: 'FAQ 库' });
    const toolbar = heading.locator('xpath=ancestor::*[@data-layout-contract="toolbar"][1]');
    const start = toolbar.locator('.ui-toolbar__start');
    const actions = toolbar.locator('.ui-toolbar__actions');
    const generateButton = page.getByRole('button', { name: '根据资料生成 FAQ' });
    const addButton = page.getByRole('button', { name: '手动新增 FAQ' });
    await expect(toolbar).toBeVisible();

    const [toolbarBox, startBox, actionsBox, generateBox, addBox] = await Promise.all([
      toolbar.boundingBox(),
      start.boundingBox(),
      actions.boundingBox(),
      generateButton.boundingBox(),
      addButton.boundingBox(),
    ]);
    expect(toolbarBox).not.toBeNull();
    expect(startBox).not.toBeNull();
    expect(actionsBox).not.toBeNull();
    expect(generateBox).not.toBeNull();
    expect(addBox).not.toBeNull();
    expect(Math.abs((generateBox?.y || 0) - (addBox?.y || 0))).toBeLessThanOrEqual(1);
    expect((addBox?.x || 0) - ((generateBox?.x || 0) + (generateBox?.width || 0))).toBeGreaterThanOrEqual(8);
    const overlapX = Math.min((startBox?.x || 0) + (startBox?.width || 0), (actionsBox?.x || 0) + (actionsBox?.width || 0))
      - Math.max(startBox?.x || 0, actionsBox?.x || 0);
    const overlapY = Math.min((startBox?.y || 0) + (startBox?.height || 0), (actionsBox?.y || 0) + (actionsBox?.height || 0))
      - Math.max(startBox?.y || 0, actionsBox?.y || 0);
    expect(overlapX > 1 && overlapY > 1).toBe(false);
    expect((actionsBox?.x || 0) + (actionsBox?.width || 0)).toBeLessThanOrEqual((toolbarBox?.x || 0) + (toolbarBox?.width || 0));
    expect((actionsBox?.y || 0) + (actionsBox?.height || 0)).toBeLessThanOrEqual((toolbarBox?.y || 0) + (toolbarBox?.height || 0));
    if (expectRightAligned) {
      expect((toolbarBox?.x || 0) + (toolbarBox?.width || 0) - ((actionsBox?.x || 0) + (actionsBox?.width || 0))).toBeLessThanOrEqual(17);
    }
  };

  await assertFaqActions(true);
  await page.setViewportSize({ width: 1100, height: 720 });
  await page.goto('/tests/app-interactions/harness.html?scale=1.5');
  await assertFaqActions(false);
});

test('historical Blog format can be edited and saved', async ({ page }) => {
  await page.getByRole('button', { name: /历史博客修复格式/ }).click();
  await expect(page.getByTestId('bulk-blog-format-editor')).toBeVisible();
  await page.getByText('高级设置：文章类型、CTA 与事实规则').click();
  await page.getByLabel('正文最大宽度').fill('840');
  await page.getByRole('button', { name: '保存高级规则' }).click();
  await expect(page.getByText(/历史博客修复格式已保存/)).toBeVisible();
});

test('bulk repair shows active format and links back to its settings', async ({ page }) => {
  await page.getByTestId('show-repair').click();
  await expect(page.getByTestId('active-site-blog-format-status')).toContainText('测试站点');
  await page.getByRole('button', { name: '调整格式标准' }).click();
  await expect(page.getByTestId('bulk-blog-format-editor')).toBeVisible();
});

for (const viewport of [{ width: 1100, height: 720 }, { width: 1320, height: 860 }, { width: 1600, height: 900 }]) {
  for (const theme of ['light', 'dark']) {
    for (const scale of [1, 1.25, 1.5]) {
      test(`Blog configuration layouts fit ${viewport.width}px ${theme} ${scale}`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await page.goto(`/tests/app-interactions/harness.html?theme=${theme}&scale=${scale}`);
        await expect(page.locator('body')).toHaveAttribute('data-layout-ready', 'true');
        await expectNoUnexpectedOverflow(page);
        await page.getByRole('button', { name: /博客写作框架/ }).click();
        await expect(page.getByTestId('blog-framework-standard-workbench')).toBeVisible();
        const contentColumnCount = await page.locator('.blog-framework-workbench__content-grid').evaluate(element => (
          getComputedStyle(element).gridTemplateColumns.split(/\s+/).filter(Boolean).length
        ));
        expect(contentColumnCount).toBe(viewport.width >= 1280 ? 2 : 1);
        await expectNoUnexpectedOverflow(page);
        await page.getByRole('button', { name: /FAQ 库/ }).click();
        const [generateFaqBox, addFaqBox] = await Promise.all([
          page.getByRole('button', { name: '根据资料生成 FAQ' }).boundingBox(),
          page.getByRole('button', { name: '手动新增 FAQ' }).boundingBox(),
        ]);
        expect(generateFaqBox).not.toBeNull();
        expect(addFaqBox).not.toBeNull();
        expect(Math.abs((generateFaqBox?.y || 0) - (addFaqBox?.y || 0))).toBeLessThanOrEqual(1);
        await expectNoUnexpectedOverflow(page);
        await page.getByTestId('show-repair').click();
        await expectNoUnexpectedOverflow(page);
      });
    }
  }
}
