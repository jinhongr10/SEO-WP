import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("blog format dashboard surfaces partial scan warnings", async () => {
  const root = new URL("../../", import.meta.url);
  const source = await readFile(new URL("components/BlogFormatDashboard.tsx", root), "utf8");

  assert.match(source, /fetchBulkFormatBlogPostList/);
  assert.match(source, /warnings\.join/);
  assert.doesNotMatch(source, /const items = await fetchBulkFormatBlogPosts/);
});

test("blog format dashboard exposes the two-step content enrichment workflow", async () => {
  const root = new URL("../../", import.meta.url);
  const source = await readFile(new URL("components/BlogFormatDashboard.tsx", root), "utf8");

  assert.match(source, /按框架生成正文/);
  assert.match(source, /contentWorkflowStage/);
  assert.match(source, /blog-content-added/);
  assert.match(source, /原文/);
  assert.match(source, /扩写稿/);
});

test("blog format dashboard loads article detail for in-place review", async () => {
  const root = new URL("../../", import.meta.url);
  const source = await readFile(new URL("components/BlogFormatDashboard.tsx", root), "utf8");

  assert.match(source, /fetchBulkFormatBlogPostDetail/);
  assert.match(source, /activeDetailPostId/);
  assert.match(source, /文章详情/);
  assert.match(source, /当前正文/);
  assert.match(source, /当前 SEO/);
  assert.match(source, /Tags \/ Schema/);
  assert.match(source, /内容建议/);
  assert.match(source, /BlogContentSuggestionList/);
  assert.match(source, /buildBlogContentSuggestions\(activeDetail/);
  assert.match(source, /点击左侧文章查看正文和 SEO 现状/);
});

test("blog content suggestions flag SEO and body gaps", async () => {
  const root = new URL("../../", import.meta.url);
  const { buildBlogContentSuggestions } = await import(
    new URL("components/BlogFormatDashboard.tsx", root).href
  );

  const suggestions = buildBlogContentSuggestions({
    id: 9256,
    title: "Foam Product Sample Guide",
    slug: "foam-product-sample-guide",
    status: "publish",
    modified: "2026-06-18T01:41:57",
    link: "https://example.com/foam-product-sample-guide",
    summary: {
      wordCount: 420,
      headingCount: 1,
      tableCount: 0,
      imageCount: 0,
      linkCount: 0,
      hasEditorFriendlyBlocks: false,
    },
    seoStatus: { state: "missing", label: "SEO 缺失" },
    tagStatus: { state: "missing", label: "Tags 缺失" },
    schemaStatus: { state: "missing", label: "Schema 缺失" },
    tagNames: [],
    schemaTypes: [],
  }, { repairMode: "seo", coreKeyword: "" });

  const labels = suggestions.map((suggestion: { label: string }) => suggestion.label);
  const thinSuggestion = suggestions.find((suggestion: { id: string }) => suggestion.id === "thin-content");
  assert.ok(labels.includes("先填核心关键词"));
  assert.ok(labels.includes("补 SEO 标题/描述"));
  assert.ok(labels.includes("补 Tags"));
  assert.ok(labels.includes("补 Schema"));
  assert.ok(labels.includes("正文偏薄"));
  assert.ok(labels.includes("整理 Gutenberg 区块"));
  assert.equal(thinSuggestion?.action, "generate_content_plan");
  assert.equal(thinSuggestion?.actionLabel, "生成扩写框架");
  assert.deepEqual(thinSuggestion?.recommendedAdditions, [
    "直接答案开头",
    "决策标准",
    "应用场景",
    "规格/对比表",
    "安装维护",
    "FAQ",
  ]);
});

test("blog post issue badges summarize each article problem for the left list", async () => {
  const root = new URL("../../", import.meta.url);
  const { buildBlogPostIssueBadges } = await import(
    new URL("components/BlogFormatDashboard.tsx", root).href
  );

  const issues = buildBlogPostIssueBadges({
    id: 9960,
    title: "Travel Fan Guide",
    slug: "travel-fan-guide",
    status: "publish",
    modified: "2026-06-18T01:41:57",
    link: "https://example.com/travel-fan-guide",
    issueCodes: ["missing_tags", "missing_faq_schema", "thin_blog_content"],
    summary: {
      wordCount: 430,
      headingCount: 2,
      tableCount: 0,
      imageCount: 1,
      linkCount: 1,
      hasEditorFriendlyBlocks: false,
    },
  });

  const labels = issues.map((issue: { label: string }) => issue.label);
  assert.ok(labels.includes("缺 Tags"));
  assert.ok(labels.includes("缺 FAQ Schema"));
  assert.ok(labels.includes("正文偏薄"));
  assert.ok(labels.includes("区块结构"));
});

test("blog format dashboard renders issue badges in the left article list", async () => {
  const root = new URL("../../", import.meta.url);
  const source = await readFile(new URL("components/BlogFormatDashboard.tsx", root), "utf8");

  assert.match(source, /BlogPostIssueBadges/);
  assert.match(source, /博客问题/);
  assert.match(source, /buildBlogPostIssueBadges\(post\)/);
  assert.match(source, /post\.issueCodes/);
  assert.match(source, /hasEditorFriendlyBlocks/);
});

test("blog format dashboard can generate a single content plan from thin-content suggestions", async () => {
  const root = new URL("../../", import.meta.url);
  const source = await readFile(new URL("components/BlogFormatDashboard.tsx", root), "utf8");

  assert.match(source, /generateContentPlanForDetail/);
  assert.match(source, /activeDetailContentPlan/);
  assert.match(source, /suggestion\.action === 'generate_content_plan'/);
  assert.match(source, /生成扩写框架/);
  assert.match(source, /postIds:\s*\[activeDetail\.id\]/);
  assert.match(source, /repairMode:\s*'content'/);
  assert.match(source, /contentAction:\s*'plan'/);
  assert.match(source, /没有选择产品知识库/);
  assert.match(source, /每段新增框架/);
});

test("blog content plan panel stays readable inside the narrow detail column", async () => {
  const root = new URL("../../", import.meta.url);
  const source = await readFile(new URL("components/BlogFormatDashboard.tsx", root), "utf8");

  assert.match(source, /flex flex-col gap-3/);
  assert.match(source, /min-w-0 flex-1/);
  assert.match(source, /whitespace-nowrap/);
  assert.match(source, /break-words/);
  assert.doesNotMatch(source, /lg:grid-cols-\[0\.8fr_1\.2fr\]/);
});

test("content plan additions show a writing direction before draft generation", async () => {
  const root = new URL("../../", import.meta.url);
  const source = await readFile(new URL("components/BlogFormatDashboard.tsx", root), "utf8");

  assert.match(source, /写作方向/);
  assert.match(source, /addition\.direction/);
  assert.match(source, /这一段建议补/);
});

test("content plan previews do not show an empty body iframe before draft generation", async () => {
  const root = new URL("../../", import.meta.url);
  const source = await readFile(new URL("components/BlogFormatDashboard.tsx", root), "utf8");

  assert.match(source, /item\.repairMode === 'content' && item\.contentWorkflowStage !== 'draft'/);
  assert.match(source, /确认框架后点击/);
  assert.match(source, /item\.repairMode === 'content' && item\.contentWorkflowStage === 'draft'/);
});

test("generated content plans are reviewed in the full preview area instead of the narrow detail sidebar", async () => {
  const root = new URL("../../", import.meta.url);
  const source = await readFile(new URL("components/BlogFormatDashboard.tsx", root), "utf8");

  assert.match(source, /BlogContentPlanReadyNotice/);
  assert.match(source, /扩写框架已生成/);
  assert.doesNotMatch(source, /activeDetailContentPlan && \(\s*<BlogContentPlanPanel/);
});

test("left article list stays usable while the right review area scrolls", async () => {
  const root = new URL("../../", import.meta.url);
  const source = await readFile(new URL("components/BlogFormatDashboard.tsx", root), "utf8");
  const styles = await readFile(new URL("src/styles.css", root), "utf8");

  assert.match(source, /blog-format-review-list-card/);
  assert.match(source, /blog-format-review-list-scroll/);
  assert.match(styles, /\.blog-format-review-list-card\s*\{[\s\S]*?position:\s*sticky/);
  assert.match(styles, /\.blog-format-review-list-scroll\s*\{[\s\S]*?overflow:\s*auto/);
});

test("blog format review panes stay tall while the current body preview gets desktop width", async () => {
  const root = new URL("../../", import.meta.url);
  const source = await readFile(new URL("components/BlogFormatDashboard.tsx", root), "utf8");
  const styles = await readFile(new URL("src/styles.css", root), "utf8");

  assert.match(source, /blog-format-review-grid/);
  assert.match(source, /blog-format-review-list-card/);
  assert.match(source, /blog-format-review-list-scroll/);
  assert.match(source, /blog-format-detail-card/);
  assert.match(source, /blog-format-detail-body/);
  assert.match(source, /blog-format-current-body-frame/);
  assert.match(source, /blog-format-detail-side/);
  assert.match(styles, /\.blog-format-review-grid\s*\{[\s\S]*?align-items:\s*start/);
  assert.match(styles, /\.blog-format-review-list-card\s*\{[\s\S]*?overflow:\s*hidden/);
  assert.match(styles, /\.blog-format-review-list-scroll\s*\{[\s\S]*?overflow:\s*auto/);
  assert.match(styles, /@media \(min-width:\s*1280px\)\s*\{[\s\S]*?\.blog-format-review-grid\s*\{[\s\S]*?grid-template-columns:\s*minmax\(360px,\s*0\.64fr\)\s+minmax\(0,\s*1\.56fr\)/);
  assert.match(styles, /\.blog-format-detail-body\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1\.65fr\)\s+minmax\(300px,\s*0\.85fr\)/);
  assert.match(styles, /\.blog-format-current-body-frame\s*\{[\s\S]*?height:\s*clamp\(620px,\s*calc\(100dvh - 16rem\),\s*760px\)/);
  assert.match(styles, /\.blog-format-review-list-card\s*\{[\s\S]*?height:\s*clamp\(680px,\s*calc\(100dvh - 10rem\),\s*900px\)/);
});

test("blog format dashboard keeps content-plan previews out of writeback until a draft exists", async () => {
  const root = new URL("../../", import.meta.url);
  const source = await readFile(new URL("components/BlogFormatDashboard.tsx", root), "utf8");

  assert.match(source, /selectedContentPlanItems\s*=\s*selectedPreviewItems\.filter\(item => item\.repairMode === 'content' && item\.contentWorkflowStage !== 'draft'\)/);
  assert.match(source, /repairMode:\s*item\.repairMode \|\| repairMode/);
});

test("blog format dashboard guards stale article detail requests", async () => {
  const root = new URL("../../", import.meta.url);
  const source = await readFile(new URL("components/BlogFormatDashboard.tsx", root), "utf8");

  assert.match(source, /useRef/);
  assert.match(source, /detailRequestSeq\s*=\s*useRef\(0\)/);
  assert.match(source, /detailRequestSeq\.current\s*\+=\s*1/);
  assert.match(source, /const requestSeq\s*=\s*detailRequestSeq\.current\s*\+\s*1/);
  assert.match(source, /const requestRepairMode\s*=\s*repairMode/);
  assert.match(source, /fetchBulkFormatBlogPostDetail\(post\.id,\s*requestRepairMode\)/);
  assert.match(source, /detailRequestSeq\.current\s*!==\s*requestSeq/);
  assert.match(source, /detailRequestSeq\.current\s*===\s*requestSeq/);
});

test("blog format dashboard reuses cached article detail before requesting WordPress again", async () => {
  const root = new URL("../../", import.meta.url);
  const source = await readFile(new URL("components/BlogFormatDashboard.tsx", root), "utf8");

  assert.match(source, /loadBlogFormatPostDetailCache/);
  assert.match(source, /saveBlogFormatPostDetailCache/);
  assert.match(source, /clearBlogFormatPostDetailCache/);
  assert.match(source, /const cachedDetail\s*=\s*loadBlogFormatPostDetailCache\(window\.localStorage,\s*post\.id,\s*requestRepairMode,\s*Date\.now\(\),\s*siteCacheKey\)/);
  assert.match(source, /siteKey:\s*siteCacheKey/);
  assert.match(source, /setActiveDetail\(cachedDetail\.detail\)/);
  assert.match(source, /已从缓存打开/);
  assert.match(source, /saveBlogFormatPostDetailCache\(window\.localStorage,\s*\{/);
  assert.match(source, /clearBlogFormatPostDetailCache\(window\.localStorage\)/);
});

test("blog format dashboard keeps nested row actions from opening detail", async () => {
  const root = new URL("../../", import.meta.url);
  const source = await readFile(new URL("components/BlogFormatDashboard.tsx", root), "utf8");

  assert.match(
    source,
    /<input[\s\S]*?type="checkbox"[\s\S]*?checked=\{selectedIds\.has\(post\.id\)\}[\s\S]*?onClick=\{event => event\.stopPropagation\(\)\}/,
  );
  assert.match(
    source,
    /<a[\s\S]*?href=\{href\}[\s\S]*?onClick=\{event => event\.stopPropagation\(\)\}/,
  );
});

test("blog format dashboard supports SEO core keyword entry and bulk mapping", async () => {
  const root = new URL("../../", import.meta.url);
  const source = await readFile(new URL("components/BlogFormatDashboard.tsx", root), "utf8");

  assert.match(source, /bulkCoreKeyword/);
  assert.match(source, /coreKeywordMap/);
  assert.match(source, /keywordMappingText/);
  assert.match(source, /updateCoreKeyword/);
  assert.match(source, /selectedPosts/);
  assert.doesNotMatch(source, /missingCoreKeywordPosts/);
  assert.match(source, /buildCoreKeywordPayload/);
  assert.match(source, /applyBulkCoreKeywordToSelected/);
  assert.match(source, /applyKeywordMappingText/);
  assert.match(source, /批量核心关键词/);
  assert.match(source, /应用到选中文章/);
  assert.match(source, /post_id,core_keyword/);
  assert.match(source, /title,core_keyword/);
  assert.match(source, /核心关键词可选/);
  assert.match(source, /核心关键词/);
});

test("blog format dashboard separates filters from bulk actions", async () => {
  const root = new URL("../../", import.meta.url);
  const source = await readFile(new URL("components/BlogFormatDashboard.tsx", root), "utf8");
  const styles = await readFile(new URL("src/styles.css", root), "utf8");

  assert.match(source, /blog-format-action-bar/);
  assert.match(source, /blog-format-filter-panel/);
  assert.match(source, /发布范围/);
  assert.match(source, /修复目标/);
  assert.match(source, /搜索与数量/);
  assert.match(source, /id="blog-format-status-filter"/);
  assert.match(source, /id="blog-format-limit"/);
  assert.match(styles, /\.blog-format-filter-panel\s*\{[\s\S]{0,180}grid-template-columns:\s*minmax\(0,\s*1fr\)\s+minmax\(0,\s*1fr\)\s+minmax\(280px,\s*0\.9fr\)/);
  assert.match(styles, /\.blog-format-action-bar\s*\{[\s\S]{0,120}justify-content:\s*flex-start/);
});

test("blog format dashboard localizes WordPress post status labels", async () => {
  const root = new URL("../../", import.meta.url);
  const source = await readFile(new URL("components/BlogFormatDashboard.tsx", root), "utf8");

  assert.match(source, /formatBlogPostStatusLabel/);
  assert.match(source, /label:\s*'已发布'/);
  assert.match(source, /label:\s*'草稿'/);
  assert.match(source, /label:\s*'待审核'/);
  assert.match(source, /label:\s*'私密'/);
  assert.match(source, /label:\s*'定时发布'/);
  assert.match(source, /label:\s*'全部状态'/);
  assert.doesNotMatch(source, /label:\s*'Published'/);
  assert.doesNotMatch(source, /label:\s*'Draft'/);
  assert.doesNotMatch(source, /label:\s*'Pending'/);
  assert.doesNotMatch(source, /label:\s*'Private'/);
  assert.doesNotMatch(source, /label:\s*'Scheduled'/);
  assert.doesNotMatch(source, /label:\s*'Any'/);
  assert.doesNotMatch(source, /\{post\.status\}\s*·/);
  assert.doesNotMatch(source, /\{item\.status\}\s*·/);
  assert.doesNotMatch(source, /No modified date/);
  assert.doesNotMatch(source, /\(Untitled\)/);
});

test("blog core keyword map snapshot trims keywords and drops stale entries", async () => {
  const root = new URL("../../", import.meta.url);
  const { buildBlogCoreKeywordMapSnapshot } = await import(
    new URL("components/BlogFormatDashboard.tsx", root).href
  );

  assert.deepEqual(
    buildBlogCoreKeywordMapSnapshot([
      { id: 101, coreKeyword: "  product sample  " },
      { id: 102, coreKeyword: "   " },
      { id: 103 },
    ]),
    { 101: "product sample" },
  );

  assert.deepEqual(
    buildBlogCoreKeywordMapSnapshot([
      { id: 201, coreKeyword: "enterprise amenity tray" },
    ]),
    { 201: "enterprise amenity tray" },
  );
});

test("blog format dashboard sends SEO core keywords to preview", async () => {
  const root = new URL("../../", import.meta.url);
  const source = await readFile(new URL("components/BlogFormatDashboard.tsx", root), "utf8");

  assert.doesNotMatch(source, /SEO 预览需要每篇选中文章填写核心关键词/);
  assert.doesNotMatch(source, /missingCoreKeywordPosts\.length/);
  assert.match(source, /coreKeywords:\s*repairMode === 'seo'\s*\?\s*buildCoreKeywordPayload\(postIds\)\s*:\s*undefined/);
  assert.doesNotMatch(source, /keywordContext:\s*repairMode === 'content' \|\| repairMode === 'seo'/);
  assert.doesNotMatch(source, /companyContext:\s*\(repairMode === 'content' \|\| repairMode === 'seo'\)/);
  assert.match(source, /knowledgeLabel:\s*repairMode === 'content' \|\| repairMode === 'seo'/);
  assert.match(source, /setConfirmedBodyChangeIds\(new Set\(\)\)/);
});

test("blog format dashboard sends SEO apply keyword and body-change permission", async () => {
  const root = new URL("../../", import.meta.url);
  const source = await readFile(new URL("components/BlogFormatDashboard.tsx", root), "utf8");

  assert.doesNotMatch(source, /SEO 写回需要每篇预览带核心关键词/);
  assert.match(source, /coreKeyword:\s*repairMode === 'seo'/);
  assert.match(source, /allowBodyChanges:\s*repairMode === 'seo'\s*\?\s*confirmedBodyChangeIds\.has\(item\.id\)\s*:\s*undefined/);
  assert.match(source, /写回 SEO\/Tags/);
  assert.match(source, /已确认 FAQ 正文会写入；未确认 FAQ 正文会跳过/);
  assert.match(source, /仅写回 SEO\/Tags/);
});

test("blog format dashboard requires per-preview FAQ body confirmation", async () => {
  const root = new URL("../../", import.meta.url);
  const source = await readFile(new URL("components/BlogFormatDashboard.tsx", root), "utf8");

  assert.match(source, /confirmedBodyChangeIds/);
  assert.match(source, /item\.requiresBodyConfirmation && item\.bodyChangeSummary/);
  assert.match(source, /允许写入 FAQ 正文/);
  assert.match(source, /未勾选时仅写回 SEO\/Tags；勾选后会把 FAQ Schema 区块写入正文/);
  assert.match(source, /bodyChangeSummary\.beforeHtml/);
  assert.match(source, /bodyChangeSummary\.afterHtml/);
});

test("blog format dashboard exposes active Blog standard and keeps versions through writeback", async () => {
  const root = new URL("../../", import.meta.url);
  const source = await readFile(new URL("components/BlogFormatDashboard.tsx", root), "utf8");

  assert.match(source, /当前博客标准/);
  assert.match(source, /调整格式标准/);
  assert.match(source, /siteId/);
  assert.match(source, /formatVariantOverrides/);
  assert.match(source, /formatVersion/);
  assert.match(source, /standardVersion/);
  assert.match(source, /系统可读性基线/);
  assert.match(source, /直接写回 Gutenberg/);
});
