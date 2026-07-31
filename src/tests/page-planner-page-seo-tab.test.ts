import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('page SEO is a nested workspace tab inside Page Planner', async () => {
  const source = await readFile(new URL('../../components/PagePlannerDashboard.tsx', import.meta.url), 'utf8');
  const appTabs = await readFile(new URL('../../appTabs.ts', import.meta.url), 'utf8');
  const styles = await readFile(new URL('../../src/styles.css', import.meta.url), 'utf8');

  assert.match(source, /PageSeoPanel/);
  assert.match(source, /data-testid="page-planner-workspace-tabs"/);
  assert.match(source, /TabsList/);
  assert.match(source, /TabButton/);
  assert.match(source, /page-planner-workspace-header/);
  assert.match(source, /page-planner-dashboard/);
  assert.doesNotMatch(source, /className=\{`mx-auto flex w-fit flex-wrap/);
  assert.match(source, /page-planner-subtab-pageSeo/);
  assert.match(source, />页面 SEO</);
  assert.match(source, /workspaceMode === "pageSeo"/);
  assert.doesNotMatch(appTabs, /pageSeo/);
  assert.match(styles, /\.ui-tabs-list \.arco-tabs-header-title:hover\s*\{[\s\S]*background:\s*var\(--system-hover\)/);
  assert.match(styles, /\.ui-tabs-list \.arco-tabs-header-title-active\s*\{[\s\S]*color:\s*var\(--system-active\)/);
  assert.match(styles, /\.ui-tabs-list \.arco-tabs-header-title:focus-visible\s*\{[\s\S]*box-shadow:\s*var\(--ds-ring\)/);
  assert.match(styles, /\[data-testid="persistent-view-pagePlanner"\][\s\S]*\.page-planner-dashboard[\s\S]*max-width:\s*100%/);
  assert.match(styles, /\.page-planner-dashboard\s*\{[^}]*overflow-x:\s*hidden !important/);
});

test('page workspace avoids repeated explanatory copy inside nested panels', async () => {
  const plannerSource = await readFile(new URL('../../components/PagePlannerDashboard.tsx', import.meta.url), 'utf8');
  const pageSeoSource = await readFile(new URL('../../components/PageSeoPanel.tsx', import.meta.url), 'utf8');
  const combined = `${plannerSource}\n${pageSeoSource}`;

  assert.equal((plannerSource.match(/从关键词到固定页面施工图/g) || []).length, 1);
  assert.equal((plannerSource.match(/生成固定页面施工图/g) || []).length, 0);
  assert.match(plannerSource, /className="page-planner-section-header"/);
  assert.match(plannerSource, /className="page-planner-actions"/);

  assert.equal((combined.match(/读取 WordPress 页面 \/ 产品分类页/g) || []).length, 1);
  assert.equal((pageSeoSource.match(/WordPress 页面 \/ 产品分类页 · SEO 标题 · Meta 描述/g) || []).length, 0);
  assert.match(pageSeoSource, /className="page-seo-title-block"/);
});

test('page SEO dashboard copy is explicitly scoped to WordPress Pages, not WooCommerce', async () => {
  const source = await readFile(new URL('../../components/PageSeoPanel.tsx', import.meta.url), 'utf8');

  assert.match(source, /WordPress 页面/);
  assert.match(source, /产品分类页/);
  assert.match(source, /核心关键词/);
  assert.match(source, /生成所选字段/);
  assert.match(source, /generateFields\(\["seoTitle"\]/);
  assert.match(source, /generateFields\(\["metaDescription"\]/);
  assert.match(source, /SEO 标题/);
  assert.match(source, /Meta 描述/);
  assert.doesNotMatch(source, /wc\/v3\/products(?:\?|$)|WooCommerce 产品|products\/sync-seo/i);
});

test('page SEO dashboard exposes cancellable and retryable page loading', async () => {
  const source = await readFile(new URL('../../components/PageSeoPanel.tsx', import.meta.url), 'utf8');

  assert.match(source, /AbortController/);
  assert.match(source, /中止/);
  assert.match(source, /重新读取/);
  assert.match(source, /读取超时/);
});

test('page SEO dashboard waits long enough for WordPress SEO detail reads', async () => {
  const source = await readFile(new URL('../../components/PageSeoPanel.tsx', import.meta.url), 'utf8');

  assert.match(source, /PAGE_SEO_LOAD_TIMEOUT_MS\s*=\s*40_000/);
  assert.match(source, /PAGE_SEO_LOAD_FALLBACK_TIMEOUT_MS\s*=\s*25_000/);
});

test('page SEO dashboard reuses cached WordPress pages until the user scans again', async () => {
  const source = await readFile(new URL('../../components/PageSeoPanel.tsx', import.meta.url), 'utf8');

  assert.match(source, /loadPageSeoPanelCache/);
  assert.match(source, /savePageSeoPanelCache/);
  assert.match(source, /clearPageSeoPanelCache/);
  assert.match(source, /page-seo-cache-badge/);
  assert.match(source, /缓存：/);
  assert.match(source, /本地缓存/);
  assert.match(source, /清除缓存/);
  assert.doesNotMatch(source, /useEffect\(\(\) => \{\s*void loadPages\(\);\s*\}, \[loadPages\]\);/);
});

test('page SEO dashboard exposes copy and internal link optimization controls', async () => {
  const source = await readFile(new URL('../../components/PageSeoPanel.tsx', import.meta.url), 'utf8');

  assert.match(source, /文案与内链优化/);
  assert.match(source, /复制整页优化包/);
  assert.match(source, /复制本段文案/);
  assert.match(source, /复制锚文本/);
  assert.match(source, /复制 HTML/);
  assert.match(source, /navigator\.clipboard\.writeText/);
  assert.match(source, /generatePageSeoCopyOptimization/);
});

test('page SEO dashboard uses layered desktop toolbar controls', async () => {
  const source = await readFile(new URL('../../components/PageSeoPanel.tsx', import.meta.url), 'utf8');
  const styles = await readFile(new URL('../../src/styles.css', import.meta.url), 'utf8');

  assert.match(source, /page-seo-panel/);
  assert.match(source, /className="page-seo-header"/);
  assert.match(source, /className="page-seo-actions"/);
  assert.match(source, /className="page-seo-filter-grid"/);
  assert.match(source, /page-seo-ai-panel/);
  assert.match(source, /className="page-seo-ai-fields"/);
  assert.match(source, /page-seo-action-button/);
  assert.match(source, /page-seo-action-button-load/);
  assert.match(source, /page-seo-action-button-generate/);
  assert.match(source, /page-seo-action-button-sync/);
  assert.match(styles, /\.page-seo-header\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto/);
  assert.match(styles, /\.page-seo-actions\s*\{[\s\S]*max-width:\s*min\(100%,\s*980px\)/);
  assert.match(styles, /\.page-seo-action-button\.arco-btn\s*\{[\s\S]*min-height:\s*var\(--ds-control-height\)/);
  assert.match(styles, /\.page-seo-action-button\.arco-btn:not\(\.arco-btn-disabled\):not\(\[disabled\]\)\s*\{[\s\S]*background:\s*color-mix\(in srgb,\s*var\(--system-active\)\s*8%,\s*var\(--system-surface\)\)/);
  assert.match(styles, /\.page-seo-action-button-load\.arco-btn:not\(\.arco-btn-disabled\):not\(\[disabled\]\)\s*\{[\s\S]*background:\s*color-mix\(in srgb,\s*var\(--system-active\)\s*16%,\s*var\(--system-surface\)\)\s*!important/);
  assert.match(styles, /\.page-seo-action-button-primary\.arco-btn:not\(\.arco-btn-disabled\):not\(\[disabled\]\)\s*\{[\s\S]*background:\s*var\(--ds-primary\)\s*!important/);
  assert.match(styles, /\.page-seo-action-button-sync\.arco-btn:not\(\.arco-btn-disabled\):not\(\[disabled\]\)\s*\{[\s\S]*background:\s*var\(--ds-success-solid\)\s*!important/);
  assert.match(styles, /\.page-seo-action-button-generate\.arco-btn\[disabled\]/);
  assert.match(styles, /\.page-seo-action-button-sync\.arco-btn\[disabled\]/);
  assert.match(styles, /\.page-seo-filter-grid\s*\{[\s\S]*grid-template-columns:\s*minmax\(150px,\s*180px\)\s+minmax\(130px,\s*150px\)\s+minmax\(220px,\s*1fr\)\s+minmax\(150px,\s*170px\)/);
  assert.match(styles, /\.page-seo-ai-fields\s*\{[\s\S]*grid-template-columns:\s*auto\s+repeat\(2,\s*max-content\)/);
});

test('page SEO review list uses responsive rows without horizontal scrolling', async () => {
  const source = await readFile(new URL('../../components/PageSeoPanel.tsx', import.meta.url), 'utf8');
  const styles = await readFile(new URL('../../src/styles.css', import.meta.url), 'utf8');

  assert.match(source, /className=\{`mt-5 page-seo-review-list/);
  assert.match(source, /className="page-seo-review-toolbar"/);
  assert.match(source, /page-seo-review-heading-pages/);
  assert.match(source, /WORDPRESS PAGES/);
  assert.match(source, /当前 SEO/);
  assert.match(source, /待同步 SEO/);
  assert.match(source, /当前页面/);
  assert.match(source, /文章与内链优化/);
  assert.match(source, /className="page-seo-review-row"/);
  assert.match(source, /className="page-seo-review-grid"/);
  assert.match(source, /className="page-seo-current-card"/);
  assert.match(source, /className="page-seo-draft-card"/);
  assert.match(source, /className="page-seo-draft-field"/);
  assert.match(source, /className="page-seo-feedback-row"/);
  assert.doesNotMatch(source, /ArcoTable/);

  assert.match(styles, /\.page-seo-review-list\s*\{[^}]*overflow:\s*hidden/);
  assert.match(styles, /\.page-seo-review-list\s*\{[^}]*max-width:\s*100%/);
  assert.doesNotMatch(styles, /\.page-seo-review-list\s*\{[^}]*overflow-x:\s*auto/);
  assert.match(styles, /\.page-seo-review-toolbar\s*\{[^}]*min-width:\s*0/);
  assert.match(styles, /\.page-seo-review-toolbar\s*\{[^}]*max-width:\s*100%/);
  assert.match(styles, /\.page-seo-review-toolbar\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*0\.95fr\)\s+minmax\(0,\s*0\.86fr\)\s+minmax\(0,\s*1\.45fr\)/);
  assert.match(styles, /\.page-seo-review-grid\s*\{[^}]*min-width:\s*0/);
  assert.match(styles, /\.page-seo-review-grid\s*\{[^}]*max-width:\s*100%/);
  assert.match(styles, /\.page-seo-review-grid\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*0\.95fr\)\s+minmax\(0,\s*0\.86fr\)\s+minmax\(0,\s*1\.45fr\)/);
  assert.doesNotMatch(styles, /\.page-seo-review-toolbar\s*\{[^}]*min-width:\s*1040px/);
  assert.doesNotMatch(styles, /\.page-seo-review-grid\s*\{[^}]*min-width:\s*1040px/);
  assert.doesNotMatch(styles, /\.page-seo-review-toolbar\s*\{[^}]*min-width:\s*980px/);
  assert.doesNotMatch(styles, /\.page-seo-review-grid\s*\{[^}]*min-width:\s*980px/);
  assert.match(styles, /\.page-seo-draft-fields\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  assert.match(styles, /@media \(max-width:\s*1180px\)\s*\{[\s\S]*\.page-seo-review-grid\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  assert.match(styles, /\.page-seo-draft-field \.arco-textarea\s*\{[^}]*min-height:\s*92px/);
});
