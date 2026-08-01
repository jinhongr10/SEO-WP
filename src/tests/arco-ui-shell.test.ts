import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const projectFile = (relative: string) => new URL(`../../${relative}`, import.meta.url);

test("app entry wires Arco CSS and ConfigProvider", async () => {
  const source = await readFile(projectFile("index.tsx"), "utf8");

  assert.match(source, /@arco-design\/web-react\/dist\/css\/arco\.css/);
  assert.match(source, /import\s+\{\s*ConfigProvider\s*\}\s+from\s+['"]@arco-design\/web-react['"]/);
  assert.match(source, /<ConfigProvider[\s\S]*size="default"[\s\S]*<App \/>[\s\S]*<\/ConfigProvider>/);
});

test("shared UI layer adapts existing components to Arco", async () => {
  const button = await readFile(projectFile("components/ui/Button.tsx"), "utf8");
  const field = await readFile(projectFile("components/ui/Field.tsx"), "utf8");
  const tabs = await readFile(projectFile("components/ui/Tabs.tsx"), "utf8");
  const panel = await readFile(projectFile("components/ui/Panel.tsx"), "utf8");
  const table = await readFile(projectFile("components/ui/Table.tsx"), "utf8");
  const badge = await readFile(projectFile("components/ui/Badge.tsx"), "utf8");
  const status = await readFile(projectFile("components/ui/StatusPill.tsx"), "utf8");
  const empty = await readFile(projectFile("components/ui/EmptyState.tsx"), "utf8");

  assert.match(button, /ArcoButton/);
  assert.match(button, /mapButtonVariant/);
  assert.match(field, /ArcoInput/);
  assert.match(field, /ArcoSelect/);
  assert.match(field, /createSelectChangeEvent/);
  assert.match(tabs, /ArcoTabs/);
  assert.match(panel, /ArcoCard/);
  assert.match(table, /ArcoTable/);
  assert.match(badge, /ArcoTag/);
  assert.match(status, /ArcoTag/);
  assert.match(empty, /ArcoEmpty/);
});

test("desktop shell uses Arco layout, menu, dropdown, and tabs primitives", async () => {
  const app = await readFile(projectFile("App.tsx"), "utf8");

  assert.match(app, /ArcoLayout/);
  assert.match(app, /ArcoMenu/);
  assert.match(app, /ArcoDropdown/);
  assert.match(app, /ArcoTabs/);
  assert.match(app, /ArcoLayout\.Sider/);
  assert.match(app, /onClickMenuItem={key => navigateToMode\(key as AppViewMode\)}/);
  assert.match(app, /<ArcoMenu\.Item[\s\S]*key={mode}/);
  assert.doesNotMatch(app, /system-sidebar-nav-item control-nav-tab/);
  assert.doesNotMatch(app, /system-sidebar-nav-active/);
  assert.doesNotMatch(app, /system-sidebar-nav-idle/);
  assert.match(app, /data-testid="desktop-sidebar"/);
  assert.match(app, /data-testid="mode-toggle-list"/);
  assert.match(app, /data-testid="quick-action-menu"/);
  assert.match(app, /data-testid="blog-workspace-tabs"/);
  assert.match(app, /data-testid="media-workspace-tabs"/);
});

test("arco shell stylesheet defines the light admin chrome", async () => {
  const styles = await readFile(projectFile("src/styles.css"), "utf8");

  assert.match(styles, /\.arco-shell/);
  assert.match(styles, /\.arco-sidebar/);
  assert.match(styles, /\.arco-sidebar-menu\s+\.arco-menu-item/);
  assert.match(styles, /\.arco-sidebar-menu\s+\.arco-menu-selected/);
  assert.match(styles, /\.arco-workspace-tabs/);
  assert.match(styles, /--ds-sidebar:\s*#ffffff/);
  assert.match(styles, /\.arco-shell\s+\.arco-layout-sider/);
});

test("desktop window controls stay at each platform's native top edge", async () => {
  const styles = await readFile(projectFile("src/styles.css"), "utf8");
  const main = await readFile(projectFile("desktop/main.cjs"), "utf8");

  assert.match(main, /titleBarStyle:\s*process\.platform === 'darwin' \? 'hiddenInset' : 'default'/);
  assert.match(main, /trafficLightPosition:\s*process\.platform === 'darwin' \? \{ x:\s*12,\s*y:\s*16 \} : undefined/);
  assert.match(
    styles,
    /html\[data-runtime="desktop"\]\s+:is\(\[data-testid="desktop-sidebar"\]\[data-collapsed="true"\],\s*\.system-sidebar--collapsed\)\s+\.system-sidebar-brand-zone\s*\{[\s\S]*?padding-top:\s*40px/,
  );
  assert.match(
    styles,
    /html\[data-runtime="desktop"\]\[data-platform="darwin"\]\s+:is\(\[data-testid="desktop-sidebar"\]\[data-collapsed="true"\],\s*\.system-sidebar--collapsed\)\s+\.system-sidebar-brand-zone\s*\{[\s\S]*?padding-top:\s*48px/,
  );
  assert.match(
    styles,
    /html\[data-runtime="desktop"\]\s+:is\(\[data-testid="desktop-sidebar"\]\[data-collapsed="true"\],\s*\.system-sidebar--collapsed\)\s+\.control-brand\s*\{[\s\S]*?place-items:\s*center/,
  );
});


test("desktop shell migrates first-run chrome to Arco surfaces", async () => {
  const app = await readFile(projectFile("App.tsx"), "utf8");

  assert.match(app, /Alert as ArcoAlert/);
  assert.match(app, /Badge as ArcoBadge/);
  assert.match(app, /Button as ArcoButton/);
  assert.match(app, /Card as ArcoCard/);
  assert.match(app, /Modal as ArcoModal/);
  assert.match(app, /Popover as ArcoPopover/);
  assert.match(app, /Select as ArcoSelect/);
  assert.match(app, /Space as ArcoSpace/);
  assert.match(app, /ArcoLayout\.Header/);
  assert.match(app, /<ArcoPopover[\s\S]*data-testid="system-network-status-details"/);
  assert.match(app, /<ArcoPopover[\s\S]*data-testid="workspace-message-panel"/);
  assert.match(app, /<ArcoModal[\s\S]*data-testid="settings-modal"/);
  assert.match(app, /<ArcoCard[\s\S]*data-testid="quick-action-menu"/);
  assert.match(app, /<ArcoSelect[\s\S]*data-testid="sidebar-site-select"/);
  assert.match(app, /<ArcoBadge[\s\S]*workspaceMessages\.length/);
  assert.doesNotMatch(app, /fixed inset-0 z-\[200\]/);
  assert.doesNotMatch(app, /messageCenterOpen && \(/);
});

test("Windows platform uses Segoe UI tokens while other platforms retain the base stack", async () => {
  const styles = await readFile(projectFile("src/styles.css"), "utf8");
  const windowsTokenOverride = /html\[data-platform="win32"\]\s*\{[\s\S]*?--font-app:\s*"Segoe UI Variable", "Segoe UI", "Microsoft YaHei UI", sans-serif;[\s\S]*?--font-sans:\s*"Segoe UI Variable", "Segoe UI", "Microsoft YaHei UI", sans-serif;/;

  assert.match(styles, windowsTokenOverride);
  assert.match(styles, /@theme\s*\{[\s\S]*?--font-sans:\s*"Poppins"/);
  assert.match(styles, /:root\s*\{[\s\S]*?--font-app:\s*"Poppins"/);
});

test("app entry initializes the platform token before React mounts", async () => {
  const source = await readFile(projectFile("index.tsx"), "utf8");
  const platformInitialization = "document.documentElement.dataset.platform = window.seoWpSyncDesktop?.platform ?? 'browser';";

  assert.ok(source.includes(platformInitialization));
  assert.ok(source.indexOf(platformInitialization) < source.indexOf("ReactDOM.createRoot"));
});
