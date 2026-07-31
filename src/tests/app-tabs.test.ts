import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const theme = {
  bg: 'bg-gray-50',
  text: 'text-slate-700',
  cardBg: 'bg-white',
  cardBorder: 'border-gray-200',
  subText: 'text-gray-500',
  heading: 'text-gray-900',
  inputBg: 'bg-gray-50',
  inputBorder: 'border-gray-300',
};

test('top navigation keeps WooCommerce and removes Data Insights and Upload Product', async () => {
  const appTabsModule = await import('../../appTabs.ts');
  const tabs = appTabsModule.APP_MODE_TABS as Array<{ mode: string; label: string }>;
  const blogWorkspaceTabs = appTabsModule.BLOG_WORKSPACE_TABS as Array<{ mode: string; label: string }>;
  const mediaWorkspaceTabs = appTabsModule.MEDIA_WORKSPACE_TABS as Array<{ mode: string; label: string }>;

  assert.ok(Array.isArray(tabs), 'Top navigation should use the shared APP_MODE_TABS config');
  assert.deepEqual(
    tabs.map(tab => tab.mode),
    ['commandCenter', 'skillFactory', 'brandStarter', 'seoAudit', 'mediaWorkspace', 'blogWorkspace', 'pagePlanner', 'productSeo'],
  );

  const labelsByMode = new Map(tabs.map(tab => [tab.mode, tab.label]));
  assert.equal(labelsByMode.get('commandCenter'), '中控台');
  assert.equal(labelsByMode.get('skillFactory'), '站点资料库');
  assert.equal(labelsByMode.has('sitemap'), false);
  assert.equal(labelsByMode.get('brandStarter'), '品牌启动器');
  assert.equal(labelsByMode.has('dataInsights'), false);
  assert.equal(labelsByMode.get('seoAudit'), 'SEO 审计');
  assert.equal(labelsByMode.get('mediaWorkspace'), '图片与媒体SEO');
  assert.equal(labelsByMode.has('image'), false);
  assert.equal(labelsByMode.has('mediaOps'), false);
  assert.equal(labelsByMode.get('blogWorkspace'), '博客撰写与修改');
  assert.equal(labelsByMode.has('blog'), false);
  assert.equal(labelsByMode.has('blogAi'), false);
  assert.equal(labelsByMode.has('blogFormat'), false);
  assert.equal(labelsByMode.get('pagePlanner'), '页面计划');
  assert.equal(labelsByMode.get('productSeo'), 'WooCommerce');
  assert.equal(labelsByMode.has('designPreview'), false);
  assert.equal(labelsByMode.has('productUpload'), false);

  assert.deepEqual(
    blogWorkspaceTabs.map(tab => tab.mode),
    ['blog', 'blogAi', 'blogFormat'],
  );
  const blogLabelsByMode = new Map(blogWorkspaceTabs.map(tab => [tab.mode, tab.label]));
  assert.equal(blogLabelsByMode.get('blog'), '博客写作');
  assert.equal(blogLabelsByMode.get('blogAi'), '展会/证书/项目博客');
  assert.equal(blogLabelsByMode.get('blogFormat'), '批量修复博客格式');

  assert.deepEqual(
    mediaWorkspaceTabs.map(tab => tab.mode),
    ['image', 'mediaOps'],
  );
  const mediaLabelsByMode = new Map(mediaWorkspaceTabs.map(tab => [tab.mode, tab.label]));
  assert.equal(mediaLabelsByMode.get('image'), '图片处理');
  assert.equal(mediaLabelsByMode.get('mediaOps'), '媒体库SEO压缩');
});

test('App lazy-loads heavy workspace dashboards', async () => {
  const { readFile } = await import('node:fs/promises');
  const appSource = await readFile(new URL('../../App.tsx', import.meta.url), 'utf8');
  const tabsSource = await readFile(new URL('../../appTabs.ts', import.meta.url), 'utf8');
  const source = `${appSource}\n${tabsSource}`;

  for (const dashboard of [
    'ProductSeoDashboard',
    'BlogFormatDashboard',
    'BlogAIGeneratorDashboard',
    'PagePlannerDashboard',
    'CommandCenterDashboard',
    'SeoAuditDashboard',
    'MediaOpsDashboard',
    'SkillFactoryDashboard',
    'BrandStarterDashboard',
  ]) {
    assert.doesNotMatch(source, new RegExp(`import \\{ ${dashboard} \\} from './components/${dashboard}'`));
    assert.match(source, new RegExp(`lazy\\(\\(\\) => import\\('./components/${dashboard}'\\)`));
  }
  assert.doesNotMatch(source, /SeoDiagnosticsDashboard/);
  assert.doesNotMatch(source, /const MediaOpsDashboard: React\.FC/);
});

test('Excel parsing library loads only when a spreadsheet is imported', async () => {
  const { readFile } = await import('node:fs/promises');
  const appSource = await readFile(new URL('../../App.tsx', import.meta.url), 'utf8');
  const mediaOpsSource = await readFile(new URL('../../components/MediaOpsDashboard.tsx', import.meta.url), 'utf8');
  const excelSource = await readFile(new URL('../../services/excelUtils.ts', import.meta.url), 'utf8');

  assert.doesNotMatch(appSource, /import \* as XLSX from 'xlsx'/);
  assert.doesNotMatch(mediaOpsSource, /import \* as XLSX from 'xlsx'/);
  assert.doesNotMatch(appSource, /import \{ parseExcelFile \} from '.\/services\/excelUtils'/);
  assert.match(appSource, /await import\('.\/services\/excelUtils'\)/);
  assert.doesNotMatch(mediaOpsSource, /await import\('xlsx'\)/);
  assert.doesNotMatch(excelSource, /import \* as XLSX from 'xlsx'/);
  assert.match(excelSource, /await import\('xlsx'\)/);
});

test('WooCommerce dashboard renders without the removed Upload Product surface', async () => {
  const { readFile } = await import('node:fs/promises');
  const productModule = await import('../../components/ProductSeoDashboard.tsx');
  const ProductSeoDashboard = productModule.ProductSeoDashboard as React.ComponentType<any>;
  const productSource = await readFile(new URL('../../components/ProductSeoDashboard.tsx', import.meta.url), 'utf8');
  assert.equal('ProductUploadDashboard' in productModule, false);

  const commonProps = {
    theme,
    getApiKey: () => '',
    requireApiKey: () => undefined,
    onNotice: () => undefined,
    keywordContext: 'product sample keyword database',
    companyContext: 'Demo Brand factory context',
  };
  const seoHtml = renderToStaticMarkup(React.createElement(ProductSeoDashboard, commonProps));

  assert.match(seoHtml, /WooCommerce 产品 SEO/);
  assert.match(seoHtml, /批量核心关键词/);
  assert.match(seoHtml, /用于本次批量 AI 生成/);
  assert.doesNotMatch(seoHtml, /产品词库已连接/);
  assert.doesNotMatch(seoHtml, /站点资料已连接/);
  assert.match(productSource, /id="product-seo-keyword-category"/);
  assert.match(productSource, /产品词库类目/);
  assert.match(productSource, /到站点资料修改规则/);
  assert.doesNotMatch(productSource, /<ProductTemplateRulesModal/);
  assert.doesNotMatch(productSource, /ACF Extra Info/);
  assert.doesNotMatch(seoHtml, /上传产品/);
});

test('desktop dark mode keeps Arco inputs and settings modal readable', async () => {
  const { readFile } = await import('node:fs/promises');
  const styles = await readFile(new URL('../../src/styles.css', import.meta.url), 'utf8');

  assert.match(styles, /--color-bg-1:\s*var\(--system-surface\)/);
  assert.match(styles, /html\.dark \.arco-input[\s\S]*background:\s*var\(--system-field\)\s*!important/);
  assert.match(styles, /html\.dark \.arco-select-view-value[\s\S]*color:\s*var\(--system-field-text\)\s*!important/);
  assert.match(styles, /\.arco-select\.ui-select\s*\{[\s\S]*border:\s*0;/);
  assert.match(styles, /\.arco-select\.ui-select \.arco-select-view\s*\{[\s\S]*border-color:\s*var\(--system-border-strong\)/);
  assert.match(styles, /\.settings-arco-modal\.arco-modal[\s\S]*background:\s*var\(--system-surface\)\s*!important/);
  assert.match(styles, /\.settings-modal-shell[\s\S]*background:\s*var\(--system-surface\)/);
  assert.match(styles, /html\.dark \.arco-table[\s\S]*background:\s*var\(--system-surface\)\s*!important/);
  assert.match(styles, /html\.dark \.arco-table-th[\s\S]*background:\s*var\(--system-surface-strong\)\s*!important/);
  assert.match(styles, /html\.dark \.ui-status-pill--muted\.arco-tag[\s\S]*background:\s*var\(--system-surface-strong\)\s*!important/);
  assert.match(styles, /html\.dark \.arco-badge-number[\s\S]*background:\s*#b91c1c\s*!important/);
});

test('desktop dark mode synchronizes the Arco theme attribute', async () => {
  const { readFile } = await import('node:fs/promises');
  const appSource = await readFile(new URL('../../App.tsx', import.meta.url), 'utf8');

  assert.match(appSource, /document\.body\.setAttribute\(['"]arco-theme['"],\s*['"]dark['"]\)/);
  assert.match(appSource, /document\.body\.removeAttribute\(['"]arco-theme['"]\)/);
});

test('brand starter editor follows app dark mode without forcing preview theme', async () => {
  const { readFile } = await import('node:fs/promises');
  const dashboardSource = await readFile(new URL('../../components/BrandStarterDashboard.tsx', import.meta.url), 'utf8');
  const styles = await readFile(new URL('../../src/styles.css', import.meta.url), 'utf8');

  assert.match(styles, /\.brand-palette-workbench,\s*[\s\S]{0,120}\.brand-source-compact,\s*[\s\S]{0,120}\.brand-role-mapping-panel\s*\{[\s\S]{0,220}background:\s*var\(--system-surface-strong\)/);
  assert.match(styles, /\.brand-reference-hex-field > div\s*\{[\s\S]{0,220}background:\s*var\(--system-field\)/);
  assert.match(styles, /\.brand-token-card\s*\{[\s\S]{0,260}background:\s*var\(--system-surface\)/);
  assert.match(styles, /\.brand-contrast-preview\s*\{[\s\S]{0,260}background:\s*var\(--system-surface-strong\)/);
  assert.doesNotMatch(styles, /\.system-workspace \.brand-palette-workbench[\s\S]{0,360}background:\s*#ffffff\s*!important/);
  assert.doesNotMatch(styles, /\.system-workspace \.brand-palette-workbench[\s\S]{0,420}color:\s*#111827\s*!important/);
  assert.match(dashboardSource, /themeMode=\{previewTheme\}/);
  assert.match(styles, /\.brand-live-preview\s*\{[\s\S]{0,220}background:\s*var\(--brand-preview-page-bg\)/);
});

test('skill factory FAQ and knowledge collapses use clear Arco actions in dark mode', async () => {
  const { readFile } = await import('node:fs/promises');
  const dashboardSource = await readFile(new URL('../../components/SkillFactoryDashboard.tsx', import.meta.url), 'utf8');
  const stylesSource = await readFile(new URL('../../src/styles.css', import.meta.url), 'utf8');

  assert.match(dashboardSource, /from ["']@arco-design\/web-react\/icon["']/);
  assert.match(dashboardSource, /IconDown/);
  assert.match(dashboardSource, /IconPlus/);
  assert.match(dashboardSource, /手动新增 FAQ/);
  assert.doesNotMatch(dashboardSource, /新增待确认/);
  assert.match(dashboardSource, /className="skill-knowledge-collapse skill-source-records-collapse"/);
  assert.match(dashboardSource, /className="skill-knowledge-collapse skill-reviewed-collapse"/);
  assert.match(dashboardSource, /expandIcon=\{<IconDown/);
  assert.match(dashboardSource, /triggerRegion="header"/);

  assert.match(stylesSource, /\.skill-knowledge-collapse \.arco-collapse-item-header-icon/);
  assert.match(stylesSource, /html\.dark \.skill-knowledge-collapse \.arco-collapse-item-header-icon/);
  assert.match(stylesSource, /\.skill-knowledge-collapse \.arco-collapse-item-active > \.arco-collapse-item-header \.arco-collapse-item-header-icon/);
});

test('media library SEO dashboard renders keyword source picker without redundant context status', async () => {
  const { readFile } = await import('node:fs/promises');
  const mediaOpsModule = await import('../../components/MediaOpsDashboard.tsx');
  const MediaOpsDashboard = mediaOpsModule.MediaOpsDashboard as React.ComponentType<any>;
  const mediaSource = await readFile(new URL('../../components/MediaOpsDashboard.tsx', import.meta.url), 'utf8');
  const html = renderToStaticMarkup(React.createElement(MediaOpsDashboard, {
    theme,
    settings: {},
    getApiKey: () => '',
    requireApiKey: () => undefined,
    onNotice: () => undefined,
    keywordContext: 'product sample keyword database',
    companyContext: 'Demo Brand factory context',
  }));

  assert.match(html, /WordPress 媒体库批量优化/);
  assert.doesNotMatch(html, /产品词库已连接/);
  assert.doesNotMatch(html, /站点资料已连接/);
  assert.match(mediaSource, /id="media-ops-keyword-category"/);
  assert.match(mediaSource, /产品词库类目/);
});

test('media library sends site and selected category references instead of raw context', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../../App.tsx', import.meta.url), 'utf8');
  assert.match(source, /<MediaOpsDashboard[\s\S]*siteId=\{activeSiteId\}/);
  assert.match(source, /<MediaOpsDashboard[\s\S]*selectedCategory=\{selectedCategory\}/);
  assert.doesNotMatch(source, /<MediaOpsDashboard[\s\S]{0,700}keywordContext=/);
});

test('media and product dashboards omit redundant empty context chips', async () => {
  const mediaOpsModule = await import('../../components/MediaOpsDashboard.tsx');
  const productModule = await import('../../components/ProductSeoDashboard.tsx');
  const MediaOpsDashboard = mediaOpsModule.MediaOpsDashboard as React.ComponentType<any>;
  const ProductSeoDashboard = productModule.ProductSeoDashboard as React.ComponentType<any>;
  const commonProps = {
    theme,
    getApiKey: () => '',
    requireApiKey: () => undefined,
    onNotice: () => undefined,
    keywordContext: '',
    companyContext: '',
  };

  const mediaHtml = renderToStaticMarkup(React.createElement(MediaOpsDashboard, {
    ...commonProps,
    settings: {},
  }));
  const productHtml = renderToStaticMarkup(React.createElement(ProductSeoDashboard, commonProps));
  const combined = `${mediaHtml}\n${productHtml}`;

  assert.doesNotMatch(combined, /产品词库：无/);
  assert.doesNotMatch(combined, /站点资料：无/);
  assert.doesNotMatch(combined, /B2B词表：无/);
  assert.doesNotMatch(combined, /未选择产品词库/);
  assert.doesNotMatch(combined, /未选择站点资料/);
  assert.doesNotMatch(combined, /未上传B2B词表/);
});

test('media library WordPress sync actions are disabled when WordPress is not configured', async () => {
  const { readFile } = await import('node:fs/promises');
  const appSource = await readFile(new URL('../../App.tsx', import.meta.url), 'utf8');
  const dashboardSource = await readFile(new URL('../../components/MediaOpsDashboard.tsx', import.meta.url), 'utf8');

  assert.match(appSource, /<MediaOpsDashboard[\s\S]*canSyncToWordPress=\{canSyncBlogToWordPress\}/);
  assert.match(dashboardSource, /canSyncToWordPress\?: boolean/);
  assert.match(dashboardSource, /if \(!canSyncToWordPress\) \{[\s\S]*请先在系统配置中填写 WordPress 网址、用户名和应用密码/);
  assert.match(dashboardSource, /const mediaWordPressSyncDisabled = Boolean\([\s\S]*!canSyncToWordPress/);
  assert.match(dashboardSource, /disabled=\{mediaWordPressSyncDisabled\}/);
  assert.match(dashboardSource, /disabled=\{reviewApplyDisabled\}/);
});

test('media library SEO workspace panel owns vertical scrolling', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../../App.tsx', import.meta.url), 'utf8');

  assert.match(
    source,
    /data-testid="media-subtab-panel-mediaOps"[\s\S]*data-overflow-policy="y-scroll"[\s\S]*className=\{`\$\{mediaWorkspaceMode === 'mediaOps' \? 'flex' : 'hidden'\}[^`]*min-h-0[^`]*overflow-y-auto[^`]*`/,
  );
});

test('image processing preview stays compact while SEO fields scroll', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../../App.tsx', import.meta.url), 'utf8');

  assert.match(source, /data-testid="image-processing-layout"[\s\S]*items-start/);
  assert.match(source, /data-testid="image-preview-card"[\s\S]*lg:sticky[\s\S]*lg:top-4/);
  assert.match(source, /data-testid="image-preview-stage"[\s\S]*h-\[clamp\(320px,52vh,560px\)\]/);
  assert.doesNotMatch(source, /data-testid="image-preview-stage"[\s\S]*flex-1 min-h-\[400px\]/);
});

test('image processing editor uses dense desktop controls', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../../App.tsx', import.meta.url), 'utf8');

  assert.match(source, /data-testid="image-side-panel"\s+className="space-y-3"/);
  assert.match(source, /data-testid="image-processing-config"[^\n]*p-4/);
  assert.match(source, /data-testid="image-processing-config-title"[^\n]*text-sm font-bold/);
  assert.match(source, /data-testid="image-width-options"[^\n]*grid-cols-3/);
  assert.match(source, /data-testid="image-seo-panel"[^\n]*p-4/);
  assert.match(source, /data-testid="image-seo-fields"[^\n]*space-y-3/);
  assert.match(source, /data-testid="image-download-upload-actions"[\s\S]{0,600}py-2/);
  assert.doesNotMatch(source, /data-testid="image-side-panel"\s+className="space-y-4"/);
  assert.doesNotMatch(source, /data-testid="image-processing-config"[^\n]*p-6/);
  assert.doesNotMatch(source, /data-testid="image-seo-panel"[^\n]*p-6/);
});

test('desktop shell renders system-theme sidebar navigation and quick action composer', async () => {
  const { readFile } = await import('node:fs/promises');
  const appSource = await readFile(new URL('../../App.tsx', import.meta.url), 'utf8');
  const tabsSource = await readFile(new URL('../../appTabs.ts', import.meta.url), 'utf8');
  const source = `${appSource}\n${tabsSource}`;

  assert.match(source, /THEME_PREFERENCE_STORAGE_KEY/);
  assert.match(source, /type ThemePreference = 'system' \| 'light' \| 'dark'/);
  assert.match(source, /data-testid="system-desktop-shell"/);
  assert.match(source, /data-testid="desktop-sidebar"/);
  assert.match(source, /data-testid="desktop-workspace"/);
  assert.match(source, /SIDEBAR_COLLAPSED_STORAGE_KEY/);
  assert.match(source, /data-testid="sidebar-collapse-toggle"/);
  assert.match(source, /data-testid="theme-preference-control"[\s\S]*'system', '跟随系统'/);
  assert.match(source, /type SettingsSectionId = 'appearance' \| 'updates' \| 'profile' \| 'errors' \| 'ai' \| 'wordpress' \| 'automation' \| 'sitemap'/);
  assert.match(source, /data-testid="settings-section-nav"/);
  assert.match(source, /data-testid="settings-active-pane"/);
  assert.match(source, /data-testid="settings-target-hint"/);
  assert.match(source, /label: '应用更新'/);
  assert.match(source, /data-testid="settings-section-updates"/);
  assert.match(source, /getDesktopUpdateStatus/);
  assert.match(source, /checkForDesktopUpdates/);
  assert.match(source, /installDesktopUpdate/);
  assert.match(source, /检查更新/);
  assert.match(source, /重启安装/);
  assert.doesNotMatch(source, /data-testid="settings-section-links"/);
  assert.doesNotMatch(source, /data-testid="settings-section-sftp"/);
  assert.doesNotMatch(source, /settings-nav-sftp/);
  assert.doesNotMatch(source, /data-testid="settings-guide-card"/);
  assert.doesNotMatch(source, /失败了先看这里/);
  assert.match(source, /data-active-section=\{activeSettingsSection\}/);
  assert.doesNotMatch(source, /scrollIntoView/);
  assert.doesNotMatch(source, /data-testid="sidebar-theme-control"/);
  assert.match(source, /data-testid="quick-action-composer"/);
  assert.match(source, /快速打开工作台/);
  assert.match(source, /输入：博客 \/ 图片 \/ 产品 \/ 页面计划/);
  assert.match(source, /window\.seoWpSyncDesktop\?\.setThemeSource/);
  assert.doesNotMatch(source, /setIsDarkMode/);
  assert.doesNotMatch(source, /dataInsights/);
  assert.doesNotMatch(source, /数据洞察配置/);
  assert.match(source, /seoAudit/);
  assert.match(source, /skillFactory/);
  assert.match(source, /sitemap/);
  assert.match(source, /站点资料库/);
  assert.match(source, /站点地图/);
  assert.match(source, /图片与媒体SEO/);
  assert.doesNotMatch(source, /mode-tab-image/);
  assert.doesNotMatch(source, /mode-tab-mediaOps/);
  assert.match(source, /博客撰写与修改/);
  assert.doesNotMatch(source, /mode-tab-blogAi/);
  assert.doesNotMatch(source, /mode-tab-blogFormat/);
  assert.doesNotMatch(source, /productUpload/);
  assert.match(source, /data-testid="app-brand"[\s\S]*whitespace-nowrap[\s\S]*独立站 AI/);
  assert.doesNotMatch(source, /LensCraft AI/);
  assert.doesNotMatch(source, /System Workspace/);
  assert.match(source, /control-shell/);
  assert.match(source, /control-commandbar/);
  assert.match(source, /control-brand/);
  assert.match(source, /control-nav-tab/);
  assert.match(source, /data-testid="system-network-status"[\s\S]*control-status-pill/);
});

test('appearance settings expose soft typography and font size choices', async () => {
  const { readFile } = await import('node:fs/promises');
  const appSource = await readFile(new URL('../../App.tsx', import.meta.url), 'utf8');
  const stylesSource = await readFile(new URL('../../src/styles.css', import.meta.url), 'utf8');

  assert.match(appSource, /FONT_SIZE_PREFERENCE_STORAGE_KEY\s*=\s*'desktop\.fontSizePreference'/);
  assert.match(appSource, /type FontSizePreference = 'small' \| 'medium' \| 'large'/);
  assert.match(appSource, /const \[fontSizePreference, setFontSizePreference\] = useState<FontSizePreference>/);
  assert.match(appSource, /document\.documentElement\.dataset\.fontSize = fontSizePreference/);
  assert.match(appSource, /window\.localStorage\.setItem\(FONT_SIZE_PREFERENCE_STORAGE_KEY, fontSizePreference\)/);
  assert.match(appSource, /data-testid="font-size-preference-control"[\s\S]*'small', '小'/);
  assert.match(appSource, /data-testid="font-size-preference-control"[\s\S]*'medium', '中'/);
  assert.match(appSource, /data-testid="font-size-preference-control"[\s\S]*'large', '大'/);

  assert.match(stylesSource, /--font-sans:\s*"Poppins"/);
  assert.match(stylesSource, /--font-app:\s*"Poppins"/);
  assert.doesNotMatch(stylesSource, /IBM Plex Sans/);
  assert.match(stylesSource, /html\[data-font-size="small"\][\s\S]*font-size:\s*15px/);
  assert.match(stylesSource, /html\[data-font-size="medium"\][\s\S]*font-size:\s*16px/);
  assert.match(stylesSource, /html\[data-font-size="large"\][\s\S]*font-size:\s*17px/);
  assert.match(stylesSource, /--ds-font-weight-title:\s*680/);
  assert.match(stylesSource, /--ds-soft-shadow/);
});

test('pro preview ui has been removed from the stable desktop shell', async () => {
  const { readFile } = await import('node:fs/promises');
  const appSource = await readFile(new URL('../../App.tsx', import.meta.url), 'utf8');
  const stylesSource = await readFile(new URL('../../src/styles.css', import.meta.url), 'utf8');

  assert.doesNotMatch(appSource, /UI_VERSION_PREFERENCE_STORAGE_KEY/);
  assert.doesNotMatch(appSource, /UiVersionPreference/);
  assert.doesNotMatch(appSource, /uiVersionPreference/);
  assert.doesNotMatch(appSource, /ui-version-preference-control/);
  assert.doesNotMatch(appSource, /commandbar-pro-preview-toggle/);
  assert.doesNotMatch(appSource, /CommandCenterProPreview/);
  assert.doesNotMatch(appSource, /新版界面预览/);

  assert.doesNotMatch(stylesSource, /\.pro-preview-/);
  await assert.rejects(
    readFile(new URL('../../components/pro-preview/CommandCenterProPreview.tsx', import.meta.url), 'utf8'),
    /ENOENT/,
  );
});

test('desktop chrome reserves macOS controls and uses a top-right message center', async () => {
  const { readFile } = await import('node:fs/promises');
  const appSource = await readFile(new URL('../../App.tsx', import.meta.url), 'utf8');
  const stylesSource = await readFile(new URL('../../src/styles.css', import.meta.url), 'utf8');

  assert.match(appSource, /data-testid="sidebar-window-safe-area"/);
  assert.match(appSource, /data-testid="sidebar-settings-button"/);
  assert.match(appSource, /data-testid="workspace-message-center"/);
  assert.match(appSource, /data-testid="workspace-message-panel"/);
  assert.match(appSource, /className="workspace-message-popover"/);
  assert.match(appSource, /system-sidebar--collapsed/);
  assert.match(appSource, /style=\{\{\s*maxWidth:\s*'min\(24rem,\s*calc\(100vw - 24px\)\)'\s*\}\}/);
  assert.match(appSource, /autoFitPosition:\s*true/);
  assert.match(appSource, /boundaryDistance:\s*\{\s*right:\s*16,\s*left:\s*16,\s*bottom:\s*16\s*\}/);
  assert.match(appSource, /const isDesktopRuntime = typeof window !== 'undefined' && Boolean\(window\.seoWpSyncDesktop\)/);
  assert.match(appSource, /data-runtime=\{isDesktopRuntime \? 'desktop' : 'browser'\}/);
  assert.doesNotMatch(appSource, /data-testid="web-window-controls"/);
  assert.match(appSource, /消息中心/);
  assert.doesNotMatch(appSource, /data-testid="desktop-workspace-toolbar"[\s\S]{0,1400}openSettings\(\)/);
  assert.match(stylesSource, /--ds-window-radius:\s*0px/);
  assert.match(stylesSource, /\.control-shell[\s\S]*border-radius:\s*0/);
  assert.match(stylesSource, /\.control-shell[\s\S]*box-shadow:\s*none/);
  assert.match(stylesSource, /html\[data-runtime="browser"\] \.control-shell[\s\S]*border-radius:\s*0/);
  assert.match(stylesSource, /html\[data-runtime="browser"\] \[data-testid="desktop-sidebar"\]\[data-collapsed="false"\][\s\S]*width:\s*268px/);
  assert.match(stylesSource, /\.system-sidebar-brand-zone[\s\S]*padding-top:\s*24px/);
  assert.match(stylesSource, /html\[data-runtime="desktop"\] \.system-sidebar-brand-zone[\s\S]*padding-top:\s*48px/);
  assert.match(appSource, /className="sidebar-scroll-body"/);
  assert.match(stylesSource, /\.arco-sidebar \.arco-layout-sider-children[\s\S]*overflow:\s*hidden/);
  assert.match(stylesSource, /\.sidebar-scroll-body[\s\S]*overflow-y:\s*auto/);
  assert.match(stylesSource, /\[data-testid="desktop-workspace-toolbar"\] \.codex-settings-button[\s\S]*display:\s*none/);
  assert.match(stylesSource, /\.codex-message-panel[\s\S]*width:\s*min\(23\.5rem,\s*calc\(100vw - 24px\)\)/);
  assert.match(stylesSource, /\.workspace-message-popover\.arco-trigger-popup[\s\S]*right:\s*12px\s*!important/);
  assert.match(stylesSource, /\.workspace-message-popover\.arco-trigger-popup,[\s\S]*\.workspace-message-popover\.arco-trigger/);
  assert.match(stylesSource, /\.workspace-message-popover\.arco-trigger-popup[\s\S]*left:\s*auto\s*!important/);
  assert.match(stylesSource, /\.workspace-message-popover\.arco-trigger-popup[\s\S]*max-width:\s*calc\(100vw - 24px\)/);
  assert.match(stylesSource, /\.workspace-message-popover \.arco-popover-content,[\s\S]*width:\s*min\(23\.5rem,\s*calc\(100vw - 24px\)\)/);
  assert.match(stylesSource, /\.workspace-message-popover \.arco-popover-content,[\s\S]*border:\s*0\s*!important/);
  assert.match(stylesSource, /\.workspace-message-popover \.arco-popover-content,[\s\S]*background:\s*transparent\s*!important/);
  assert.match(stylesSource, /\.workspace-message-popover \.arco-popover-content\s*\{[\s\S]*padding:\s*0\s*!important/);
  assert.match(stylesSource, /\.workspace-message-list[\s\S]*max-height:\s*min\(46vh,\s*320px\)/);
  assert.match(stylesSource, /\.workspace-message-detail[\s\S]*overflow-wrap:\s*anywhere/);
  assert.match(stylesSource, /:is\(\[data-testid="desktop-sidebar"\]\[data-collapsed="true"\], \.system-sidebar--collapsed\)[\s\S]*width:\s*72px\s*!important/);
  assert.match(stylesSource, /:is\(\[data-testid="desktop-sidebar"\]\[data-collapsed="true"\], \.system-sidebar--collapsed\) \.arco-sidebar-menu \.arco-menu-item[\s\S]*width:\s*44px\s*!important/);
  assert.match(stylesSource, /:is\(\[data-testid="desktop-sidebar"\]\[data-collapsed="true"\], \.system-sidebar--collapsed\) \.sidebar-bottom-zone[\s\S]*justify-items:\s*center/);
});

test('desktop backend ready event clears transient startup errors and refreshes live status', async () => {
  const { readFile } = await import('node:fs/promises');
  const appSource = await readFile(new URL('../../App.tsx', import.meta.url), 'utf8');

  assert.match(appSource, /clearTransientDesktopBackendErrorLogs/);
  assert.match(appSource, /const handleDesktopBackendReady = useCallback/);
  assert.match(appSource, /setSetupError\(''\)/);
  assert.match(appSource, /setSystemNetworkStatus\(prev => \(isTransientDesktopBackendStatus\(prev\) \? null : prev\)\)/);
  assert.match(appSource, /clearTransientDesktopBackendErrorLogs\(\)/);
  assert.match(appSource, /refreshErrorLogs\(\)/);
  assert.match(appSource, /void reloadSettingsAndContext\(API_BASE\)/);
  assert.match(appSource, /void refreshSystemNetworkStatusNow\(\)/);
  assert.match(appSource, /onBackendReady\?\.\(handleDesktopBackendReady\)/);
});

test('beginner mode exposes configuration guide actions in the workspace', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../../App.tsx', import.meta.url), 'utf8');

  assert.match(source, /SETUP_BROWSE_MODE_STORAGE_KEY\s*=\s*'desktop\.setupBrowseModeDismissed'/);
  assert.match(source, /const \[setupDismissed, setSetupDismissed\] = useState\(getInitialSetupDismissed\)/);
  assert.match(source, /window\.localStorage\.setItem\(SETUP_BROWSE_MODE_STORAGE_KEY,\s*'true'\)/);
  assert.match(source, /window\.localStorage\.removeItem\(SETUP_BROWSE_MODE_STORAGE_KEY\)/);
  assert.match(source, /const openSettings = useCallback\(\(section: SettingsSectionId = 'appearance'\)/);
  assert.match(source, /const \[setupGuideExpanded, setSetupGuideExpanded\] = useState\(false\)/);
  assert.match(source, /data-testid="unconfigured-workspace-guide"/);
  assert.match(source, /data-testid="unconfigured-guide-toggle"/);
  assert.match(source, /setupGuideExpanded \? "收起" : "展开配置"/);
  assert.match(source, /data-testid="unconfigured-guide-expanded"/);
  assert.match(source, /配置 AI/);
  assert.match(source, /配置 WordPress/);
  assert.match(source, /配置站点/);
  assert.match(source, /打开资料库/);
  assert.match(source, /返回首次配置/);
  assert.match(source, /onClick=\{\(\) => openSettingsFromStatus\('ai'\)\}/);
  assert.match(source, /onClick=\{\(\) => openSettingsFromStatus\('wordpress'\)\}/);
  assert.match(source, /setSetupDismissed\(false\)/);
});

test('setup wizard early return does not skip later React hooks', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../../App.tsx', import.meta.url), 'utf8');

  const setupReturnIndex = source.indexOf('if (showSetupWizard)');
  const setupReturnEndIndex = source.indexOf('const fullFilename = activeImage?.seoData?.filename', setupReturnIndex);
  const laterHooks = source
    .slice(setupReturnEndIndex)
    .match(/\buse(?:State|Effect|Memo|Callback|Ref|Reducer|LayoutEffect|InsertionEffect)\s*\(/g);

  assert.ok(setupReturnIndex > 0);
  assert.ok(setupReturnEndIndex > setupReturnIndex);
  assert.equal(laterHooks, null);
  assert.ok(source.indexOf('const blogAiKeywordOptions = useMemo') < setupReturnIndex);
  assert.match(source, /shouldShowSetupWizard\(\{/);
  assert.doesNotMatch(source, /if \(!setupDismissed && \(setupLoading \|\| !setupStatus\?\.setupComplete\)\)/);
});

test('setup guide summarizes current missing checks instead of hardcoding AI as missing', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../../App.tsx', import.meta.url), 'utf8');

  assert.match(source, /getSetupGuideInlineText\(homepageMissingConfigItems\)/);
  assert.match(source, /formatConfigStatusLabels\(homepageMissingConfigItems\)/);
  assert.match(source, /needsAiConfig/);
  assert.match(source, /needsWordPressConfig/);
  assert.match(source, /needsProfileConfig/);
  assert.match(source, /needsKnowledgeConfig/);
  assert.match(source, /setupGuideInlineDetail/);
  assert.match(source, /setupGuideExpandedDetail/);
  assert.doesNotMatch(source, /AI 和 WordPress 未配置，生成与同步暂不可用。/);
});

test('system status details provide direct setup actions and close on navigation', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../../App.tsx', import.meta.url), 'utf8');

  assert.match(source, /data-testid="system-network-configure-ai"/);
  assert.match(source, /data-testid="system-network-configure-wordpress"/);
  assert.match(source, /data-testid="system-network-configure-profile"/);
  assert.match(source, /data-testid="system-network-open-knowledge"/);
  assert.match(source, /openSettingsFromStatus/);
  assert.match(source, /closest\('\[data-testid="system-network-status-details"\]'\)/);
  assert.match(source, /去配置 AI/);
  assert.match(source, /去配置 WordPress/);
  assert.match(source, /setSystemNetworkDetailsOpen\(false\);\s*setViewMode\(mode\)/);
});

test('quick action plus opens a beginner task menu', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../../App.tsx', import.meta.url), 'utf8');
  const stylesSource = await readFile(new URL('../../src/styles.css', import.meta.url), 'utf8');

  assert.match(source, /const QUICK_ACTION_MENU_ITEMS/);
  assert.match(source, /data-testid="quick-action-menu"/);
  assert.match(source, /data-testid="quick-action-new-task"/);
  assert.match(source, /className=\{`quick-action-row/);
  assert.match(stylesSource, /\.quick-action-row\.arco-btn[\s\S]*min-height:\s*62px/);
  assert.match(source, /博客撰写/);
  assert.match(source, /图片处理/);
  assert.match(source, /页面计划/);
  assert.match(source, /SEO 审计/);
  assert.match(source, /WooCommerce 产品/);
});

test('media image workspace exposes a full dropzone instead of a small upload button', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../../App.tsx', import.meta.url), 'utf8');
  const stylesSource = await readFile(new URL('../../src/styles.css', import.meta.url), 'utf8');

  assert.match(source, /data-testid="image-empty-upload-dropzone"/);
  assert.match(source, /className="workspace-empty-upload-control"/);
  assert.match(source, /支持 JPG \/ PNG \/ WebP/);
  assert.match(stylesSource, /\.workspace-empty-upload-control[\s\S]*width:\s*min\(100%, 960px\)/);
  assert.match(stylesSource, /\.workspace-empty-upload[\s\S]*min-height:\s*min\(420px, calc\(100vh - 260px\)\)/);
});

test('settings modal supports targeted sections and explicit connection tests', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../../App.tsx', import.meta.url), 'utf8');

  assert.match(source, /initialSection: SettingsSectionId/);
  assert.match(source, /setActiveSettingsSection\(initialSection\)/);
  assert.match(source, /data-testid="settings-target-hint"/);
  assert.match(source, /settings-section-card--targeted/);
  assert.match(source, /className="settings-profile-actions"/);
  assert.doesNotMatch(source, /SettingsGuideCard/);
  assert.doesNotMatch(source, /外观、公司与站点、连接密钥和后台任务配置/);
  assert.match(source, /保存并测试 AI/);
  assert.match(source, /测试 WordPress/);
  assert.match(source, /测试 WooCommerce/);
  assert.match(source, /检测 SEO 插件/);
  assert.match(source, /settingsSaveError/);
  assert.match(source, /配置保存失败/);
  assert.doesNotMatch(source, /Gemini API Key（备用）/);
});

test('settings modal exposes desktop update controls only for desktop runtime', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../../App.tsx', import.meta.url), 'utf8');
  const stylesSource = await readFile(new URL('../../src/styles.css', import.meta.url), 'utf8');
  const combined = `${source}\n${stylesSource}`;

  assert.match(source, /isDesktopRuntime/);
  assert.match(source, /SETTINGS_SECTIONS\.filter/);
  assert.match(source, /section\.id !== 'updates' \|\| isDesktopRuntime/);
  assert.match(source, /data-testid="settings-section-updates"/);
  assert.match(source, /当前版本/);
  assert.match(source, /最新版本/);
  assert.match(source, /下载进度/);
  assert.match(source, /subscribeDesktopUpdateStatus/);
  assert.match(source, /更新已下载，可以重启安装。/);
  assert.match(source, /getDesktopUpdateErrorMessage/);
  assert.match(source, /jinhongr10\/SEO-WP/);
  assert.match(source, /loadingFixedWidth/);
  assert.match(source, /className="settings-update-actions"/);
  assert.match(source, /className="settings-update-button"/);
  assert.match(combined, /\.settings-update-button\.arco-btn[\s\S]*white-space:\s*nowrap/);
  assert.match(combined, /\.settings-update-actions[\s\S]*min-width:\s*244px/);
});

test('settings site profile section separates saved site switching from new site creation', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../../App.tsx', import.meta.url), 'utf8');
  const stylesSource = await readFile(new URL('../../src/styles.css', import.meta.url), 'utf8');
  const profileSectionStart = source.indexOf('data-testid="settings-section-profile"');
  const profileSectionEnd = source.indexOf("{activeSettingsSection === 'sitemap'", profileSectionStart);
  const profileSource = source.slice(profileSectionStart, profileSectionEnd);

  assert.match(source, /label: '站点管理'/);
  assert.match(profileSource, /data-testid="settings-current-site-panel"/);
  assert.match(profileSource, /data-testid="settings-active-site-select"/);
  assert.match(profileSource, /onChange=\{value => onSelectSite\(String\(value \|\| ''\)\)\}/);
  assert.match(profileSource, /data-testid="settings-save-current-site-button"/);
  assert.match(profileSource, /panel: 'settings-new-site-panel'/);
  assert.match(profileSource, /新增站点/);
  assert.match(profileSource, /创建站点/);
  assert.match(profileSource, /submit: 'settings-create-site-button'/);
  assert.match(profileSource, /<SiteCreationForm/);
  assert.match(profileSource, /busy=\{siteBusy\}/);
  assert.match(profileSource, /feedback: 'settings-new-site-feedback'/);
  assert.doesNotMatch(profileSource, /settingsPaneRef\.current\?\.scrollTo\(\{ top: settingsPaneRef\.current\.scrollHeight/);
  assert.doesNotMatch(profileSource, /创建并切换到新站点/);
  assert.match(profileSource, /data-testid="settings-delete-current-site-popconfirm"/);
  assert.match(profileSource, /data-testid="settings-delete-current-site-button"/);
  assert.match(profileSource, /确认删除“\$\{activeSite\?\.siteName/);
  assert.match(profileSource, /此操作不可恢复/);
  assert.doesNotMatch(profileSource, /最后一个站点不能删除/);
  assert.match(profileSource, /新站点名称/);
  assert.match(profileSource, /新网站地址/);
  assert.match(profileSource, /新站点备注/);
  assert.doesNotMatch(profileSource, /公司资料/);
  assert.doesNotMatch(profileSource, /公司名称/);
  assert.doesNotMatch(profileSource, /新站点 \/ 站点/);
  assert.doesNotMatch(profileSource, /当前站点已关联/);
  assert.match(stylesSource, /\.settings-profile-section--new[\s\S]*border-style:\s*dashed/);
  assert.match(stylesSource, /\.settings-profile-actions \.arco-btn[\s\S]*min-width:\s*96px/);
  assert.doesNotMatch(stylesSource, /@keyframes settings-target-pulse[\s\S]*translateY/);
});

test('no-site workspace offers both site creation and setup reopening', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../../App.tsx', import.meta.url), 'utf8');

  assert.match(source, /当前没有站点，需要站点的功能暂不可用。/);
  assert.match(source, /data-testid="no-site-create-button"/);
  assert.match(source, /onClick=\{\(\) => openSettings\('profile'\)\}/);
  assert.match(source, /data-testid="no-site-reopen-setup-button"/);
  assert.match(source, /onClick=\{handleReturnToSetup\}/);
  assert.match(source, /disabled=\{mode !== 'commandCenter' && !activeSiteProfile\}/);
});

test('settings connection tests do not reset the active settings section after saving', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../../App.tsx', import.meta.url), 'utf8');
  const activeSectionEffect = source.match(/useEffect\(\(\) => \{[\s\S]*?setActiveSettingsSection\(initialSection\)[\s\S]*?\}, \[([^\]]+)\]\);/);

  assert.ok(activeSectionEffect, 'settings modal should keep initial-section targeting in a dedicated effect');
  assert.doesNotMatch(activeSectionEffect[1], /\bsettings\b/);
  assert.doesNotMatch(activeSectionEffect[1], /\bsiteProfiles\b/);
  assert.doesNotMatch(activeSectionEffect[1], /\bactiveSiteId\b/);
  assert.match(source, /<ArcoButton htmlType="button" type="primary" onClick=\{\(\) => testSystemConnection\('wordpress'\)\}>测试 WordPress<\/ArcoButton>/);
  assert.match(source, /<ArcoButton htmlType="button" onClick=\{\(\) => testSystemConnection\('woocommerce'\)\}>测试 WooCommerce<\/ArcoButton>/);
  assert.match(source, /<ArcoButton htmlType="button" onClick=\{testSeoPlugin\}>检测 SEO 插件<\/ArcoButton>/);
});

test('settings modal renders SEO plugin probe diagnostics', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../../App.tsx', import.meta.url), 'utf8');

  assert.match(source, /seoPluginProbe/);
  assert.match(source, /data-testid="settings-seo-plugin-probe-details"/);
  assert.match(source, /检测插件：/);
  assert.match(source, /写入方式：/);
  assert.match(source, /检测证据：/);
  assert.match(source, /命名空间：/);
});

test('AI-required blog actions route beginners to AI settings and local validation', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../../App.tsx', import.meta.url), 'utf8');

  assert.match(source, /const blogTopicInputRef = useRef<HTMLInputElement \| null>\(null\)/);
  assert.match(source, /请先输入博客主题/);
  assert.match(source, /blogTopicInputRef\.current\?\.focus\(\)/);
  assert.match(source, /openSettings\('ai'\)/);
  assert.match(source, /下载 DOCX/);
  assert.match(source, /复制正文/);
  assert.doesNotMatch(source, /Download DOCX/);
  assert.doesNotMatch(source, /label="Copy"/);
});

test('skill factory dashboard keeps site data simple and folds FAQ links into company info', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../../components/SkillFactoryDashboard.tsx', import.meta.url), 'utf8');
  const styles = await readFile(new URL('../../src/styles.css', import.meta.url), 'utf8');
  const skillFactoryModule = await import('../../components/SkillFactoryDashboard.tsx');
  const SkillFactoryDashboard = skillFactoryModule.SkillFactoryDashboard as React.ComponentType<any>;
  const html = renderToStaticMarkup(React.createElement(SkillFactoryDashboard, {
    theme,
    backendUrl: '/api',
    activeProfile: {
      id: 'demo-brand',
      name: 'Demo Brand',
      siteUrl: 'https://example.com',
      brandName: 'Demo Brand',
      active: true,
      settings: {},
      secretRefs: {},
      knowledgeSources: [],
      knowledgeArtifacts: [],
      rulePack: {
        version: 0,
        fieldRules: {},
        taskContexts: {},
        sourceArtifactIds: [],
        status: 'draft',
        updatedAt: '',
      },
      generationSessions: [],
      templatePack: {},
      skillPacks: [],
      activeSkillPackId: '',
      styleKit: {},
      blogFrameworks: [],
      faqs: [{
        id: 'faq-1',
        question: 'What is the ordering constraints for product samples?',
        answer: 'ordering constraints depends on model and customization.',
        productCategories: ['product sample'],
        scenarios: ['procurement'],
        keywords: ['product sample ordering constraints'],
        sourceIds: [],
        status: 'approved',
        updatedAt: '2026-06-28T00:00:00Z',
      }],
      internalLinkSettings: {
        enabled: true,
        intervalDays: 7,
        includeTypes: ['page', 'product', 'post'],
        excludePatterns: [],
        lastRunAt: '',
        lastRunStatus: '',
        lastError: '',
      },
    },
    onRefreshProfiles: () => undefined,
  }));

  assert.match(html, /站点资料库/);
  assert.match(html, /公司信息/);
  assert.match(html, /产品 \/ SKU 信息/);
  assert.match(html, /产品关键词/);
  assert.match(html, /WooCommerce 规则/);
  assert.match(html, /FAQ 库/);
  assert.doesNotMatch(html, /公司 Skills/);
  assert.doesNotMatch(html, /What is the ordering constraints for product samples\?/);
  assert.doesNotMatch(html, /可引用页面/);
  assert.doesNotMatch(html, /品牌启动器/);
  assert.match(html, /博客写作框架/);
  assert.match(html, /历史博客修复格式/);
  assert.doesNotMatch(html, /内链索引/);
  assert.doesNotMatch(html, /WooCommerce 模板/);
  assert.doesNotMatch(html, /反馈迭代/);
  assert.doesNotMatch(html, /Markdown 产物/);
  assert.doesNotMatch(html, /统一字段规则/);
  assert.doesNotMatch(html, /生成、检查、发布当前复用版本/);
  assert.match(html, /操作顺序/);
  assert.match(html, /按公司、产品、关键词上传资料/);
  assert.match(html, /data-testid="customer-source-pick-file"/);
  assert.match(html, /还没有选择文件。先点左边“上传资料”。/);
  assert.doesNotMatch(html, /直接归档：/);
  assert.doesNotMatch(html, /可选 AI 整理/);
  assert.match(source, /data-testid="customer-source-direct-archive"/);
  assert.match(source, /type="primary"[\s\S]{0,180}data-testid="customer-source-direct-archive"/);
  assert.match(source, /data-testid="customer-source-ai-organize"/);
  assert.match(source, /type="primary"[\s\S]{0,180}data-testid="customer-source-ai-organize"/);
  assert.match(source, /data-testid="customer-source-clear-file"/);
  assert.match(source, /data-testid="customer-source-remove-file"/);
  assert.match(source, /移除所选文件/);
  assert.match(source, /批量归档/);
  assert.match(source, /multiple/);
  assert.match(source, /selectedFilesByType/);
  assert.match(source, /setSelectedFilesByType/);
  assert.match(source, /selectedFiles\.map/);
  assert.match(source, /for \(const pendingFile of filesToUpload\)/);
  assert.match(source, /sourceBusyByType/);
  assert.match(source, /sourcePanelBusy/);
  assert.doesNotMatch(source, /资料先进入当前分区，AI 整理只是可选的后续提炼。/);
  assert.match(source, /公司事实、品牌定位、能力、认证和联系方式/);
  assert.match(source, /\{ id: "faqs", label: "FAQ 库"/);
  assert.match(source, /\{ id: "templates", label: "WooCommerce 规则"/);
  assert.doesNotMatch(source, /扫描 \/ 生成 \/ 同步字段/);
  assert.doesNotMatch(source, /允许生成\/同步的字段/);
  assert.match(source, /\{ key: "productSlug", label: "Slug 规则"/);
  assert.match(source, /\{ key: "productShortDescription", label: "短描述规则"/);
  assert.match(source, /\{ key: "productFullDescription", label: "详细描述规则"/);
  assert.match(source, /\{ key: "tagNames", label: "标签规则"/);
  assert.doesNotMatch(source, /自定义字段说明 \/ Meta Key/);
  assert.doesNotMatch(source, /\{ key: "aioseo_title"/);
  assert.doesNotMatch(source, /\{ key: "aioseo_description"/);
  assert.doesNotMatch(source, /只控制下方三类产品内容字段/);
  assert.match(source, /告诉 AI 怎么改/);
  assert.match(source, /从文件替换此规则/);
  assert.doesNotMatch(source, /data-testid="site-template-import-target-select"/);
  assert.match(source, /AI 参考材料/);
  assert.match(source, /上传或粘贴 AI 参考材料/);
  assert.match(source, /handlePasteTemplateReferenceFiles/);
  assert.match(source, /TemplateReferenceFileItem/);
  assert.match(source, /previewUrl/);
  assert.match(source, /<ArcoImage/);
  assert.match(source, /activeTemplateKey/);
  assert.match(source, /data-testid="site-template-rule-picker"/);
  assert.match(source, /data-testid=\{`site-template-rule-card-\$\{item\.key\}`\}/);
  assert.doesNotMatch(source, /expandedTemplateKeys/);
  assert.doesNotMatch(source, /site-template-collapse/);
  assert.doesNotMatch(styles, /\.site-template-collapse/);
  assert.match(source, /保存此规则/);
  assert.match(source, /AI 生成此规则/);
  assert.match(source, /AI 改写此规则/);
  assert.match(source, /data-testid="site-template-import-panel"/);
  assert.match(source, /site-template-rule-grid/);
  assert.match(source, /site-template-rule-card/);
  assert.match(styles, /\.site-template-import-panel\s*\{[\s\S]*flex-wrap:\s*wrap/);
  assert.doesNotMatch(source, /data-testid="site-template-field-settings-save"/);
  assert.match(source, /data-testid=\{`site-template-save-\$\{activeTemplateItem\.key\}`\}/);
  assert.doesNotMatch(source, /AI 生成整套规则初稿/);
  assert.doesNotMatch(source, /生成三条规则初稿/);
  assert.doesNotMatch(source, /data-testid="site-template-generate-all"/);
  assert.doesNotMatch(source, /data-testid="site-template-header-actions"/);
  assert.match(styles, /\.skill-workbench-shell/);
  assert.match(styles, /\.skill-workbench-main/);
  assert.match(source, /className="control-page skill-workbench-page flex-1 p-4 md:p-8"/);
  assert.doesNotMatch(source, /skill-workbench-page[^"]*overflow-hidden/);
  assert.doesNotMatch(styles, /\.skill-workbench-shell\s*\{[^}]*height:\s*100%/);
  assert.doesNotMatch(styles, /\.skill-workbench-layout\s*\{[^}]*height:\s*100%/);
  assert.match(styles, /\.skill-workbench-main\s*\{[^}]*overflow:\s*visible/);
  assert.doesNotMatch(styles, /\.skill-workbench-main\s*\{[^}]*overflow-y:\s*auto/);
  assert.match(styles, /\.skill-workbench-sidebar[\s\S]*max-height:\s*calc\(100dvh - 96px\)/);
  assert.match(styles, /\.skill-section-nav[\s\S]*overflow-y:\s*auto/);
  assert.match(styles, /\.skill-section-tab\.ui-navigation-card--selected\.arco-btn::before[\s\S]*background:\s*var\(--system-active\)/);
  assert.doesNotMatch(styles, /\.skill-section-tab\.ui-navigation-card--selected\.arco-btn\s*\{[\s\S]{0,180}linear-gradient/);
  assert.doesNotMatch(source, /\{ id: "packs", label: "公司 Skills"/);
  assert.match(source, /根据资料生成 FAQ/);
  assert.doesNotMatch(source, /data-testid="company-info-assets"/);
  assert.doesNotMatch(source, /FAQ 和可引用页面属于公司资料/);
  assert.match(source, /status === "completed" \|\| status === "extracted"/);
  assert.match(source, /reviewStatusLabel\(source\.reviewStatus\)/);
  assert.match(source, /activeDraftArtifacts/);
  assert.match(source, /activeReviewedArtifacts/);
  assert.match(source, /artifact\.kind === activeSourceType/);
  assert.match(source, /getReviewedArtifactCountByType/);
  assert.match(source, /getSavedTemplateRuleCount/);
  assert.doesNotMatch(source, /for \(const source of sources\) counts\[source\.sourceType\]/);
  assert.doesNotMatch(source, /parseEnabledFields\(templatePack\.enabledProductFields \|\| DEFAULT_ENABLED_PRODUCT_FIELDS\)\.size/);
  assert.doesNotMatch(source, /skill-upload-mode-card-ai/);
  assert.match(html, /这个分区还没有资料。上传 公司信息 后会显示在这里。/);
  assert.doesNotMatch(html, /技能包版本/);
  assert.doesNotMatch(html, />生成技能包</);
  assert.doesNotMatch(html, /ACF Extra Info 模板（可选）/);
  assert.doesNotMatch(html, /data-testid="customer-source-process-actions"/);

  assert.match(source, /extractKnowledgeSource/);
  assert.match(source, /fetchKnowledgeArtifacts/);
  assert.match(source, /saveKnowledgeArtifacts/);
  assert.match(source, /保留到知识库/);
  assert.doesNotMatch(source, /勾选要保留的 Markdown/);
  assert.doesNotMatch(source, /保存保留项/);
  assert.doesNotMatch(source, /onClick=\{\(\) => patchArtifact\(artifact\.id, \{ status: "reviewed" \}\)\}/);
  assert.doesNotMatch(source, /onClick=\{\(\) => removeArtifact\(artifact\.id\)\}/);
  assert.match(source, /handleKeepArtifact/);
  assert.match(source, /handleDeleteArtifact/);
  assert.match(source, /const incomingSourceIds = new Set/);
  assert.match(source, /const incomingTitles = new Set/);
  assert.match(source, /!artifact\.sourceIds\.some\(sourceId => incomingSourceIds\.has\(sourceId\)\)/);
  assert.match(source, /!incomingTitles\.has\(artifact\.title\)/);
  assert.doesNotMatch(source, /\{ value: "rejected", label: "不通过" \}/);
  assert.doesNotMatch(source, /value=\{artifact\.status\}[\s\S]{0,240}onChange=\{value => patchArtifact\(artifact\.id, \{ status: String\(value \|\| ""\) \}\)\}/);
  assert.match(source, /generateRulePack/);
  assert.match(source, /saveRulePack/);
  assert.match(source, /saveFaqs/);
  assert.match(source, /refreshLinkIndex/);
});

test('WooCommerce rule refresh preserves drafts from other cards', async () => {
  const { mergeTemplateDraftsAfterRemoteRefresh } = await import('../../components/SkillFactoryDashboard.tsx');
  const merged = mergeTemplateDraftsAfterRemoteRefresh(
    {
      productSlug: 'saved-slug-rule',
      productShortDescription: 'unsaved short draft',
      productFullDescription: 'saved full rule',
      tagNames: 'saved tag rule',
    },
    {
      productSlug: 'saved-slug-rule',
      productShortDescription: 'saved short rule',
      productFullDescription: 'saved full rule',
      tagNames: 'saved tag rule',
    },
    {
      productSlug: 'imported slug rule',
      productShortDescription: 'saved short rule',
      productFullDescription: 'updated remote full rule',
      tagNames: 'saved tag rule',
    },
  );

  assert.equal(merged.productSlug, 'imported slug rule');
  assert.equal(merged.productShortDescription, 'unsaved short draft');
  assert.equal(merged.productFullDescription, 'updated remote full rule');
});

test('skill factory source operations are scoped per section instead of locking all uploads', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../../components/SkillFactoryDashboard.tsx', import.meta.url), 'utf8');

  assert.match(source, /createEmptySourceFileMap/);
  assert.match(source, /createEmptySourceLabelMap/);
  assert.match(source, /const targetType = activeSourceType/);
  assert.match(source, /setSourceBusy\(targetType, mode === "ai" \? "uploadGenerate" : "upload"\)/);
  assert.match(source, /const currentSourceUploadBusy = activeSourceBusy === "upload" \|\| activeSourceBusy === "uploadGenerate"/);
  assert.match(source, /disabled=\{sourcePanelBusy\}/);
  assert.match(source, /AI 整理中/);
  assert.doesNotMatch(source, /上传并 AI 整理/);
  assert.match(source, /文件已发送给 AI，正在生成可审核 Markdown/);
  assert.doesNotMatch(source, /<ArcoUpload[\s\S]{0,240}disabled=\{Boolean\(busy\)\}/);
});

test('skill factory exposes one-click AI organization for already uploaded sources', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../../components/SkillFactoryDashboard.tsx', import.meta.url), 'utf8');
  const skillFactoryModule = await import('../../components/SkillFactoryDashboard.tsx');
  const SkillFactoryDashboard = skillFactoryModule.SkillFactoryDashboard as React.ComponentType<any>;
  const html = renderToStaticMarkup(React.createElement(SkillFactoryDashboard, {
    theme,
    backendUrl: '/api',
    activeProfile: {
      id: 'demo-brand',
      name: 'Demo Brand',
      siteUrl: 'https://example.com',
      brandName: 'Demo Brand',
      active: true,
      settings: {},
      secretRefs: {},
      knowledgeSources: [{
        id: 'source-1',
        label: 'Company PDF',
        sourceType: 'company',
        filename: 'company.pdf',
        contentType: 'application/pdf',
        size: 1024,
        chars: 0,
        enabled: true,
        extractionStatus: 'pending',
        artifactIds: [],
        reviewStatus: 'unreviewed',
        createdAt: '2026-07-02T00:00:00Z',
      }],
      knowledgeArtifacts: [],
      rulePack: {
        version: 0,
        fieldRules: {},
        taskContexts: {},
        sourceArtifactIds: [],
        status: 'draft',
        updatedAt: '',
      },
      generationSessions: [],
      templatePack: {},
      skillPacks: [],
      activeSkillPackId: '',
      styleKit: {},
      blogFrameworks: [],
      faqs: [],
      internalLinkSettings: {
        enabled: false,
        intervalDays: 7,
        includeTypes: [],
        excludePatterns: [],
        lastRunAt: '',
        lastRunStatus: '',
        lastError: '',
      },
    },
    onRefreshProfiles: () => undefined,
  }));

  assert.match(html, /当前分区已有 1 个资料源，可直接点 AI 整理。/);
  assert.match(html, /data-testid="skill-source-extract-bucket"/);
  assert.match(html, /AI 整理当前分区/);
  assert.match(source, /handleExtractVisibleSources/);
  assert.match(source, /pendingVisibleSources/);
  assert.match(source, /extractableVisibleSources/);
  assert.match(source, /extractingSourceIds/);
  assert.match(source, /AI 正在整理当前分区/);
});

test('skill factory lets users rerun AI organization for already extracted sources', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../../components/SkillFactoryDashboard.tsx', import.meta.url), 'utf8');
  const skillFactoryModule = await import('../../components/SkillFactoryDashboard.tsx');
  const SkillFactoryDashboard = skillFactoryModule.SkillFactoryDashboard as React.ComponentType<any>;
  const html = renderToStaticMarkup(React.createElement(SkillFactoryDashboard, {
    theme,
    backendUrl: '/api',
    activeProfile: {
      id: 'demo-brand',
      name: 'Demo Brand',
      siteUrl: 'https://example.com',
      brandName: 'Demo Brand',
      active: true,
      settings: {},
      secretRefs: {},
      knowledgeSources: [{
        id: 'source-1',
        label: 'Company PDF',
        sourceType: 'company',
        filename: 'company.pdf',
        contentType: 'application/pdf',
        size: 1024,
        chars: 0,
        enabled: true,
        extractionStatus: 'extracted',
        artifactIds: ['artifact-1'],
        reviewStatus: 'reviewed',
        createdAt: '2026-07-02T00:00:00Z',
      }],
      knowledgeArtifacts: [],
      rulePack: {
        version: 0,
        fieldRules: {},
        taskContexts: {},
        sourceArtifactIds: [],
        status: 'draft',
        updatedAt: '',
      },
      generationSessions: [],
      templatePack: {},
      skillPacks: [],
      activeSkillPackId: '',
      styleKit: {},
      blogFrameworks: [],
      faqs: [],
      internalLinkSettings: {
        enabled: false,
        intervalDays: 7,
        includeTypes: [],
        excludePatterns: [],
        lastRunAt: '',
        lastRunStatus: '',
        lastError: '',
      },
    },
    onRefreshProfiles: () => undefined,
  }));

  assert.match(html, /AI 整理当前分区/);
  assert.match(html, /已整理 1 \/ 共 1/);
  assert.match(source, /const extractableVisibleSources = useMemo/);
  assert.match(source, /pendingVisibleSources\.length \? pendingVisibleSources : filteredSources/);
  assert.match(source, /disabled=\{sourcePanelBusy \|\| extractableVisibleSources\.length === 0\}/);
});

test('brand starter has its own top-level dashboard entry', async () => {
  const { readFile } = await import('node:fs/promises');
  const appSource = await readFile(new URL('../../App.tsx', import.meta.url), 'utf8');
  const dashboardSource = await readFile(new URL('../../components/BrandStarterDashboard.tsx', import.meta.url), 'utf8');
  const styles = await readFile(new URL('../../src/styles.css', import.meta.url), 'utf8');

  assert.match(appSource, /brandStarter/);
  assert.match(appSource, /<BrandStarterDashboard/);
  assert.match(dashboardSource, /品牌启动器/);
  assert.match(dashboardSource, /网站样式规范/);
  assert.match(dashboardSource, /颜色、字体、按钮和网页预览/);
  assert.match(dashboardSource, /颜色/);
  assert.match(dashboardSource, /字体/);
  assert.match(dashboardSource, /按钮/);
  assert.match(dashboardSource, /主色板/);
  assert.match(dashboardSource, /HEX 颜色/);
  assert.match(dashboardSource, /选择颜色/);
  assert.match(dashboardSource, /brand-system-color-trigger/);
  assert.match(dashboardSource, /type="color"/);
  assert.match(dashboardSource, /打开调色盘/);
  assert.match(dashboardSource, /色相/);
  assert.match(dashboardSource, /饱和度/);
  assert.match(dashboardSource, /明度/);
  assert.match(dashboardSource, /品牌主色 1/);
  assert.match(dashboardSource, /品牌主色 2/);
  assert.match(dashboardSource, /浅色背景 1/);
  assert.match(dashboardSource, /深色文字 1/);
  assert.match(dashboardSource, /添加辅助色板/);
  assert.match(dashboardSource, /品牌来源/);
  assert.match(dashboardSource, /角色映射/);
  assert.match(dashboardSource, /从网站抓取/);
  assert.match(dashboardSource, /上传 Logo/);
  assert.match(dashboardSource, /FONT_PRESETS/);
  assert.match(dashboardSource, /实时预览/);
  assert.match(dashboardSource, /对比度/);
  assert.match(dashboardSource, /WCAG 2\.1 对比度检查/);
  assert.match(dashboardSource, /标题示例文字/);
  assert.match(dashboardSource, /可读性优秀/);
  assert.match(dashboardSource, /电脑端/);
  assert.match(dashboardSource, /手机端/);
  assert.match(dashboardSource, /BRAND_PREVIEW_PRESETS/);
  assert.match(dashboardSource, /brand-preview-scroll/);
  assert.match(dashboardSource, /保存品牌/);
  assert.match(dashboardSource, /选择字体/);
  assert.match(dashboardSource, /响应式字号/);
  assert.match(dashboardSource, /主要动作示例/);
  assert.match(dashboardSource, /次要动作示例/);
  assert.match(dashboardSource, /\{ value: "ecommerce", label: "E-commerce" \}/);
  assert.match(dashboardSource, /\{ value: "blog", label: "Blog" \}/);
  assert.match(dashboardSource, /Build something amazing/);
  assert.match(dashboardSource, /How do I generate a color palette\?/);
  assert.match(dashboardSource, /I design digital experiences that inspire/);
  assert.match(dashboardSource, /We build brands that move people/);
  assert.match(dashboardSource, /Spring Collection/);
  assert.match(dashboardSource, /Mastering Visual Hierarchy in Modern Web Design/);
  assert.match(dashboardSource, /Active Integrations/);
  assert.match(dashboardSource, /Data Points Processed/);
  assert.match(dashboardSource, /Platform Uptime/);
  assert.match(dashboardSource, /Performance Overview/);
  assert.match(dashboardSource, /Navigation link color/);
  assert.match(dashboardSource, /detail="FAQ heading color"/);
  assert.match(dashboardSource, /detail="Final CTA heading color"/);
  assert.match(dashboardSource, /detail="Testimonial author and role text"/);
  assert.match(dashboardSource, /Selected Work/);
  assert.match(dashboardSource, /What We Do/);
  assert.match(dashboardSource, /Best Sellers/);
  assert.match(dashboardSource, /Latest Articles/);
  assert.match(dashboardSource, /Frequently Asked Questions/);
  assert.match(dashboardSource, /brand-reference-hero-visual/);
  assert.match(dashboardSource, /brand-reference-footer/);
  assert.match(dashboardSource, /ArcoColorPicker/);
  assert.match(dashboardSource, /showPreset/);
  assert.match(dashboardSource, /disabledAlpha/);
  assert.match(dashboardSource, /showText/);
  assert.match(dashboardSource, /value=\{previewPreset\}/);
  assert.match(dashboardSource, /preset=\{previewPreset\}/);
  assert.match(dashboardSource, /getBrandColorTokens/);
  assert.match(dashboardSource, /derivePrimaryPalette/);
  assert.match(dashboardSource, /applyDerivedPrimaryPalette/);
  assert.match(dashboardSource, /buildContrastPairs/);
  assert.match(dashboardSource, /TokenTooltip/);
  assert.match(dashboardSource, /brand-reference-services/);
  assert.match(dashboardSource, /brand-reference-testimonial/);
  assert.match(dashboardSource, /brand-reference-pricing/);
  assert.match(dashboardSource, /brand-reference-faq/);
  assert.match(dashboardSource, /brand-reference-work-grid/);
  assert.match(dashboardSource, /brand-reference-product-grid/);
  assert.match(dashboardSource, /brand-reference-article-list/);
  assert.match(dashboardSource, /brand-contrast-grid/);
  assert.match(dashboardSource, /brand-type-preview-table/);
  assert.match(dashboardSource, /TYPE_SCALE_OPTIONS/);
  assert.match(dashboardSource, /brand-source-candidates/);
  assert.match(dashboardSource, /applyPrimaryBrandColor/);
  assert.match(dashboardSource, /brand-color-role-grid/);
  assert.match(dashboardSource, /电脑端字号/);
  assert.match(dashboardSource, /手机端字号/);
  assert.doesNotMatch(dashboardSource, /SaaS 预览/);
  assert.doesNotMatch(dashboardSource, /页面节奏预览/);
  assert.doesNotMatch(dashboardSource, /Ecommerce/);
  assert.doesNotMatch(dashboardSource, /Editorial/);
  assert.doesNotMatch(dashboardSource, /Primary Palette/);
  assert.doesNotMatch(dashboardSource, /用一套品牌色搭出完整页面/);
  assert.doesNotMatch(dashboardSource, /brand-color-current-editor/);
  assert.doesNotMatch(dashboardSource, /当前颜色：/);
  assert.doesNotMatch(dashboardSource, /brand-editor-rail/);
  assert.doesNotMatch(dashboardSource, /brand-candidate-color-grid/);
  assert.doesNotMatch(dashboardSource, /brand-native-color-input/);
  assert.doesNotMatch(dashboardSource, /value=\{showPreset\}/);
  assert.doesNotMatch(dashboardSource, /preset=\{showPreset\}/);
  assert.match(dashboardSource, /brand-font-select-grid/);
  assert.match(styles, /\.brand-starter\s*\{[\s\S]{0,220}container-type:\s*inline-size/);
  assert.match(styles, /\.brand-starter__workspace\s*\{[\s\S]{0,180}grid-template-columns:\s*minmax\(0,\s*40fr\)\s+minmax\(0,\s*60fr\)/);
  assert.match(styles, /\.brand-palette-heading h3\s*\{[\s\S]{0,120}font-size:\s*1\.25rem/);
  assert.match(styles, /\.brand-reference-hex-field > div\s*\{[\s\S]{0,160}min-height:\s*46px/);
  assert.match(styles, /\.brand-reference-hero\s*\{[\s\S]{0,160}min-height:\s*560px/);
  assert.match(styles, /@container\s*\(max-width:\s*1560px\)\s*\{[\s\S]*\.brand-starter__workspace\s*\{[\s\S]{0,160}grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  assert.match(styles, /@container\s*\(max-width:\s*1560px\)\s*\{[\s\S]*\.brand-starter__controls\s*\{[\s\S]{0,180}height:\s*clamp\(460px,\s*58vh,\s*680px\)/);
  assert.match(styles, /@container\s*\(max-width:\s*1560px\)\s*\{[\s\S]*\.brand-starter__preview\s*\{[\s\S]{0,220}height:\s*clamp\(520px,\s*72vh,\s*860px\)/);
  assert.match(styles, /\.brand-editor-tabs\s+button\.is-selected[\s\S]{0,220}border-bottom-color:\s*var\(--system-active\)/);
  assert.match(styles, /\.brand-reference-hero\s*\{[\s\S]{0,220}text-align:\s*center/);
  assert.match(styles, /\.brand-editor-shell\s*\{[\s\S]{0,180}grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  assert.match(styles, /\.brand-editor-pane\s*\{[\s\S]{0,140}flex:\s*1\s+1\s+auto/);
  assert.match(styles, /\.brand-token-grid\s*\{[\s\S]{0,220}grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(210px,\s*1fr\)\)/);
  assert.match(styles, /\.brand-hsl-row--h\s+input\[type="range"\]\s*\{[\s\S]{0,180}linear-gradient/);
  assert.match(styles, /\.brand-preview-scroll\s*\{[\s\S]{0,180}overflow-x:\s*hidden/);
  assert.match(styles, /\.brand-reference-services\s*,[\s\S]{0,260}grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(220px,\s*1fr\)\)/);
  assert.match(styles, /\.brand-reference-pricing\s*,[\s\S]{0,260}grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(220px,\s*1fr\)\)/);
  assert.match(styles, /\.brand-contrast-grid\s*\{[\s\S]{0,180}grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(310px,\s*1fr\)\)/);
  assert.match(styles, /\.brand-token-tooltip\s*\{[\s\S]{0,240}position:\s*absolute/);
  assert.match(styles, /\.brand-token-tooltip\s*\{[\s\S]{0,280}display:\s*none/);
  assert.match(styles, /\.brand-token-tooltip\s*\{[\s\S]{0,360}visibility:\s*hidden/);
  assert.match(styles, /\.brand-token-anchor--text\s*\{[\s\S]{0,120}display:\s*inline-block/);
  assert.match(styles, /\.brand-token-anchor--block\s*\{[\s\S]{0,120}display:\s*block/);
  assert.match(styles, /\.brand-reference-links > span\s*\{[\s\S]{0,140}white-space:\s*nowrap/);
  assert.match(styles, /\.brand-token-anchor--text > \.brand-token-tooltip\s*,[\s\S]{0,120}\.brand-token-anchor--block > \.brand-token-tooltip\s*\{[\s\S]{0,140}top:\s*calc\(100%\s*\+\s*12px\)/);
  assert.match(styles, /\.brand-token-anchor:hover > \.brand-token-tooltip\s*\{[\s\S]{0,120}display:\s*grid/);
  assert.match(styles, /\.brand-token-anchor:hover > \.brand-token-tooltip\s*\{[\s\S]{0,120}visibility:\s*visible/);
  assert.match(styles, /\.brand-color-role-grid\s*\{[\s\S]{0,140}grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(styles, /\.brand-color-role-card__copy strong\s*\{[\s\S]{0,220}white-space:\s*normal/);
  assert.match(styles, /\.brand-color-role-card__copy small\s*\{[\s\S]{0,220}white-space:\s*normal/);
  assert.doesNotMatch(styles, /\.brand-color-role-card__copy strong\s*\{[\s\S]{0,220}text-overflow:\s*ellipsis/);
});

test('skill factory no-site state still shows the upload workflow and site action', async () => {
  const skillFactoryModule = await import('../../components/SkillFactoryDashboard.tsx');
  const SkillFactoryDashboard = skillFactoryModule.SkillFactoryDashboard as React.ComponentType<any>;
  const html = renderToStaticMarkup(React.createElement(SkillFactoryDashboard, {
    theme,
    backendUrl: '/api',
    activeProfile: null,
    onOpenSiteSettings: () => undefined,
    onRefreshProfiles: () => undefined,
  }));

  assert.match(html, /data-testid="skill-factory-no-site-empty"/);
  assert.match(html, /站点资料库/);
  assert.match(html, /先创建或选择站点/);
  assert.match(html, /资料要先归到某一个站点/);
  assert.match(html, /公司信息/);
  assert.match(html, /产品 \/ SKU 信息/);
  assert.match(html, /产品关键词/);
  assert.match(html, /上传资料/);
  assert.match(html, /data-testid="skill-factory-open-site-settings"/);
  assert.doesNotMatch(html, /请先在系统配置中创建站点。/);
});

test('active knowledge context includes reviewed markdown artifacts and shared rule pack', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../../App.tsx', import.meta.url), 'utf8');

  assert.match(source, /formatClientKnowledgeArtifactContext/);
  assert.match(source, /formatClientRulePackContext/);
  assert.match(source, /formatApprovedFaqContext/);
  assert.match(source, /formatClientTemplatePackContext/);
  assert.match(source, /buildActiveSiteKnowledgeContext/);
  assert.match(source, /# 已保留 Markdown/);
  assert.match(source, /# 已同意保留 FAQ/);
  assert.match(source, /# 当前 Rule Pack/);
  assert.match(source, /WooCommerce Rules \/ 产品字段模板/);
  assert.match(source, /Field Rules \/ 字段格式规则/);
  assert.match(source, /Task Contexts \/ 任务型上下文/);
  assert.match(source, /activeSiteHasRulePack/);
  assert.match(source, /站点资料与规则已加载/);
  assert.doesNotMatch(source, /# 当前公司 Skills/);
});

test('site reviewed keyword markdown feeds category keyword pickers', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../../App.tsx', import.meta.url), 'utf8');

  assert.match(source, /deriveKeywordCategoriesFromProfile/);
  assert.match(source, /findReviewedKeywordArtifact/);
  assert.match(source, /artifact\.kind === 'keyword'/);
  assert.match(source, /artifact\.status === 'reviewed'/);
  assert.match(source, /siteKeywordArtifact\.markdown/);
  assert.match(source, /availableSkillCategories/);
  assert.match(source, /skillCategories=\{availableSkillCategories\}/);
  assert.match(source, /产品类目关键词/);
});

test('blog WordPress sync buttons are disabled when WordPress is not configured', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../../App.tsx', import.meta.url), 'utf8');

  assert.match(source, /const canSyncBlogToWordPress = Boolean\(/);
  assert.match(
    source,
    /data-testid="blog-sync-draft-button"[\s\S]*disabled=\{![\s\S]*canSyncBlogToWordPress/,
  );
  assert.doesNotMatch(source, /data-testid="blog-publish-button"/);
  assert.doesNotMatch(source, /handleApplyBlogToWordPress\('publish'\)/);
});

test('Blog AI draft save button is disabled when WordPress is not configured', async () => {
  const { readFile } = await import('node:fs/promises');
  const appSource = await readFile(new URL('../../App.tsx', import.meta.url), 'utf8');
  const dashboardSource = await readFile(new URL('../../components/BlogAIGeneratorDashboard.tsx', import.meta.url), 'utf8');

  assert.match(appSource, /<BlogAIGeneratorDashboard[\s\S]*canCreateWordPressDraft=\{canSyncBlogToWordPress\}/);
  assert.match(dashboardSource, /canCreateWordPressDraft\?: boolean/);
  assert.match(dashboardSource, /const draftSaveDisabled = Boolean\([\s\S]*!canCreateWordPressDraft/);
  assert.match(dashboardSource, /disabled=\{draftSaveDisabled\}/);
});

test('Blog AI outline generation validates empty input before calling AI', async () => {
  const { readFile } = await import('node:fs/promises');
  const dashboardSource = await readFile(new URL('../../components/BlogAIGeneratorDashboard.tsx', import.meta.url), 'utf8');

  assert.match(dashboardSource, /const hasOutlineSeedInput = useMemo\(/);
  assert.match(dashboardSource, /if \(!hasOutlineSeedInput\) \{[\s\S]*请先填写主题 \/ 标题方向/);
  assert.match(dashboardSource, /generateBlogAiOutline\(\{ \.\.\.draft, siteId, keywordCategory \}\)/);
});

test('SEO audit dashboard renders upload, task, and Gemini review surfaces', async () => {
  const seoAuditModule = await import('../../components/SeoAuditDashboard.tsx');
  const SeoAuditDashboard = seoAuditModule.SeoAuditDashboard as React.ComponentType<any>;
  const html = renderToStaticMarkup(React.createElement(SeoAuditDashboard, {
    theme,
    backendUrl: '/api',
    companyContext: 'Demo Brand factory context',
    useSkills: true,
  }));

  assert.match(html, /SEO 审计/);
  assert.match(html, /CSV \/ TSV \/ TXT \/ PDF \/ XLSX \/ XLSM \/ XLS/);
  assert.match(html, /accept="\.csv,\.tsv,\.txt,\.pdf,\.xlsx,\.xlsm,\.xls"/);
  assert.match(html, /选择逐页审计表 \+ 关键词规划表/);
  assert.match(html, /data-testid="seo-audit-file-input"/);
  assert.match(html, /workbench-upload-dropzone seo-audit-upload-dropzone/);
  assert.match(html, /修复任务工作台/);
  assert.match(html, /Gemini 生成结果/);
});

test('SEO audit generated block helpers render concrete content from alternate Gemini fields', async () => {
  const seoAuditModule = await import('../../components/SeoAuditDashboard.tsx');
  const getSeoAuditBlockHeading = seoAuditModule.getSeoAuditBlockHeading as Function;
  const getSeoAuditBlockBody = seoAuditModule.getSeoAuditBlockBody as Function;
  const formatSeoAuditFaqItem = seoAuditModule.formatSeoAuditFaqItem as Function;

  assert.equal(
    getSeoAuditBlockHeading({ title: 'Buyer Overview', content: 'Choose by capacity and installation.' }, 0),
    'Buyer Overview',
  );
  assert.equal(
    getSeoAuditBlockBody({
      content: 'Choose by capacity and installation.',
      bullets: ['ABS for lightweight projects', 'Stainless steel for high traffic'],
    }),
    'Choose by capacity and installation. ABS for lightweight projects; Stainless steel for high traffic',
  );
  assert.equal(
    formatSeoAuditFaqItem({
      question: 'What is the ordering constraints?',
      answer: 'ordering constraints varies by model and customization requirement.',
    }),
    'Q: What is the ordering constraints? A: ordering constraints varies by model and customization requirement.',
  );
});

test('SEO audit generated helpers resolve Vertex alias fields for dashboard rendering', async () => {
  const seoAuditModule = await import('../../components/SeoAuditDashboard.tsx');
  const getSeoAuditGeneratedText = seoAuditModule.getSeoAuditGeneratedText as Function;
  const getSeoAuditGeneratedList = seoAuditModule.getSeoAuditGeneratedList as Function;
  const generation = {
    generated: {
      seo_title: 'Product Sample Buying Guide',
      meta_description: 'Compare product sample options for shared environments.',
      content_blocks: [{ heading: 'Buyer Overview', copy: 'Compare capacity and material.' }],
      linkSuggestions: [{ anchor_text: 'Product sample models', url: '/product-sample/' }],
    },
  };

  assert.equal(getSeoAuditGeneratedText(generation, ['seoTitle', 'seo_title']), 'Product Sample Buying Guide');
  assert.equal(getSeoAuditGeneratedText(generation, ['metaDescription', 'meta_description']), 'Compare product sample options for shared environments.');
  assert.deepEqual(getSeoAuditGeneratedList(generation, ['contentBlocks', 'content_blocks']), generation.generated.content_blocks);
  assert.deepEqual(getSeoAuditGeneratedList(generation, ['internalLinks', 'linkSuggestions']), generation.generated.linkSuggestions);
});

test('SEO audit HTML export uses Gemini copy and escapes generated text', async () => {
  const seoAuditModule = await import('../../components/SeoAuditDashboard.tsx');
  const buildSeoAuditGenerationHtml = seoAuditModule.buildSeoAuditGenerationHtml as Function;
  const html = buildSeoAuditGenerationHtml(
    {
      id: 42,
      taskTypeLabel: '产品页扩写',
      url: 'https://example.com/product/product-sample/',
      priority: 'P0',
    },
    {
      id: 9,
      status: 'generated',
      qualityScore: 92,
      generated: {
        title: 'Product Sample Buyer Copy',
        seoTitle: 'Product Sample for Facilities',
        metaDescription: 'Compare product sample options for enterprises, institutions, and contractors.',
        primaryKeyword: 'product sample',
        contentBlocks: [
          {
            heading: 'Buyer Overview',
            body: 'Choose compact product samples by service workload, traffic level, and maintenance access.',
          },
          {
            heading: 'Specification Copy',
            html: '<p>Use lockable ABS models for light traffic and stainless steel options for high-traffic deployment sites.</p>',
          },
        ],
        faq: ['Q: Can Demo Brand support OEM product sample orders? A: Yes, model and packaging requirements can be reviewed before quote.'],
        internalLinks: [
          {
            title: 'Manual Product Sample',
            url: '/manual-product-sample/',
            anchorText: 'manual product sample',
          },
        ],
        cta: 'Send Demo Brand your deployment site count and service plan for model advice.',
      },
      warnings: ['Confirm exact capacity before publishing.'],
    },
  );

  assert.match(html, /Choose compact product samples by service workload/);
  assert.match(html, /Send Demo Brand your deployment site count and service plan/);
  assert.match(html, /manual product sample/);
  assert.match(html, /&lt;p&gt;Use lockable ABS models/);
  assert.doesNotMatch(html, /Buyer-useful content|No generated content|Place where the anchor naturally supports/i);
});

test('SEO audit import notice reports warning counts', async () => {
  const seoAuditModule = await import('../../components/SeoAuditDashboard.tsx');
  const formatSeoAuditImportNotice = seoAuditModule.formatSeoAuditImportNotice as Function;

  assert.equal(formatSeoAuditImportNotice('预览完成', 838, ['skipped md', 'duplicates']), '预览完成：838 个任务，2 条提示');
  assert.equal(formatSeoAuditImportNotice('已导入', 42, []), '已导入：42 个任务');
});

test('SEO audit task selection resets on filters but preserves generated task when requested', async () => {
  const seoAuditModule = await import('../../components/SeoAuditDashboard.tsx');
  const resolveSeoAuditSelection = seoAuditModule.resolveSeoAuditSelection as Function;
  const first = { id: 1, url: '/one' };
  const second = { id: 2, url: '/two' };
  const generated = { id: 3, url: '/generated', latestGeneration: { id: 9 } };

  assert.deepEqual(resolveSeoAuditSelection([first, second], { id: 9 }), first);
  assert.deepEqual(resolveSeoAuditSelection([], { id: 9 }), null);
  assert.deepEqual(resolveSeoAuditSelection([first, second], first, generated), generated);
});

test('SEO audit task rows are selectable outside the title button', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../../components/SeoAuditDashboard.tsx', import.meta.url), 'utf8');

  assert.match(source, /data-testid=\{`seo-audit-task-row-\$\{task\.id\}`\}/);
  assert.match(source, /onClick=\{\(\) => selectTask\(task\)\}/);
  assert.match(source, /onKeyDown=\{event => \{[\s\S]*event\.key === "Enter"[\s\S]*event\.key === " "/);
  assert.match(source, /aria-selected=\{selectedTask\?\.id === task\.id\}/);
  assert.match(source, /stopPropagation\(\)/);
});

test('command center exposes SEO audit workspace entry', async () => {
  const commandCenterModule = await import('../../components/CommandCenterDashboard.tsx');
  const CommandCenterDashboard = commandCenterModule.CommandCenterDashboard as React.ComponentType<any>;
  const html = renderToStaticMarkup(React.createElement(CommandCenterDashboard, {
    theme,
    initialSummary: {
      score: 88,
      label: 'Good',
      updatedAt: '2026-05-27T00:00:00Z',
      critical: 0,
      warningsCount: 1,
      notices: 2,
      generatedUnsynced: 0,
      groups: [],
      warnings: [],
      issues: [],
    },
  }));

  assert.match(html, /SEO 审计导入/);
  assert.match(html, /打开 SEO 审计/);
  assert.match(html, /data-testid="command-center-seo-audit"/);
});

test('bulk Blog format dashboard renders Blog type filters', async () => {
  const blogFormatModule = await import('../../components/BlogFormatDashboard.tsx');
  const BlogFormatDashboard = blogFormatModule.BlogFormatDashboard as React.ComponentType<any>;
  const html = renderToStaticMarkup(React.createElement(BlogFormatDashboard, {
    theme,
    keywordContext: 'product sample keyword database',
    keywordFileName: '示例产品 关键词库',
    companyContext: 'Demo Brand factory context',
    useSkills: true,
    skillCategories: [
      { slug: 'product-sample', label: '示例产品' },
      { slug: 'paper-towel-product', label: '示例配件' },
    ],
    selectedCategory: 'product-sample',
    onSelectCategory: () => undefined,
  }));

  assert.match(html, /批量修复博客格式/);
  assert.match(html, /博客类型/);
  assert.match(html, /全部博客/);
  assert.match(html, /普通博客/);
  assert.match(html, /展会博客/);
  assert.match(html, /证书博客/);
  assert.match(html, /项目博客/);
  assert.match(html, /产品视频博客/);
  assert.match(html, /SEO\/标签\/Schema 修复/);
  assert.match(html, /内容丰富\/扩写/);
  assert.match(html, /内容知识库/);
  assert.match(html, /示例产品/);
  assert.match(html, /示例配件/);
  assert.match(html, /示例产品 关键词库/);
  assert.match(html, /问题筛选/);
  assert.match(html, /缺 SEO/);
  assert.match(html, /缺标签/);
  assert.match(html, /缺 Schema/);
});

test('exhibition certificate project blog generator renders project controls', async () => {
  const blogAiModule = await import('../../components/BlogAIGeneratorDashboard.tsx');
  const { readFile } = await import('node:fs/promises');
  const BlogAIGeneratorDashboard = blogAiModule.BlogAIGeneratorDashboard as React.ComponentType<any>;
  const source = await readFile(new URL('../../components/BlogAIGeneratorDashboard.tsx', import.meta.url), 'utf8');
  const html = renderToStaticMarkup(React.createElement(BlogAIGeneratorDashboard, {
    theme,
    keywordContext: '',
    companyContext: '',
  }));

  assert.match(html, /展会\/证书\/项目博客/);
  assert.match(html, /证书\/认证博客/);
  assert.match(html, /工程项目博客/);
  assert.match(html, /上传本地图片/);
  assert.match(html, /搜索 WordPress 媒体库/);
  assert.match(html, /选择媒体库图片/);
  assert.match(html, /补充事实/);
  assert.match(html, /写作语言/);
  assert.match(source, /默认跟随资料和主题/);
  assert.doesNotMatch(source, /例如：中文 \/ English \/ Spanish/);
  assert.match(html, /自定义目标客户/);
  assert.match(source, /targetAudience: \[\]/);
  assert.match(source, /data-testid="blog-ai-audience-input"/);
  assert.match(source, /mode="multiple"/);
  assert.match(source, /allowCreate/);
  assert.doesNotMatch(html, /渠道伙伴/);
  assert.doesNotMatch(html, /项目决策者/);
  assert.doesNotMatch(html, /设施管理团队/);
  assert.doesNotMatch(html, />partners</);
  assert.doesNotMatch(html, />Project buyers</);
  assert.match(html, /已导入关键词/);
  assert.match(source, /data-testid="blog-ai-keyword-selector"/);
  assert.match(source, /keywordOptions/);
  assert.match(source, /当前可用关键词/);
  assert.match(html, /展会名称/);
  assert.match(source, /language: ""/);
  assert.doesNotMatch(source, /language: "English"/);
  assert.match(source, /我已确认认证类型、适用产品\/型号、证书文件和证书范围声明/);
  assert.match(source, /这篇文章可以公开客户\/项目名称/);
  assert.match(source, /项目需求 \/ 痛点/);
  assert.match(html, /产品视频博客/);
  assert.match(source, /formatBlogFrameworkLabel/);
  assert.match(source, /展会复盘/);
  assert.match(source, /YouTube 链接/);
  assert.match(source, /读取视频信息/);
  assert.match(source, /视频标题/);
  assert.match(source, /视频描述/);
  assert.match(source, /Alt 文本/);
  assert.match(source, /图片说明/);
  assert.match(source, /SEO 标题/);
  assert.match(source, /SEO 描述/);
  assert.match(source, /label="摘要"/);
  assert.match(source, /1\. 生成大纲/);
  assert.match(source, /label="文章大纲"/);
  assert.doesNotMatch(source, /1\. 生成 Outline/);
  assert.doesNotMatch(source, /label="Outline"/);
  assert.match(source, /产品型号/);
  assert.match(source, /label="目标受众"/);
  assert.match(source, /label="使用场景"/);
  assert.doesNotMatch(source, /目标买家 \/ 使用场景/);
  assert.match(html, /下载 DOCX/);
});

test('site skill factory seeds blog frameworks with Chinese labels and rules', async () => {
  const { readFile } = await import('node:fs/promises');
  const skillFactorySource = await readFile(new URL('../../components/SkillFactoryDashboard.tsx', import.meta.url), 'utf8');
  const workbenchSource = await readFile(new URL('../../components/BlogFrameworkStandardWorkbench.tsx', import.meta.url), 'utf8');
  const profileSource = await readFile(new URL('../../services/clientProfileService.ts', import.meta.url), 'utf8');
  const combined = `${skillFactorySource}\n${workbenchSource}\n${profileSource}`;

  assert.match(combined, /"通用 SEO 文章"/);
  assert.match(combined, /heading: "核心信息"/);
  assert.match(workbenchSource, /自定义博客框架/);
  assert.match(profileSource, /"展会复盘"/);
  assert.match(profileSource, /"证书说明"/);
  assert.match(profileSource, /"项目案例"/);
  assert.match(profileSource, /"视频博客"/);
  assert.doesNotMatch(combined, /Standard SEO Article/);
  assert.doesNotMatch(combined, /Custom Blog Framework/);
  assert.match(workbenchSource, /恢复内置默认/);
  assert.match(workbenchSource, /撤销本轮/);
  assert.match(workbenchSource, /保存为站点框架标准/);
});

test('FAQ stays in the skill factory while link index lives in settings sitemap', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../../components/SkillFactoryDashboard.tsx', import.meta.url), 'utf8');
  const appSource = await readFile(new URL('../../App.tsx', import.meta.url), 'utf8');
  const appTabsSource = await readFile(new URL('../../appTabs.ts', import.meta.url), 'utf8');
  const sitemapSource = await readFile(new URL('../../components/SitemapDashboard.tsx', import.meta.url), 'utf8');
  const styles = await readFile(new URL('../../src/styles.css', import.meta.url), 'utf8');

  assert.match(source, /\{ id: "faqs", label: "FAQ 库", detail: "按资料来源分类生成、审核和复用" \}/);
  assert.match(source, /activeSection === "faqs"/);
  assert.match(source, /根据资料生成 FAQ/);
  assert.match(source, /来源：[\s\S]{0,120}已保留的公司信息、产品 \/ SKU、页面素材/);
  assert.match(source, /使用：[\s\S]{0,120}博客、页面内容、WooCommerce 产品详情/);
  assert.match(source, /待确认 FAQ/);
  assert.match(source, /FAQ 库条目/);
  assert.doesNotMatch(source, /FAQ_STATUS_ITEMS/);
  assert.doesNotMatch(source, /\{ id: "linkIndex", label: "可引用页面"/);
  assert.doesNotMatch(source, /activeSection === "linkIndex"/);
  assert.doesNotMatch(appTabsSource, /mode: 'sitemap', label: '站点地图'/);
  assert.doesNotMatch(appSource, /data-testid="persistent-view-sitemap"/);
  assert.match(appSource, /data-testid="settings-section-sitemap"/);
  assert.match(appSource, /embedded[\s\S]{0,80}<SitemapDashboard|<SitemapDashboard[\s\S]{0,80}embedded/);
  assert.doesNotMatch(appSource, /data-testid="settings-section-links"/);
  assert.match(sitemapSource, /data-testid="sitemap-dashboard"/);
  assert.match(sitemapSource, /sitemap-dashboard--embedded/);
  assert.match(sitemapSource, /sitemap-dashboard-embedded-head/);
  assert.match(sitemapSource, /embedded \? "" : "p-5"/);
  assert.match(sitemapSource, /sitemap-content-grid/);
  assert.doesNotMatch(sitemapSource, /lg:grid-cols-\[minmax\(0,0\.9fr\)_minmax\(420px,1\.1fr\)\]/);
  assert.match(sitemapSource, /sitemap-toolbar/);
  assert.match(sitemapSource, /sitemap-rule-grid/);
  assert.match(sitemapSource, /内链 URL 池/);
  assert.match(sitemapSource, /刷新索引/);
  assert.match(styles, /\.sitemap-dashboard\s*\{[\s\S]*container-type:\s*inline-size/);
  assert.match(styles, /\.sitemap-dashboard-embedded-head\s*\{/);
  assert.match(styles, /@container\s*\(min-width:\s*860px\)\s*\{[\s\S]*\.sitemap-content-grid\s*\{[\s\S]*grid-template-columns:\s*minmax\(280px,\s*0\.9fr\)\s*minmax\(420px,\s*1\.1fr\)/);
  assert.match(styles, /\.skill-section-tab\.ui-navigation-card--selected \.ui-navigation-card__title[\s\S]{0,80}color:\s*var\(--system-active\)/);
  assert.match(styles, /\.skill-section-tab\.ui-navigation-card--selected \.ui-navigation-card__description[\s\S]{0,80}color:\s*var\(--system-muted\)/);
  assert.doesNotMatch(source, /data-testid="company-info-assets"/);
  assert.doesNotMatch(source, /skill-company-assets-toolbar/);
});

test('settings and first-run setup no longer expose SFTP configuration', async () => {
  const { readFile } = await import('node:fs/promises');
  const appSource = await readFile(new URL('../../App.tsx', import.meta.url), 'utf8');
  const setupSource = await readFile(new URL('../../components/SetupWizard.tsx', import.meta.url), 'utf8');

  assert.doesNotMatch(appSource, /SettingsSectionId[\s\S]{0,220}'sftp'/);
  assert.doesNotMatch(appSource, /data-testid="settings-section-sftp"/);
  assert.doesNotMatch(appSource, /SFTP 服务器配置/);
  assert.doesNotMatch(setupSource, /title="SFTP"/);
  assert.doesNotMatch(setupSource, /要直接替换媒体原图，才需要填 SFTP/);
});

test('settings and first-run setup expose a desktop Vertex JSON file picker without removing manual path input', async () => {
  const { readFile } = await import('node:fs/promises');
  const appSource = await readFile(new URL('../../App.tsx', import.meta.url), 'utf8');
  const setupSource = await readFile(new URL('../../components/SetupWizard.tsx', import.meta.url), 'utf8');

  assert.match(appSource, /data-testid="settings-vertex-json-path"/);
  assert.match(appSource, /data-testid="settings-vertex-json-picker"/);
  assert.match(appSource, /selectJsonFile\?\.\(\)/);
  assert.match(appSource, /googleApplicationCredentials:\s*selectedPath/);
  assert.match(setupSource, /data-testid="setup-vertex-json-path"/);
  assert.match(setupSource, /data-testid="setup-vertex-json-picker"/);
  assert.match(setupSource, /selectJsonFile\?\.\(\)/);
  assert.match(setupSource, /googleApplicationCredentials:\s*selectedPath/);
});

test('skill factory knowledge sources can be cleared and keep dark hover subtle', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../../components/SkillFactoryDashboard.tsx', import.meta.url), 'utf8');
  const styles = await readFile(new URL('../../src/styles.css', import.meta.url), 'utf8');

  assert.match(source, /clearClientKnowledgeSources/);
  assert.match(source, /const handleClearSources/);
  assert.match(source, /data-testid="skill-source-clear-button"/);
  assert.match(source, /清空资料源/);
  assert.match(source, /className="skill-source-list"/);
  assert.match(source, /原始资料记录/);
  assert.match(source, /待确认 Markdown/);
  assert.match(source, /已保留知识/);
  assert.match(styles, /\.skill-source-list-row\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1\.2fr\)/);
  assert.match(styles, /\.skill-reviewed-collapse/);
  assert.match(styles, /\.skill-reviewed-markdown/);
  assert.doesNotMatch(source, /className="control-table skill-source-table"/);
  assert.doesNotMatch(styles, /\.skill-source-table \.arco-table-th/);
});

test('SEO audit query button is aligned inside the filter grid', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../../components/SeoAuditDashboard.tsx', import.meta.url), 'utf8');
  const styles = await readFile(new URL('../../src/styles.css', import.meta.url), 'utf8');

  assert.match(source, /className="seo-audit-filter-grid"/);
  assert.match(source, /className="seo-audit-search-action"/);
  assert.match(source, /data-testid="seo-audit-query-button"/);
  assert.match(source, /className="seo-audit-query-button"/);
  assert.match(styles, /\.seo-audit-filter-grid\s*\{[\s\S]*grid-template-columns:\s*repeat\(4,\s*minmax\(132px,\s*1fr\)\)\s+minmax\(260px,\s*1\.35fr\)/);
  assert.match(styles, /\.seo-audit-search-action\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+minmax\(112px,\s*auto\)/);
  assert.match(styles, /@media \(max-width:\s*1320px\)[\s\S]*\.seo-audit-filter-grid\s*\{[\s\S]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(styles, /@media \(max-width:\s*1320px\)[\s\S]*\.seo-audit-search-action\s*\{[\s\S]*grid-column:\s*1 \/ -1/);
});

test('blog AI backend does not force English when language is blank', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../../backend/main.py', import.meta.url), 'utf8');

  assert.match(source, /def _blog_ai_language_instruction/);
  assert.match(source, /payload\.language or _blog_ai_language_instruction/);
  assert.doesNotMatch(source, /language: str = "English"/);
  assert.doesNotMatch(source, /Write in \{payload\.language or "English"\}/);
});

test('browser tab title uses the independent site AI brand', async () => {
  const { readFile } = await import('node:fs/promises');
  const html = await readFile(new URL('../../index.html', import.meta.url), 'utf8');

  assert.match(html, /<title>独立站 AI<\/title>/);
  assert.doesNotMatch(html, /LensCraft/);
});

test('App propagates its desktop platform to the document and root shell', async () => {
  const { readFile } = await import('node:fs/promises');
  const appSource = await readFile(new URL('../../App.tsx', import.meta.url), 'utf8');

  assert.match(appSource, /const desktopPlatform = window\.seoWpSyncDesktop\?\.platform \?\? 'browser';/);
  assert.match(appSource, /document\.documentElement\.dataset\.platform = desktopPlatform/);
  assert.match(appSource, /data-runtime=\{isDesktopRuntime \? 'desktop' : 'browser'\}/);
  assert.match(appSource, /data-platform=\{desktopPlatform\}/);
});
