import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const projectFile = (relative: string) => new URL(`../../${relative}`, import.meta.url);

test("repository UI policy defines desktop layout guardrails", async () => {
  const [master, agents, legacySpec] = await Promise.all([
    readFile(projectFile("design-system/MASTER.md"), "utf8"),
    readFile(projectFile("AGENTS.md"), "utf8"),
    readFile(projectFile("docs/ui-redesign-spec.md"), "utf8"),
  ]);

  for (const viewport of ["1100×720", "1320×860", "1600×900"]) {
    assert.match(master, new RegExp(viewport));
  }
  assert.match(master, /data-overflow-policy/);
  assert.match(master, /x-scroll/);
  assert.match(master, /y-scroll/);
  assert.match(master, /truncate/);
  assert.match(master, /clip-media/);
  assert.match(master, /overflow-wrap:\s*anywhere/);
  assert.match(master, /design-system\/pages\/<page>\.md/);

  assert.match(agents, /design-system\/MASTER\.md/);
  assert.match(agents, /npm run verify:ui/);
  assert.match(agents, /whitespace-nowrap/);
  assert.match(agents, /overflow:\s*hidden/);

  assert.match(legacySpec, /design-system\/MASTER\.md/);
  assert.match(legacySpec, /历史视觉方向/);
});

test("layout guardrail stylesheet is loaded after the legacy stylesheet", async () => {
  const [entry, styles, legacyStyles, tabsSource] = await Promise.all([
    readFile(projectFile("index.tsx"), "utf8"),
    readFile(projectFile("src/layout-guardrails.css"), "utf8"),
    readFile(projectFile("src/styles.css"), "utf8"),
    readFile(projectFile("components/ui/Tabs.tsx"), "utf8"),
  ]);

  assert.match(entry, /import '\.\/src\/styles\.css';[\s\S]*import '\.\/src\/layout-guardrails\.css';/);
  assert.match(styles, /\.ui-toolbar__start\s*\{[^}]*min-width:\s*0/s);
  assert.match(styles, /\.ui-toolbar__actions[\s\S]*flex-wrap:\s*wrap/);
  assert.match(styles, /\.ui-action-group\s*\{[\s\S]*flex-wrap:\s*wrap/);
  assert.match(styles, /\.ui-prompt-stack\s*\{[^}]*display:\s*grid[^}]*gap:\s*var\(--ds-space-3,\s*12px\)/s);
  assert.match(styles, /\.ui-table-shell\s*\{[\s\S]*overflow-x:\s*auto/);
  assert.match(styles, /\.ui-overflow-text--break-anywhere\s*\{[^}]*overflow-wrap:\s*anywhere/s);
  assert.match(styles, /\.ui-tabs-list[\s\S]*min-width:\s*0/);
  assert.doesNotMatch(styles, /\.ui-tab__title\s*\{[^}]*min-width:\s*112px/s);
  assert.doesNotMatch(legacyStyles, /\.ui-tab__title\s*\{[^}]*min-width:\s*112px/s);
  assert.match(styles, /\.ui-tabs-list \.arco-tabs-header-title \+ \.arco-tabs-header-title\s*\{[^}]*margin-inline-start:\s*var\(--ds-space-1,\s*4px\)/s);
  assert.match(tabsSource, /overflow="scroll"/);
  assert.match(tabsSource, /scrollPosition="auto"/);
});

test("high-risk desktop surfaces use shared layout contracts", async () => {
  const [
    app,
    commandCenter,
    mediaOps,
    blogFormat,
    pagePlanner,
    productSeo,
    dailySeo,
  ] = await Promise.all([
    readFile(projectFile("App.tsx"), "utf8"),
    readFile(projectFile("components/CommandCenterDashboard.tsx"), "utf8"),
    readFile(projectFile("components/MediaOpsDashboard.tsx"), "utf8"),
    readFile(projectFile("components/BlogFormatDashboard.tsx"), "utf8"),
    readFile(projectFile("components/PagePlannerDashboard.tsx"), "utf8"),
    readFile(projectFile("components/ProductSeoDashboard.tsx"), "utf8"),
    readFile(projectFile("components/DailySeoQueuePanel.tsx"), "utf8"),
  ]);

  assert.match(app, /data-testid="system-desktop-shell"[\s\S]{0,180}data-overflow-policy="app-shell"/);
  assert.match(app, /data-testid="system-desktop-shell"[\s\S]{0,180}data-layout-root/);
  assert.match(app, /data-testid="settings-active-pane"[\s\S]{0,180}data-overflow-policy="y-scroll"|data-overflow-policy="y-scroll"[\s\S]{0,180}data-testid="settings-active-pane"/);
  assert.match(app, /data-testid="desktop-workspace-toolbar"[\s\S]{0,180}data-layout-contract="toolbar"/);
  assert.match(app, /data-testid="image-preview-stage"[\s\S]{0,180}data-overflow-policy="clip-media"/);
  assert.match(app, /<OverflowText[\s\S]{0,180}activeWorkspaceLabel/);
  assert.match(app, /<ActionGroup[\s\S]{0,180}quick-action-composer/);

  assert.match(commandCenter, /<Toolbar/);
  assert.match(commandCenter, /<TableShell[^>]*minContentWidth=\{1120\}/);
  assert.match(mediaOps, /<ActionGroup[^>]*className="media-ops-header-actions"/);
  assert.match(mediaOps, /<TableShell[^>]*className="media-ops-table-shell[^\"]*"/);
  assert.doesNotMatch(mediaOps, /<TableShell[^>]*minContentWidth=\{1180\}/);
  assert.match(mediaOps, /className="media-ops-expanded-row\b/);
  assert.match(mediaOps, /className="media-ops-field-grid"/);
  assert.match(blogFormat, /<Toolbar[^>]*className="blog-format-hero-header[^"]*"/);
  assert.match(blogFormat, /<ActionGroup[^>]*className="blog-format-action-bar"/);
  assert.match(pagePlanner, /<Toolbar[^>]*className="page-planner-section-header[^"]*"/);
  assert.match(pagePlanner, /<TableShell[^>]*minContentWidth=\{760\}/);
  assert.match(productSeo, /<ActionGroup[^>]*className="product-seo-action-group product-seo-run-actions"/);
  assert.match(productSeo, /<TableShell[^>]*minContentWidth=\{1100\}/);
  assert.match(dailySeo, /<TableShell[^>]*minContentWidth=\{1040\}/);
});

test("static overflow contracts cover navigation cards, local y-scroll, and app-shell scope", async () => {
  const [app, navigationCard, skillFactory, styles, detector] = await Promise.all([
    readFile(projectFile("App.tsx"), "utf8"),
    readFile(projectFile("components/ui/NavigationCardButton.tsx"), "utf8"),
    readFile(projectFile("components/SkillFactoryDashboard.tsx"), "utf8"),
    readFile(projectFile("src/layout-guardrails.css"), "utf8"),
    readFile(projectFile("tests/ui-layout/overflow.ts"), "utf8"),
  ]);

  assert.match(navigationCard, /data-layout-contract="navigation-card"/);
  assert.match(navigationCard, /<OverflowText[\s\S]*rows=\{2\}/);
  assert.match(styles, /\.ui-navigation-card\.arco-btn\s*\{[^}]*height:\s*auto/s);
  assert.match(styles, /\.ui-navigation-card\.arco-btn[\s\S]*min-width:\s*0/);
  assert.match(skillFactory, /className="skill-section-nav"[^>]*data-overflow-policy="y-scroll"/);
  assert.match(app, /data-overflow-policy="y-scroll"[^>]*data-testid="settings-active-pane"/);
  assert.match(detector, /'x-scroll', 'y-scroll', 'truncate', 'clip-media', 'app-shell'/);
  assert.match(detector, /policy === 'app-shell' && owner === element/);
  assert.match(detector, /isDecorativeCheckboxHoverOverflow/);
  assert.match(detector, /classList\.contains\('arco-icon-hover'\)[\s\S]*classList\.contains\('arco-checkbox-icon-hover'\)/);
  assert.match(detector, /button\.scrollHeight > button\.clientHeight/);
});

test("UI layout verification is wired into package scripts and CI", async () => {
  const [packageSource, workflow] = await Promise.all([
    readFile(projectFile("package.json"), "utf8"),
    readFile(projectFile(".github/workflows/ui-layout-check.yml"), "utf8"),
  ]);
  const packageJson = JSON.parse(packageSource) as { scripts?: Record<string, string>; devDependencies?: Record<string, string> };

  assert.equal(packageJson.scripts?.["test:ui-layout"], "playwright test --config=playwright.ui-layout.config.ts");
  assert.match(packageJson.scripts?.["verify:ui"] || "", /build:web[\s\S]*test:frontend[\s\S]*test:ui-layout[\s\S]*test:interactions/);
  assert.match(packageJson.devDependencies?.["@playwright/test"] || "", /1\.61\.1/);
  assert.match(workflow, /npx playwright install --with-deps chromium/);
  assert.match(workflow, /npm run verify:ui/);
  assert.match(workflow, /actions\/upload-artifact@v4/);
  assert.match(workflow, /if:\s*failure\(\)/);
});
