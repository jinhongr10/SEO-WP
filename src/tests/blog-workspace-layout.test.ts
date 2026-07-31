import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("standard blog workspace exposes task modes instead of one long stacked form", async () => {
  const source = await readFile(new URL("../../App.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../../src/styles.css", import.meta.url), "utf8");

  assert.match(source, /type BlogComposeMode = 'new' \| 'rewrite' \| 'polish' \| 'publish'/);
  assert.match(source, /blogComposeModeOptions/);
  assert.match(source, /data-testid="blog-workflow-mode-switcher"/);
  assert.match(source, /data-testid=\{`blog-workflow-mode-\$\{option\.mode\}`\}/);
  assert.match(source, /当前模式/);
  assert.match(source, /新写博客/);
  assert.match(source, /重写原文/);
  assert.match(source, /润色正文/);
  assert.match(source, /发布优化/);
  assert.match(source, /data-testid="blog-compact-knowledge"/);
  assert.match(source, /data-testid="blog-main-workbench"/);
  assert.match(source, /data-testid="blog-side-workbench"/);
  assert.match(source, /data-testid="blog-supporting-materials"/);
  assert.match(source, /className="blog-mode-shell mb-4"/);
  assert.match(source, /className="blog-mode-grid"/);
  assert.match(source, /blog-mode-stat-grid/);
  assert.match(styles, /\.blog-mode-shell\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+minmax\(240px,\s*280px\)/);
  assert.match(styles, /\.blog-mode-grid\.arco-radio-group\s*\{[\s\S]*grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(170px,\s*1fr\)\)/);
  assert.match(styles, /\.blog-mode-option\.arco-radio\s*\{[\s\S]*min-height:\s*72px/);
  assert.match(styles, /@media \(max-width:\s*1320px\)[\s\S]*\.blog-mode-shell\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  assert.match(styles, /@media \(max-width:\s*1320px\)[\s\S]*\.blog-mode-stat-grid\s*\{[\s\S]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
});

test("publish optimizer upload area uses non-overflowing layout hooks", async () => {
  const source = await readFile(new URL("../../App.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../../src/styles.css", import.meta.url), "utf8");

  assert.match(source, /data-testid="blog-publish-optimizer"/);
  assert.match(source, /className="blog-publish-action-row"/);
  assert.match(source, /className="blog-publish-grid"/);
  assert.match(source, /className="blog-publish-source-column/);
  assert.match(source, /data-testid="blog-final-file-upload-button"/);
  assert.match(source, /blog-final-upload-dropzone/);
  assert.match(source, /className="blog-final-upload-control"/);
  assert.match(source, /accept="\.docx,\.md,\.markdown,\.txt,\.html,\.htm"/);
  assert.match(source, /data-testid="blog-sync-draft-button"/);
  assert.match(source, /上传终稿/);
  assert.match(source, /上传后自动生成内链和排版预览/);
  assert.doesNotMatch(source, /data-testid="blog-publish-button"/);
  assert.doesNotMatch(source, /确认发布/);
  assert.doesNotMatch(source, /自动内链 \+ 排版/);
  assert.doesNotMatch(source, /上传终稿并优化/);
  assert.match(styles, /\.blog-publish-action-row\s*\{[\s\S]*grid-template-columns:\s*minmax\(180px,\s*220px\)/);
  assert.match(styles, /\.blog-publish-grid\s*\{[\s\S]*grid-template-columns:\s*minmax\(320px,\s*0\.72fr\)\s+minmax\(0,\s*1\.28fr\)/);
  assert.match(styles, /\.blog-final-upload-dropzone\s*\{[\s\S]*grid-template-columns:\s*40px\s+minmax\(0,\s*1fr\)/);
  assert.match(styles, /\.blog-upload-file-title[\s\S]*white-space:\s*normal/);
  assert.match(styles, /\.blog-final-upload-control\s+\.arco-upload-trigger\s*\{[\s\S]*width:\s*100%/);
});

test("publish optimizer previews with the current site's typography instead of a fixed app font", async () => {
  const source = await readFile(new URL("../../App.tsx", import.meta.url), "utf8");

  assert.match(source, /importSiteStyleKit/);
  assert.match(source, /ensureBlogSiteTypography/);
  assert.match(source, /const buildBlogPreviewDoc = \(html: string, styleKit\?: SiteStyleKit \| null\)/);
  assert.match(source, /blogPreviewStyleKit/);
  assert.match(source, /buildBlogPreviewDoc\(blogOptimizer\.optimizedHtml, blogPreviewStyleKit\)/);
  assert.doesNotMatch(source, /body\{font-family:Inter,Arial,sans-serif/);
});

test("specialized blog generator keeps facts compact beside outline and preview", async () => {
  const source = await readFile(new URL("../../components/BlogAIGeneratorDashboard.tsx", import.meta.url), "utf8");

  assert.match(source, /data-testid="blog-ai-brief-workbench"/);
  assert.match(source, /data-testid="blog-ai-article-type-switcher"/);
  assert.match(source, /data-testid="blog-ai-facts-panel"/);
  assert.match(source, /data-testid="blog-ai-image-panel"/);
  assert.match(source, /data-testid="blog-ai-generation-panel"/);
  assert.match(source, /data-testid="blog-ai-result-panel"/);
  assert.match(source, /type BlogAiWorkspacePanel = "outline" \| "result" \| "preview"/);
  assert.match(source, /const \[workspacePanel, setWorkspacePanel\] = useState<BlogAiWorkspacePanel>\("outline"\)/);
  assert.match(source, /xl:sticky xl:top-4 self-start/);
  assert.match(source, /h-\[620px\]/);
  assert.match(source, /补充事实/);
  assert.match(source, /图片素材/);
  assert.match(source, /生成工作台/);
  assert.match(source, /1\. 生成大纲/);
  assert.match(source, /label="文章大纲"/);
  assert.doesNotMatch(source, /1\. 生成 Outline/);
  assert.doesNotMatch(source, /label="Outline"/);
  assert.match(source, /下载 DOCX/);
  assert.doesNotMatch(source, /Download DOCX/);
});

test("specialized blog generator owns blog framework selection", async () => {
  const source = await readFile(new URL("../../components/BlogAIGeneratorDashboard.tsx", import.meta.url), "utf8");
  const appSource = await readFile(new URL("../../App.tsx", import.meta.url), "utf8");

  assert.match(source, /blogFrameworks\?: BlogFramework\[\]/);
  assert.match(source, /data-testid="blog-ai-framework-selector"/);
  assert.match(source, /博客框架/);
  assert.match(source, /frameworkId/);
  assert.match(appSource, /blogFrameworks=\{activeSiteProfile\?\.blogFrameworks \|\| \[\]\}/);
});

test("specialized blog generator localizes common English blog framework labels", async () => {
  const { formatBlogFrameworkLabel } = await import(
    new URL("../../components/BlogAIGeneratorDashboard.tsx", import.meta.url).href
  );
  const makeFramework = (id: string, label: string) => ({
    id,
    label,
    articleType: "standard",
    requiredInputs: [],
    outlineBlocks: [],
    faqRules: "",
    ctaRules: "",
    internalLinkRules: "",
  });

  assert.equal(formatBlogFrameworkLabel(makeFramework("video_blog", "Video Blog")), "产品视频博客");
  assert.equal(formatBlogFrameworkLabel(makeFramework("exhibition_blog", "Exhibition Blog")), "展会复盘博客");
  assert.equal(formatBlogFrameworkLabel(makeFramework("certificate_blog", "Certificate Blog")), "证书/认证博客");
  assert.equal(formatBlogFrameworkLabel(makeFramework("project_blog", "Project Blog")), "工程项目博客");
  assert.equal(formatBlogFrameworkLabel(makeFramework("standard_buyer_guide", "Standard Buyer Guide")), "通用 SEO 文章");
  assert.equal(formatBlogFrameworkLabel(makeFramework("certificate_explainer", "Certificate Explainer")), "证书说明");
  assert.equal(formatBlogFrameworkLabel(makeFramework("project_case", "Project Case")), "工程项目案例");
});

test("specialized blog generator embeds field feedback beside generated output", async () => {
  const source = await readFile(new URL("../../components/BlogAIGeneratorDashboard.tsx", import.meta.url), "utf8");
  const feedbackSource = await readFile(new URL("../../components/InlineGenerationFeedback.tsx", import.meta.url), "utf8");
  const appSource = await readFile(new URL("../../App.tsx", import.meta.url), "utf8");
  const pageSeoSource = await readFile(new URL("../../components/PageSeoPanel.tsx", import.meta.url), "utf8");
  const productSeoSource = await readFile(new URL("../../components/ProductSeoDashboard.tsx", import.meta.url), "utf8");
  const pagePlannerSource = await readFile(new URL("../../components/PagePlannerDashboard.tsx", import.meta.url), "utf8");

  assert.match(source, /InlineGenerationFeedback/);
  assert.match(source, /targetType="blog_post"/);
  assert.match(source, /onRevisedOutput/);
  assert.match(appSource, /siteId=\{activeSiteProfile\?\.id \|\| ''\}/);
  assert.match(pagePlannerSource, /siteId=\{siteId\}/);
  assert.match(pageSeoSource, /targetType="page"/);
  assert.match(productSeoSource, /targetType="woocommerce_product"/);
  assert.match(feedbackSource, /data-testid="inline-generation-feedback"/);
  assert.match(feedbackSource, /createGenerationSession/);
  assert.match(feedbackSource, /sendGenerationFeedback/);
  assert.match(feedbackSource, /Gemini 修改/);
});
