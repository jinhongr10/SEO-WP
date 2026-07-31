# SEO-WP 深度代码审查报告

审查日期：2026-08-01  
审查对象：`jinhongr10/SEO-WP`  
基准提交：`faa3073b76683487568a8b3ad8492d7e52fd028c` — `Remove Windows native File/Edit menu bar for a clean title bar.`

## 1. 结论先说

这次代码已经明显朝“通用型独立站 SEO 中台”方向重构：前端工作台被拆成多个 Lazy Dashboard，站点 Profile、资料库、规则包、模板包、FAQ、内链索引等也已经有独立模型；图片 SEO、博客 SEO、页面计划、产品 SEO、SEO Audit、媒体运维、品牌样式等能力都在逐步模块化。

但从当前 GitHub 可见代码看，仍然存在几类需要优先处理的问题：

1. **最高优先级：后端入口疑似缺失。** `package.json` 和 `backend/Dockerfile` 都指向 `backend.main:app` / `main:app`，但当前 `backend/main.py` 内容为空。这个会导致本地后端、Docker 后端、桌面端后端启动直接失败，所有 `/api` 功能不可用。
2. **AI 生成上下文还没有形成“可验证闭环”。** 类型和接口已经支持 `siteId`、`keywordCategory`、`keywordCandidates`、`generationContext`，但图片 SEO 的前端调用没有把 active site 的 ID/category/candidates 传下去，且保存时会丢掉 `generationContext` / `keywordUsage`。这会让“AI 是否真的用了当前公司资料库”无法被用户验证。
3. **多站点隔离有基础，但还不够事务化。** 代码里已经有 `siteProfiles`、`activeSiteId`、站点级资料库、站点级缓存清理等设计；但全局 `/settings` 与站点 Profile 保存是两步操作，失败时可能造成“当前全局配置”和“站点 Profile 配置”不一致。
4. **前端 UI/Layout 测试存在，但偏向纯前端 Harness。** Playwright 当前只启动 `dev:frontend`，不启动真实 backend，因此抓不到后端入口为空、站点 API 不存在、AI 接口不可用、上传接口不可用这类端到端问题。
5. **中控台/多站点大数据性能需要继续收口。** 当前已有 Summary Profile 的思路是对的，但 Full SiteProfile 结构包含知识源、知识产物、生成记录、内链索引、FAQ、样式等大字段。随着一个公司多个网站、每个网站几千产品/上万媒体/大量页面，必须严格区分 summary endpoint、detail endpoint、分页 endpoint、缓存刷新和虚拟滚动，否则 Command Center 会继续变慢。

---

## 2. 风险矩阵

| 优先级 | 模块 | 问题 | 影响 | 建议 |
|---|---|---|---|---|
| P0 | Backend / Desktop / Docker | `backend/main.py` 为空，但启动脚本和 Dockerfile 都需要 `app` | 本地后端无法启动；所有 `/api` 功能失败；前端只会显示后端连接/代理错误 | 立即恢复 FastAPI app 入口；新增 import smoke test 和 `/desktop/health` smoke test |
| P0 | CI / QA | UI 测试只跑前端 harness，不跑真实 backend | 空后端、接口缺失、AI/WordPress 上传不可用无法被 CI 抓住 | 新增真实后端 E2E：启动 uvicorn 后访问 `/desktop/health`、`/settings`、`/site-profiles/summary` |
| P1 | AI 生成 | 图片 SEO 调用没有传 `siteId`、`keywordCategory`、`keywordCandidates` | AI 可能用错资料、用空资料或旧资料；用户无法判断结果来源 | 所有 AI 请求统一带 `siteId`、`siteRevision`、`sourceArtifactIds`，并展示 `generationContext` |
| P1 | AI 结果保存 | `normalizeSeoData` 只保留五个 SEO 字段，丢弃 `generationContext`/`keywordUsage` | 即使后端返回了溯源，UI 也看不到；无法 debug “为什么生成成这样” | normalize 时保留扩展字段；图片 SEO 卡片展示使用了哪些资料/关键词 |
| P1 | 多站点隔离 | 保存设置先写全局 `/settings`，再写当前 site profile | 第二步失败会导致全局设置和站点资料不一致；多站点容易串配置 | 改为原子接口：`PUT /site-profiles/{id}/settings`，或 settings PUT 必须带 active `siteId`/revision |
| P1 | 多站点交互 | 切换站点后，部分 UI 草稿/图片/博客正文可能仍留在页面 | 旧站点生成的草稿可能被同步到新站点 | 所有生成草稿带 `siteId`；同步/上传前强校验 `draft.siteId === activeSiteId` |
| P1 | 性能 | Full SiteProfile 结构很大；Command Center 容易聚合太多数据 | 多网站/多产品/多媒体后首屏慢、切站慢、内存高 | Summary-only 首屏 + 分页详情 + 缓存 + 虚拟表格 + payload budget |
| P2 | UI/交互 | 网络状态检查里有硬编码 `API_BASE` 的路径 | 浏览器/server 模式自定义 backendUrl 时状态可能指错后端 | 统一使用 resolved backend URL；desktop 再强制 `/api` |
| P2 | 可观测性 | AI “用了什么资料”缺少用户可见证据 | 结果不像预期时只能猜 prompt/资料库问题 | 生成结果下方固定显示：站点、关键词类目、资料来源、规则、警告 |

---

## 3. 已经做得好的地方

### 3.1 工作台拆分方向是对的

前端入口已经把多个大模块拆成 Lazy Dashboard，例如：

- `ProductSeoDashboard`
- `PagePlannerDashboard`
- `BlogFormatDashboard`
- `BlogAIGeneratorDashboard`
- `CommandCenterDashboard`
- `SeoAuditDashboard`
- `MediaOpsDashboard`
- `SkillFactoryDashboard`
- `SitemapDashboard`
- `BrandStarterDashboard`

这个方向对性能和维护性是正确的，因为中台功能会越来越多，不应该继续把所有 UI 和状态都塞在单一工作台里。

### 3.2 多站点模型已经有基础

`SiteProfile` 已经包含：

- 站点名、站点 URL、品牌名
- 站点级 settings
- 站点级知识源与知识产物
- rule pack
- generation sessions
- template pack
- skill packs
- style kit
- blog frameworks
- blog format standard
- FAQ
- internal link settings
- link index

这说明项目已经不是单一 AOLQ 专用工具，而是在往“一个公司多个独立站”的产品结构走。

### 3.3 页面计划 prompt 有较强约束

`backend/page_planner.py` 里的 page planner prompt 有几个重要优点：

- 明确要求只使用 keyword source、company context、internal link candidates。
- 要求不要输出 HTML，而是输出 Elementor 人工制作 brief。
- 内链只能来自候选列表或生成页面之间。
- page count 有 1-50 的 clamp。
- 输出结构有 normalization。

这对避免 AI 乱编页面、乱插内链有帮助。

### 3.4 产品 SEO 比图片/博客更接近“站点级上下文闭环”

`ProductSeoDashboard` 的 request body builder 里，如果有 `siteId`，会发送 `site_id` 和 `keyword_category`；没有 `siteId` 时才退回 raw `keyword_context/company_context`。这个方向是正确的，建议图片 SEO、博客 SEO、页面计划也统一成这种模式。

---

## 4. 详细问题

## P0-1：后端入口疑似缺失

### 现象

当前代码里：

- `package.json` 的 `dev:backend` 使用：`uvicorn backend.main:app --reload --port 3004`
- `backend/Dockerfile` 使用：`uvicorn main:app --host 0.0.0.0 --port 3004`
- 但 `backend/main.py` 当前是空文件。

### 影响

这会直接影响：

- 桌面端本地后端启动
- Docker/server 部署
- `/settings`
- `/site-profiles`
- `/ai/blog`
- `/ai/image-seo`
- `/wp/upload`
- `/desktop/health`
- 所有需要 backend 的工作台

前端已经写了很多 backend readiness 和 transient recovery 逻辑，但如果 `app` 根本不存在，前端只能进入“后端启动失败/代理失败”的状态。

### 解决建议

立即做三件事：

1. **恢复 backend/main.py 的 FastAPI app。**
2. **新增最小后端入口测试。**
3. **CI 里真实启动后端，不只跑前端 harness。**

建议新增：

```python
# backend/tests/test_app_entrypoint.py
from fastapi.testclient import TestClient
from backend.main import app


def test_backend_app_imports():
    assert app is not None


def test_desktop_health_route_exists():
    client = TestClient(app)
    response = client.get('/desktop/health')
    assert response.status_code in {200, 204}
```

再新增一个 Node smoke：

```bash
python -m uvicorn backend.main:app --host 127.0.0.1 --port 3004 &
curl -f http://127.0.0.1:3004/desktop/health
curl -f http://127.0.0.1:3004/settings
curl -f http://127.0.0.1:3004/site-profiles/summary
```

---

## P0-2：当前测试结构抓不到真实后端问题

### 现象

当前 Playwright 配置启动的是：

```bash
npm run dev:frontend -- --host 127.0.0.1 --port 3103
```

也就是只跑前端测试 harness。它适合检查 layout、按钮、面板、overflow，但不能验证真实 backend 是否能启动、API 是否存在、AI/WordPress 上传是否可用。

### 影响

即使 `backend/main.py` 为空，UI layout tests 仍然可能通过。

### 解决建议

新增一个 `playwright.real-backend.config.ts`：

- 先创建隔离 data/cache/logs 目录
- 启动 uvicorn backend
- 启动 Vite frontend
- 打开真实 App
- mock AI provider 或使用 fake backend route
- 验证：
  - 首屏不崩
  - `/desktop/health` 通过
  - `/site-profiles/summary` 返回
  - 新增两个站点 A/B 后切换不会串
  - 生成请求 body 带 active site ID

---

## P1-1：AI 生成没有形成“站点上下文溯源闭环”

### 现象

类型和服务层已经具备能力：

- `SEOData` 支持 `keywordUsage`、`generationContext`
- `generateSEO()` 支持 `siteId`、`keywordCategory`、`keywordCandidates`
- `GenerationContextSummary` 也已经定义了 `sourceArtifacts`、`appliedRules`、`appliedTemplates`、`warnings`

但在图片 SEO 生成时，前端调用大致是：

```ts
const generated = await generateSEO(
  resolvedAi.apiKey,
  imageBlob,
  keywordSeed,
  extraDesc,
  imageKeywordContext,
  useSkills ? activeKnowledgeContext : undefined,
)
```

这里没有传：

- `siteId`
- `keywordCategory`
- `keywordCandidates`
- 当前 site profile revision/version
- source artifact IDs

而且之后 `normalizeSeoData()` 只保留：

- filename
- title
- alt
- caption
- description

会把后端可能返回的 `keywordUsage` / `generationContext` 丢掉。

### 影响

用户最关心的这个问题会很难 debug：

> 我丢给 AI 去生成关键词，出来不是我想要的，是不是没有根据我的公司资料库生成？

当前 UI 可能只能看到结果，不知道：

- 用的是哪个站点
- 用的是哪个关键词库
- 用了哪些 reviewed artifacts
- 用了哪些 FAQ
- 用了哪些 rule pack/template pack
- 哪些资料被跳过
- 是否因为资料为空而 fallback 成通用内容

### 解决建议

统一所有 AI 生成请求的上下文结构：

```ts
type GenerationRequestContext = {
  siteId: string;
  siteRevision: string;
  feature: 'image-seo' | 'blog' | 'page-planner' | 'product-seo' | 'seo-audit';
  keywordCategory?: string;
  coreKeyword?: string;
  sourceArtifactIds?: string[];
  keywordContextHash?: string;
};
```

图片 SEO 调用改成：

```ts
const generated = await generateSEO(
  resolvedAi.apiKey,
  imageToRegenerate.processedBlob,
  keywordSeed,
  imageToRegenerate.extraDesc,
  imageKeywordContext,
  useSkills ? activeKnowledgeContext : undefined,
  {
    siteId: activeSiteId,
    keywordCategory: selectedCategory,
    keywordCandidates: selectedKeywordCandidates,
  },
);
```

保存时必须保留溯源：

```ts
const normalizeSeoData = (seo: SEOData | undefined, fallback: SEOData): SEOData => ({
  filename: seo?.filename?.trim() || fallback.filename,
  title: seo?.title?.trim() || fallback.title,
  alt: seo?.alt?.trim() || fallback.alt,
  caption: seo?.caption?.trim() || fallback.caption,
  description: seo?.description?.trim() || fallback.description,
  keywordUsage: seo?.keywordUsage || fallback.keywordUsage,
  generationContext: seo?.generationContext || fallback.generationContext,
});
```

UI 上加一个固定组件：

```tsx
<GenerationContextSummary summary={image.seoData?.generationContext} />
```

如果没有 active site context，生成按钮旁边应该显示：

> 当前没有可用的已审核资料库，本次生成可能是通用 SEO 文案。

---

## P1-2：active profile 可能是 summary-only，导致生成时 context 为空或不完整

### 现象

`refreshSiteProfiles()` 默认走 summary：

```ts
const summaryOnly = options.summaryOnly !== false;
const result = summaryOnly
  ? await fetchSiteProfileSummaries(backendUrl)
  : await fetchSiteProfiles(backendUrl);
```

进入某些工作台后才会拉完整 profile：

- skillFactory
- brandStarter
- blogWorkspace
- mediaWorkspace
- productSeo
- pagePlanner
- seoAudit

这个设计对性能是好的，但交互上有一个风险：用户快速切到工作台、点击生成时，active profile 可能还没加载完整资料库。

### 影响

`buildActiveSiteKnowledgeContext()` 只会使用：

- reviewed knowledge artifacts
- approved/reviewed/published FAQ
- rule pack
- template pack

如果完整 profile 还没回来，`activeKnowledgeContext` 就可能是空的，AI 就会按泛化信息生成。

### 解决建议

加一个明确状态：

```ts
const activeSiteContextState = {
  siteId: activeSiteId,
  loaded: siteProfilesDetailedRef.current,
  artifactCount: activeSiteProfile?.knowledgeArtifacts?.length || 0,
  reviewedArtifactCount: activeSiteProfile?.knowledgeArtifacts?.filter(a => a.status === 'reviewed').length || 0,
};
```

所有 AI 生成按钮逻辑：

- 没有站点：禁用
- 完整 profile 未加载：显示 loading，不允许生成
- 没有 reviewed artifact：允许生成但强提示“没有审核资料，会偏通用”
- 有 reviewed artifact：显示绿色“已加载当前站点资料库”

---

## P1-3：多站点设置保存不是原子操作

### 现象

`saveCurrentSite()` 先调用：

```ts
const savedSettings = await onSave(nextSettings);
```

然后再调用：

```ts
await onSaveSite(activeSiteId, {
  siteName,
  siteUrl,
  brandName,
  settings: savedSettings,
});
```

而 `saveSettings()` 是写全局 `/settings`。

### 风险

如果第一步成功、第二步失败，可能出现：

- 全局 settings 已经是 B 站配置
- activeSiteProfile 仍然是 A 站配置
- UI 显示和 backend 实际使用不一致
- 随后 WordPress 上传/产品扫描/AI 生成可能用错站点配置

### 解决建议

不要让前端自己拼两步事务，改成后端单接口：

```http
PUT /site-profiles/{siteId}/settings
```

请求体：

```json
{
  "siteName": "AOLQ",
  "siteUrl": "https://szaolq.com",
  "brandName": "AOLQ",
  "settings": { ... },
  "expectedRevision": "..."
}
```

后端应保证：

- settings、profile、secretRefs 同步保存
- active site revision 增加
- 返回新的 active site + sanitized settings
- 如果保存失败，整体回滚

---

## P1-4：切换站点后，旧草稿/旧图片 SEO 可能被误同步到新站点

### 现象

切换站点时，代码会清理：

- selectedCategory
- selectedCategoryKeywordContext
- blogState.keywordContext / keywordFileName

这是对的。但图片列表、博客正文、生成结果、产品草稿等 UI 草稿可能仍保留在当前页面中。

### 风险场景

1. 用户在 A 站生成图片 SEO。
2. 切换到 B 站。
3. 旧图片仍在工作台里。
4. 用户点击上传到 WordPress。
5. 如果上传前没有校验 draft site ID，就可能把 A 站文案同步到 B 站。

### 解决建议

每个可同步对象都必须带 site scope：

```ts
type ScopedDraft = {
  siteId: string;
  siteRevision: string;
  createdAt: string;
  sourceFeature: string;
};
```

包括：

- 图片 SEO 草稿
- 博客正文/SEO meta
- 页面计划
- 产品 SEO 草稿
- SEO Audit 修复草稿
- 媒体运维任务

同步前强校验：

```ts
if (draft.siteId !== activeSiteId) {
  showAppAlert('这个草稿属于另一个站点，请切回原站点或重新生成。');
  return;
}
```

UI 上每个草稿显示：

> 来源站点：AOLQ / szaolq.com  
> 当前站点：WE Dispenser / xxx.com

---

## P1-5：Command Center 和多站点大数据性能需要设计预算

### 现状

项目已经有 summary endpoint 思路，这是好事。问题是 Full SiteProfile 模型本身非常大，里面包含：

- knowledgeSources
- knowledgeArtifacts
- generationSessions
- skillPacks
- faqs
- internalLinkSettings
- linkIndex
- linkIndexItems
- styleKit
- blog format / framework

当一个公司有多个网站，每个网站还有：

- 数千 WooCommerce 产品
- 数万媒体图片
- 大量博客和页面
- 大量 SEO audit issue
- 生成历史
- 内链候选池

Command Center 如果一次性聚合全部，会变慢。

### 建议性能目标

建议先定明确指标：

| 场景 | 目标 |
|---|---|
| 冷启动首屏 | 2 秒内出现可交互框架 |
| Command Center summary | 1 秒内返回 summary payload |
| 切换站点 | 1.5 秒内显示站点 summary，详情后台刷新 |
| 产品表格 | 只加载当前页，默认 50 条 |
| 媒体库 | 只加载当前页，支持 cursor/pagination |
| Full profile payload | 不超过 300KB，超出拆接口 |
| 单个表格 DOM row | 不超过可见区域 + buffer，使用 virtualization |

### 建议接口拆分

```http
GET /site-profiles/summary
GET /site-profiles/{id}/summary
GET /site-profiles/{id}/knowledge/summary
GET /site-profiles/{id}/knowledge/artifacts?status=reviewed&page=1&pageSize=50
GET /site-profiles/{id}/link-index?query=&page=1&pageSize=50
GET /products?siteId=&page=1&pageSize=50&issue=
GET /media?siteId=&cursor=&limit=50
GET /command-center/summary?siteId=
```

### 前端策略

- Command Center 只吃 summary，不吃 full profile。
- 表格全部分页或虚拟滚动。
- 大型详情面板按需展开再请求。
- 缓存必须按 `siteId` 命名。
- 切站时取消旧站点请求或忽略旧 response。

建议所有 fetch 都带 request scope：

```ts
const requestSiteId = activeSiteId;
const data = await fetchSomething(requestSiteId);
if (requestSiteId !== activeSiteIdRef.current) return;
setData(data);
```

---

## P2-1：网络状态检查不应固定使用 API_BASE

### 现象

`refreshSystemNetworkStatusNow()` 使用：

```ts
fetchSystemNetworkStatus(API_BASE, browserOnline, ...)
```

桌面端里 settingsService 会把 backendUrl 标准化成 `/api`，所以问题不大。但如果后续支持浏览器/server 模式、自定义 backend URL 或远程部署，这里可能检查错地址。

### 建议

统一用 resolved backend：

```ts
const backendUrl = settings.backendUrl || API_BASE;
const status = await fetchSystemNetworkStatus(backendUrl, browserOnline, ...);
```

如果是 desktop runtime，再由 settings service 或 preload 统一锁成 `/api`。

---

## P2-2：用户需要一个“AI 不符合预期”的诊断面板

你最担心的问题不是单纯 bug，而是 AI 产品必须能回答：

> 为什么生成结果不是我要的？它用了什么资料？是不是没用公司资料库？

建议加一个生成结果诊断面板：

### 每次生成保存以下信息

```json
{
  "siteId": "site-a",
  "siteName": "AOLQ",
  "feature": "blog-outline",
  "coreKeyword": "commercial soap dispenser",
  "keywordCategory": "soap-dispenser",
  "sourceArtifacts": [
    { "id": "artifact-1", "kind": "company", "title": "AOLQ Company Profile" },
    { "id": "artifact-2", "kind": "keyword", "title": "Soap Dispenser Keyword Library" }
  ],
  "appliedRules": ["do not invent certifications", "B2B procurement tone"],
  "appliedTemplates": ["productFullDescription"],
  "warnings": []
}
```

### UI 显示

在每个 AI 结果下方加：

- 当前站点
- 使用关键词库
- 使用资料数量
- 使用模板
- 风险警告
- “资料不足”的明确提示

### 结果不满意时的 Debug 按钮

加一个按钮：

> 诊断为什么生成不符合预期

它可以检查：

- activeSiteId 是否为空
- full profile 是否加载
- reviewed artifacts 是否为 0
- keywordContext 是否为空
- 是否使用 fallback SEO
- generationContext 是否缺失
- prompt 里是否有 companyContext
- 当前生成草稿 siteId 是否等于 activeSiteId

---

## 5. 建议新增的自动化测试

### 5.1 Backend smoke tests

必须覆盖：

- `backend.main.app` 可导入
- `/desktop/health`
- `/settings`
- `/site-profiles/summary`
- `/site-profiles`
- `/ai/blog` mock mode
- `/ai/image-seo` mock mode

### 5.2 多站点隔离 E2E

测试步骤：

1. 创建 Site A：`https://a.example.com`，资料库包含 `A-ONLY-TERM`。
2. 创建 Site B：`https://b.example.com`，资料库包含 `B-ONLY-TERM`。
3. 切到 Site A，生成博客/图片/产品 SEO。
4. 断言请求 body 或结果 context 包含 Site A，不包含 Site B。
5. 切到 Site B。
6. 断言旧草稿不可直接同步到 Site B。
7. 切回 Site A，旧草稿可以继续同步。

### 5.3 AI context contract tests

每个 AI endpoint 都应该返回：

```json
{
  "generationContext": {
    "coreKeyword": "...",
    "keywordCategory": "...",
    "sourceArtifacts": [],
    "appliedRules": [],
    "appliedTemplates": [],
    "warnings": []
  }
}
```

如果资料库为空，必须返回 warning：

```json
{
  "warnings": ["No reviewed knowledge artifacts were available for this site."]
}
```

前端必须展示这个 warning。

### 5.4 Command Center performance tests

生成 synthetic data：

- 3 个站点
- 每个站点 2,000 产品
- 每个站点 20,000 media
- 每个站点 1,000 posts/pages
- 每个站点 20,000 link index items
- 每个站点 500 generation sessions

测试：

- Command Center 首屏 payload size
- 首屏 render time
- 切站响应时间
- 表格滚动 FPS
- memory usage

### 5.5 设置保存事务测试

模拟：

1. `/settings` 保存成功。
2. `/site-profiles/{id}` 保存失败。
3. 验证 UI/后端不会留下错乱配置。

更好的设计是根本不要有两步保存。

---

## 6. 建议修复顺序

### 第 1 阶段：先修 P0，保证 app 能跑

1. 恢复 `backend/main.py`。
2. 加 backend smoke test。
3. CI 中真实启动 backend。
4. Playwright 增加 real-backend suite。

### 第 2 阶段：修 AI 上下文闭环

1. 所有 AI 请求统一传 `siteId`。
2. 所有 AI 结果统一返回 `generationContext`。
3. 前端保存和展示 `generationContext`。
4. 没有 reviewed context 时强提示。
5. 图片 SEO、博客 SEO、页面计划、产品 SEO 用同一套 context contract。

### 第 3 阶段：修多站点隔离

1. settings 保存改为站点原子接口。
2. 所有草稿带 `siteId/siteRevision`。
3. 同步前检查 siteId。
4. 切站时取消旧请求、忽略旧 response。
5. 清理或隔离旧站点 UI 草稿。

### 第 4 阶段：修性能

1. Command Center 只走 summary。
2. 大列表全部分页/虚拟滚动。
3. link index、media、product、audit issues 拆接口。
4. 加 payload budget。
5. 加 synthetic data 压测。

---

## 7. 最终验收清单

### 后端

- [ ] `python -c "from backend.main import app; print(app)"` 通过。
- [ ] `/desktop/health` 通过。
- [ ] `/settings` 通过。
- [ ] `/site-profiles/summary` 通过。
- [ ] Docker backend 能启动。
- [ ] 桌面端 packaged backend 能启动。

### AI

- [ ] 图片 SEO 请求包含 active `siteId`。
- [ ] 博客生成请求包含 active `siteId` 或明确 context snapshot。
- [ ] 页面计划请求包含 active `siteId`。
- [ ] 产品 SEO 请求包含 active `siteId`。
- [ ] 所有 AI 结果展示资料来源。
- [ ] 无资料库时 UI 给出明确 warning。

### 多站点

- [ ] A/B 两个站点切换后 settings 不串。
- [ ] A/B 两个站点知识库不串。
- [ ] A 站草稿不能同步到 B 站。
- [ ] 删除站点后缓存、任务、localStorage 都清理。
- [ ] 切站时未完成请求不会覆盖新站点 UI。

### 性能

- [ ] Command Center 不拉 full profile。
- [ ] 产品/媒体/内链/audit 表格分页或虚拟滚动。
- [ ] Summary payload size 有预算。
- [ ] 3 站点大数据压测通过。

---

## 8. 总体判断

这个项目的方向是对的：它已经不只是一个 WordPress 图片压缩工具，而是在变成“站点资料库 + AI SEO 生成 + WordPress/WooCommerce 同步 + 多站点管理 + 中控台”的产品。

现在最关键的不是继续加功能，而是先把下面三件事做成平台级能力：

1. **真实后端可启动，并被 CI 持续验证。**
2. **每一次 AI 生成都能证明用了哪个站点、哪个资料库、哪些规则。**
3. **所有配置、草稿、缓存、任务都严格绑定 siteId，避免多网站串数据。**

这三件事做好之后，再继续加 Google Ads、GSC、SEO Audit 自动修复、页面批量生成、产品详情页批量优化，才不会越做越乱。