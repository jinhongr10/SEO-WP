# 每日 SEO 生成队列实施计划

> **给执行 Agent 的要求：** 实施本计划时必须使用 `superpowers:subagent-driven-development`（推荐）或 `superpowers:executing-plans`，按任务逐项执行。步骤使用 checkbox（`- [ ]`）语法，方便跟踪进度。

**目标：** 做一个“每日 SEO 生成队列”：你当天先人工选择要处理的图片、文章、产品，系统到设定时间自动生成草稿，并显示进度；最终同步到 WordPress 仍然由你人工审核后手动执行。

**架构：** 保留现有图片 SEO、文章 SEO、产品 SEO 页面，不重做原来的功能。新增一个统一队列和运行进度层：各页面负责“加入今日任务”，中控台负责查看队列、设置时间、立即运行、显示进度。产品 `description` 任务必须先处理详情页切片：压缩图片、生成图片 SEO、上传 WordPress，再用优化后的图片 URL 和 alt text 生成产品详情 HTML。

**技术栈：** FastAPI 后端（`backend/main.py`）、React 前端、SQLite 状态库、现有 Node 图片压缩模块（`src/optimize.ts`）、现有媒体/产品/文章 SEO 生成逻辑、Gemini AI。

---

## 一、产品决策

这个功能不替换现有页面。现有页面继续作为你检查和选择任务的地方：

- `components/MediaOpsDashboard.tsx`：选择图片 SEO 任务。
- `components/BlogAIGeneratorDashboard.tsx` 及文章格式化页面：选择文章 SEO 任务。
- `components/ProductSeoDashboard.tsx`：选择产品 SEO 任务、选择产品详情页切片。
- `components/CommandCenterDashboard.tsx`：显示每日队列、定时设置、运行进度和失败项。

第一版行为：

- 只生成草稿。
- 不自动发布、不自动同步、不自动覆盖 WordPress 内容。
- 加入队列的任务默认只跑一次，完成后变成 `completed`，失败后变成 `failed`。
- 失败项可以重试。
- 你在现有审核/编辑区域人工检查生成结果，再手动同步到 WordPress。
- 必须支持快速搜索“SEO 空缺问题”，因为这个功能的主要目的不是随便生成内容，而是快速找到缺 title、缺 alt、缺 meta、缺 short description、缺 description 的项目，然后批量加入今日队列。

---

## 二、SEO 空缺快速搜索

这个功能要解决你每天最常见的问题：**哪里缺 SEO，怎么最快找到，怎么一键加入今日生成队列。**

现有代码已经有基础：

- 产品已有 `issue_flags`，例如 `short_description_empty`、`full_description_empty`、`aioseo_title_is_default_or_empty`、`aioseo_description_is_default_or_empty`。
- 图片已有 `issue_flags`，例如 `title_missing`、`alt_text_missing`、`caption_missing`、`description_missing`。
- 中控台已有 SEO Health 汇总。
- 产品列表已有关键词搜索、分类筛选、问题筛选。

第一版新增一个统一的“SEO 空缺搜索”能力：

```text
SEO 空缺搜索
搜索框：输入产品名 / 文章名 / 图片文件名 / ID / 关键词
类型：全部 / 图片 / 文章 / 产品
问题：全部 / 缺标题 / 缺描述 / 缺 alt / 缺 caption / 缺 short description / 缺 AIOSEO
状态：未处理 / 已加入今日队列 / 已生成待审核 / 失败
操作：加入今日生成队列
```

建议放两个入口：

1. 中控台放一个全局“SEO 空缺搜索”板块，用来跨图片、文章、产品快速查。
2. 原来的图片/文章/产品页面继续保留本页面筛选，用来做更细的检查。

后端可以先不建新索引表，第一版直接从现有表和 issue flags 聚合：

- 产品：从 `product_items` 聚合。
- 图片：从 `media_items` + `generated_seo` 聚合。
- 文章：从 WordPress posts / blog drafts / blog format data 聚合。

新增接口：

```text
GET /seo-gaps/search
```

查询参数：

```text
q=
type=all|media|blog|product
issue=
status=
limit=
offset=
```

返回示例：

```json
{
  "items": [
    {
      "type": "product",
      "targetId": "1811",
      "targetLabel": "Demo Brand Product Sample",
      "missingFields": ["short_description", "aioseo_description"],
      "issueLabels": ["Short Description 为空", "AIOSEO Description 为空"],
      "status": "not_queued",
      "suggestedFields": ["short_description", "aioseo_description"]
    }
  ],
  "total": 1
}
```

如果搜索变慢，第二版再增加缓存表或 SQLite 索引。第一版先用现有数据聚合，避免做过重。

---

## 三、数据模型

使用现有 `DB_PATH` 指向的 SQLite 数据库。

新增三张表。

### 1. `daily_seo_tasks`

保存你当天加入队列的任务。

字段：

- `id INTEGER PRIMARY KEY AUTOINCREMENT`
- `task_type TEXT NOT NULL`：`media`、`blog`、`product`
- `target_id TEXT NOT NULL`：WordPress 媒体 ID、文章 ID、产品 ID 或本地草稿 ID
- `target_label TEXT NOT NULL`
- `fields_json TEXT NOT NULL DEFAULT '[]'`
- `payload_json TEXT NOT NULL DEFAULT '{}'`
- `status TEXT NOT NULL DEFAULT 'queued'`：`queued`、`running`、`completed`、`failed`、`cancelled`
- `priority INTEGER NOT NULL DEFAULT 100`
- `scheduled_for TEXT NOT NULL DEFAULT ''`
- `created_at TEXT NOT NULL DEFAULT datetime('now')`
- `updated_at TEXT NOT NULL DEFAULT datetime('now')`
- `completed_at TEXT NOT NULL DEFAULT ''`
- `error TEXT NOT NULL DEFAULT ''`

### 2. `daily_seo_runs`

保存一次实际执行记录和进度。

字段：

- `run_id TEXT PRIMARY KEY`
- `status TEXT NOT NULL`：`queued`、`running`、`completed`、`partial`、`failed`
- `total INTEGER NOT NULL DEFAULT 0`
- `completed INTEGER NOT NULL DEFAULT 0`
- `failed INTEGER NOT NULL DEFAULT 0`
- `current_task_id INTEGER`
- `current_label TEXT NOT NULL DEFAULT ''`
- `started_at TEXT NOT NULL DEFAULT datetime('now')`
- `finished_at TEXT NOT NULL DEFAULT ''`
- `error TEXT NOT NULL DEFAULT ''`

### 3. `product_detail_slice_assets`

保存产品详情页切片图片、产品规格图、short description 参考图在压缩、写 SEO、上传前后的状态。

字段：

- `id INTEGER PRIMARY KEY AUTOINCREMENT`
- `product_id INTEGER NOT NULL`
- `source_path TEXT NOT NULL`
- `optimized_path TEXT NOT NULL DEFAULT ''`
- `wp_media_id INTEGER NOT NULL DEFAULT 0`
- `wp_url TEXT NOT NULL DEFAULT ''`
- `asset_role TEXT NOT NULL DEFAULT 'description_slice'`：`description_slice`、`short_description_reference`、`catalog_reference`
- `section_key TEXT NOT NULL DEFAULT ''`：`design_concept`、`materials_craftsmanship`、`installation_options`、`short_description_specs` 等
- `sort_order INTEGER NOT NULL DEFAULT 0`
- `title TEXT NOT NULL DEFAULT ''`
- `alt_text TEXT NOT NULL DEFAULT ''`
- `caption TEXT NOT NULL DEFAULT ''`
- `description TEXT NOT NULL DEFAULT ''`
- `bytes_original INTEGER`
- `bytes_optimized INTEGER`
- `status TEXT NOT NULL DEFAULT 'local'`：`local`、`optimized`、`seo_generated`、`uploaded`、`failed`
- `error TEXT NOT NULL DEFAULT ''`
- `created_at TEXT NOT NULL DEFAULT datetime('now')`
- `updated_at TEXT NOT NULL DEFAULT datetime('now')`

---

## 四、API 设计

在 `backend/main.py` 注册路由，但主要逻辑拆到新模块里。

### SEO 空缺搜索接口

- `GET /seo-gaps/search`

示例：

```text
GET /seo-gaps/search?type=product&issue=short_description_empty&q=sample&limit=50
```

用途：

- 快速找到空缺 SEO 项。
- 批量选择后加入今日生成队列。
- 支持跨类型搜索，也支持只看产品/图片/文章。

### 队列接口

- `GET /daily-seo/tasks?status=queued&type=product`
- `POST /daily-seo/tasks`
- `PATCH /daily-seo/tasks/{task_id}`
- `DELETE /daily-seo/tasks/{task_id}`
- `POST /daily-seo/tasks/batch`

产品任务示例：

```json
{
  "taskType": "product",
  "targetId": "1811",
      "targetLabel": "Demo Brand Product Sample",
      "fields": ["description", "aioseo_title", "aioseo_description"],
      "payload": {
        "keyword": "product sample",
        "useDetailSlices": true,
        "useShortDescriptionImages": true,
        "shortDescriptionImageAssetIds": [8, 9],
        "sliceAssetIds": [1, 2, 3, 4],
        "language": "en"
      }
}
```

图片任务示例：

```json
{
  "taskType": "media",
  "targetId": "9201",
  "targetLabel": "enterprise-product-sample.jpg",
  "fields": ["title", "alt_text", "caption", "description"],
  "payload": {
    "keyword": "enterprise product sample"
  }
}
```

文章任务示例：

```json
{
  "taskType": "blog",
  "targetId": "7765",
  "targetLabel": "enterprise Product Sample Buying Guide",
  "fields": ["seo_title", "seo_description", "tags", "faq", "internal_links"],
  "payload": {
    "keyword": "enterprise product sample",
    "repairProfile": "buying_guide"
  }
}
```

### 运行接口

- `POST /daily-seo/runs`
- `GET /daily-seo/runs/current`
- `GET /daily-seo/runs/{run_id}`
- `POST /daily-seo/runs/{run_id}/retry-failed`

当前进度返回示例：

```json
{
  "runId": "f4b1...",
  "status": "running",
  "total": 80,
  "completed": 23,
  "failed": 2,
  "percent": 29,
  "currentTaskId": 18,
  "currentLabel": "Product #1811 - compress detail slice 3/7",
  "groups": {
    "media": { "total": 20, "completed": 6, "failed": 0 },
    "blog": { "total": 12, "completed": 4, "failed": 1 },
    "product": { "total": 48, "completed": 13, "failed": 1 }
  }
}
```

### 产品详情页切片接口

- `GET /products/{product_id}/detail-slices`
- `POST /products/{product_id}/detail-slices`
- `PATCH /products/{product_id}/detail-slices/{asset_id}`
- `DELETE /products/{product_id}/detail-slices/{asset_id}`
- `POST /products/{product_id}/detail-slices/{asset_id}/generate-seo`

现有 `/products/{product_id}/ref-images` 保留。新的 detail-slices 接口用于保存明确的顺序、章节映射、压缩文件路径、图片 SEO 字段和上传结果。

---

## 五、执行流程

### 产品 `short_description` 任务

产品 short description 不是纯文字改写，也要解析你上传的图片内容。它通常生成 WooCommerce 默认短描述里的规格表，所以图片来源应该优先包含：规格图、尺寸图、包装参数图、产品主图、你上传的 short description 参考图。

执行顺序：

1. 读取 `product_items` 中的产品数据。
2. 读取 `asset_role = short_description_reference` 的图片，或 payload 里的 `shortDescriptionImageAssetIds`。
3. 对这些图片执行：
   - 压缩图片；
   - 生成图片 SEO：title、alt text、caption、description；
   - 如果图片需要上传到 WordPress 媒体库，则上传并保存 `wp_url`；如果只作为 AI 解析参考，也要保存压缩结果和 SEO 字段。
4. 把图片、产品名称、分类、已有描述、关键词、图册文字一起给 AI。
5. AI 输出 WooCommerce `short_description` HTML 规格表。
6. 保存到 `product_items.short_description`。
7. 不自动同步到 WordPress。

重点：`short_description` 生成必须能读图，不能只根据已有文字生成。

### 产品 `description` 任务

产品详情描述必须按以下顺序执行：

1. 读取 `product_items` 中的产品数据。
2. 读取已选择的 `asset_role = description_slice` 的 `product_detail_slice_assets`。
3. 对每张切片执行：
   - 压缩图片；
   - 生成图片 SEO：title、alt text、caption、description；
   - 上传优化后的图片到 WordPress 媒体库；
   - 保存 `wp_url`、`wp_media_id`、图片 SEO 字段和压缩节省量。
4. 按你设置的切片顺序生成 `html_images`。
5. 调用现有 `_generate_single_product_field_value(..., field="description", html_images=...)`。
6. 保存生成的 HTML 到 `product_items.description`。
7. 保存生成的 alt text map 到 `product_items.description_alt_texts`。
8. 不自动同步产品到 WordPress。

### 产品其他字段任务

`acf_seo_extra_info`、`aioseo_title`、`aioseo_description`、`tag_names` 继续调用现有 `_generate_single_product_field_value`，生成后只保存到本地。

注意：`short_description` 不归入“其他字段”，它有单独的图片解析流程。

### 图片任务

复用现有图片优化和媒体 SEO 流程：

- 压缩图片；
- 按选择的字段生成 SEO；
- 保存生成草稿；
- 不自动应用到 WordPress。

### 文章任务

复用现有文章优化/生成逻辑：

- 生成 SEO title、meta description、tags、FAQ/schema、内链建议或格式修复结果；
- 保存为草稿或预览；
- 不自动发布到 WordPress。

---

## 六、文件规划

新增：

- `backend/daily_seo_queue.py`：队列表、CRUD、运行器、进度快照。
- `backend/product_detail_slices.py`：详情页切片 DB、压缩桥接、图片 SEO、WordPress 上传。
- `backend/seo_gap_search.py`：跨图片、文章、产品的 SEO 空缺搜索聚合。
- `services/dailySeoService.ts`：前端队列和进度 API。
- `services/seoGapSearchService.ts`：前端 SEO 空缺搜索 API。
- `components/DailySeoQueuePanel.tsx`：中控台每日队列、定时、运行、进度和失败项面板。
- `components/SeoGapSearchPanel.tsx`：中控台 SEO 空缺搜索和批量加入队列面板。
- `src/tests/daily-seo-service.test.ts`：前端服务测试。
- `backend/tests/test_daily_seo_queue.py`：后端队列和进度测试。
- `backend/tests/test_product_detail_slices.py`：后端切片流程测试。
- `backend/tests/test_seo_gap_search.py`：SEO 空缺搜索测试。

修改：

- `backend/main.py`：注册新路由，接入新模块。
- `components/CommandCenterDashboard.tsx`：渲染 `SeoGapSearchPanel` 和 `DailySeoQueuePanel`。
- `components/ProductSeoDashboard.tsx`：增加“加入今日生成队列”和详情切片顺序/章节配置。
- `components/MediaOpsDashboard.tsx`：给选中图片增加“加入今日生成队列”。
- 文章相关 Dashboard：给文章任务增加“加入今日生成队列”。
- `package.json`：如果需要，新增本地图片压缩命令。

---

## Task 1：队列表和基础 CRUD

**文件：**

- 新增：`backend/daily_seo_queue.py`
- 修改：`backend/main.py`
- 测试：`backend/tests/test_daily_seo_queue.py`

- [ ] 新增建表方法。

```python
def ensure_daily_seo_tables(conn):
    conn.execute("""
        CREATE TABLE IF NOT EXISTS daily_seo_tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_type TEXT NOT NULL,
            target_id TEXT NOT NULL,
            target_label TEXT NOT NULL,
            fields_json TEXT NOT NULL DEFAULT '[]',
            payload_json TEXT NOT NULL DEFAULT '{}',
            status TEXT NOT NULL DEFAULT 'queued',
            priority INTEGER NOT NULL DEFAULT 100,
            scheduled_for TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            completed_at TEXT NOT NULL DEFAULT '',
            error TEXT NOT NULL DEFAULT ''
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS daily_seo_runs (
            run_id TEXT PRIMARY KEY,
            status TEXT NOT NULL,
            total INTEGER NOT NULL DEFAULT 0,
            completed INTEGER NOT NULL DEFAULT 0,
            failed INTEGER NOT NULL DEFAULT 0,
            current_task_id INTEGER,
            current_label TEXT NOT NULL DEFAULT '',
            started_at TEXT NOT NULL DEFAULT (datetime('now')),
            finished_at TEXT NOT NULL DEFAULT '',
            error TEXT NOT NULL DEFAULT ''
        )
    """)
```

- [ ] 新增校验常量。

```python
TASK_TYPES = {"media", "blog", "product"}
TASK_STATUSES = {"queued", "running", "completed", "failed", "cancelled"}
```

- [ ] 增加创建、列表、更新队列项的测试。

运行：

```bash
python -m pytest backend/tests/test_daily_seo_queue.py -q
```

预期：实现完成后测试通过。

---

## Task 1.5：SEO 空缺快速搜索

**文件：**

- 新增：`backend/seo_gap_search.py`
- 修改：`backend/main.py`
- 新增：`services/seoGapSearchService.ts`
- 新增：`components/SeoGapSearchPanel.tsx`
- 测试：`backend/tests/test_seo_gap_search.py`

- [ ] 新增 `GET /seo-gaps/search`。
- [ ] 聚合产品空缺：

```text
short_description_empty
full_description_empty
acf_seo_extra_info_empty
aioseo_title_is_default_or_empty
aioseo_description_is_default_or_empty
generated_not_synced
```

- [ ] 聚合图片空缺：

```text
title_missing
alt_text_missing
caption_missing
description_missing
generated_not_synced
processing_error
```

- [ ] 聚合文章空缺：

```text
seo_title_missing
seo_description_missing
tags_missing
faq_missing
internal_links_missing
format_needs_repair
```

- [ ] 支持 `q` 模糊搜索。产品搜索匹配产品 ID、名称、slug、分类、tags；图片搜索匹配 ID、filename、alt、caption；文章搜索匹配 ID、标题、slug。
- [ ] 返回 `suggestedFields`，用于前端一键加入今日队列。
- [ ] 在中控台新增 `SeoGapSearchPanel`：

```text
搜索框
类型筛选
问题筛选
状态筛选
结果列表
批量加入今日生成队列
```

- [ ] 速度要求：默认最多返回 50 条，支持分页；空搜索默认按问题严重程度和更新时间排序。

---

## Task 2：产品详情页切片资产模型

**文件：**

- 新增：`backend/product_detail_slices.py`
- 修改：`backend/main.py`
- 测试：`backend/tests/test_product_detail_slices.py`

- [ ] 新增 `product_detail_slice_assets` 表。
- [ ] 新增切片创建、列表、更新、删除方法。
- [ ] 新增接口：列表、排序、指定章节、删除切片。
- [ ] 文件继续放在 `data/product_ref_images/{product_id}` 或 `state/product_ref_images/{product_id}`，具体取决于 `DB_PATH`。
- [ ] 保存明确的 `asset_role`、`sort_order` 和 `section_key`，保证 short description 参考图、description 切片、catalog 参考图不会混在一起。

支持的章节 key：

```python
PRODUCT_DESCRIPTION_SECTION_KEYS = [
    "short_description_specs",
    "design_concept",
    "materials_craftsmanship",
    "functionality_user_experience",
    "installation_options",
    "applications",
    "technical_specifications",
    "about_manufacturer",
]
```

---

## Task 3：切片压缩和图片 SEO

**文件：**

- 修改：`backend/product_detail_slices.py`
- 修改：`backend/main.py`
- 测试：`backend/tests/test_product_detail_slices.py`

- [ ] 新增压缩 helper。

优先方案：新增一个很小的 Node CLI 命令，复用现有 `src/optimize.ts`，因为项目已经使用 `sharp`。

命令形式：

```bash
node --import tsx src/cli.ts optimize-local-image --input /path/a.png --output /path/a.webp --quality 82
```

如果 CLI 改动过大，再考虑 Python fallback；但不要为了这个功能额外引入新的图片库，除非必须。

- [ ] 新增切片/参考图图片 SEO 生成。

生成字段：

- title
- alt_text
- caption
- description

Prompt 输入：

- 产品名称
- 对应章节 key
- asset role：short description 参考图、description 切片、catalog 参考图
- 关键词
- 图片本身
- 产品分类/标题

- [ ] 保存图片 SEO 到 `product_detail_slice_assets`。
- [ ] 测试压缩字节数和 SEO 字段是否被保存。

---

## Task 4：上传优化后的切片到 WordPress

**文件：**

- 修改：`backend/product_detail_slices.py`
- 修改：`backend/main.py`
- 测试：`backend/tests/test_product_detail_slices.py`

- [ ] 新增上传 helper，上传优化后的文件到 `/wp-json/wp/v2/media`。
- [ ] 上传后写入媒体 SEO：

```python
{
    "title": asset["title"],
    "alt_text": asset["alt_text"],
    "caption": asset["caption"],
    "description": asset["description"],
}
```

- [ ] 保存 `wp_media_id` 和 `wp_url`。
- [ ] 复用 `backend/main.py` 里已有的 WordPress 凭证读取逻辑。
- [ ] 上传失败时，切片标记为 `failed`，产品任务也标记失败，并记录清楚错误。

---

## Task 5：产品队列运行器

**文件：**

- 修改：`backend/daily_seo_queue.py`
- 修改：`backend/main.py`
- 测试：`backend/tests/test_daily_seo_queue.py`

- [ ] 实现产品任务执行。

伪代码：

```python
def run_product_task(task, progress):
    product_id = int(task["target_id"])
    fields = json.loads(task["fields_json"])
    payload = json.loads(task["payload_json"])

    if "short_description" in fields and payload.get("useShortDescriptionImages"):
        progress(f"Product #{product_id} - parse short description images")
        short_assets = process_detail_slices(
            product_id,
            payload.get("shortDescriptionImageAssetIds", []),
            payload,
            asset_role="short_description_reference",
        )
        generate_and_save_product_field(
            product_id,
            "short_description",
            payload,
            reference_assets=short_assets,
        )

    if "description" in fields and payload.get("useDetailSlices"):
        progress(f"Product #{product_id} - optimize detail slices")
        optimized_assets = process_detail_slices(
            product_id,
            payload.get("sliceAssetIds", []),
            payload,
            asset_role="description_slice",
        )
        html_images = [asset["wp_url"] for asset in optimized_assets if asset["wp_url"]]
    else:
        html_images = None

    for field in fields:
        if field == "short_description":
            continue
        progress(f"Product #{product_id} - generate {field}")
        generate_and_save_product_field(product_id, field, payload, html_images)
```

- [ ] 使用现有 `_generate_single_product_field_value` 生成产品字段。
- [ ] 确认 `short_description` 调用时会把上传/选择的图片作为 `image_sources` 传给 AI；它应该解析图片中的规格、尺寸、容量、材质、安装方式，再输出 HTML 规格表。
- [ ] 只保存到 `product_items` 本地草稿。
- [ ] 不调用产品同步接口。

---

## Task 6：图片队列运行器

**文件：**

- 修改：`backend/daily_seo_queue.py`
- 修改：`backend/main.py`
- 测试：`backend/tests/test_daily_seo_queue.py`

- [ ] 实现图片任务执行。
- [ ] 尽量复用现有媒体 SEO 生成和草稿保存逻辑。
- [ ] 只生成选中的字段。
- [ ] 保存生成的 SEO 草稿。
- [ ] 不自动应用到 WordPress。

---

## Task 7：文章队列运行器

**文件：**

- 修改：`backend/daily_seo_queue.py`
- 修改：`backend/main.py`
- 测试：`backend/tests/test_daily_seo_queue.py`

- [ ] 实现文章任务执行。
- [ ] 复用现有文章优化函数。
- [ ] 支持选中字段：

```text
seo_title
seo_description
tags
faq
schema
internal_links
format_repair
```

- [ ] 结果保存为现有文章草稿/预览数据。
- [ ] 不自动发布到 WordPress。

---

## Task 8：创建运行任务和进度轮询

**文件：**

- 修改：`backend/daily_seo_queue.py`
- 修改：`backend/main.py`
- 测试：`backend/tests/test_daily_seo_queue.py`

- [ ] 新增 `POST /daily-seo/runs`，启动后台线程。
- [ ] 如果已有 `running` 状态任务，拒绝启动第二个。
- [ ] 每完成一个子步骤，更新 `daily_seo_runs.completed`、`failed`、`current_label`。
- [ ] 运行详情里返回 media/blog/product 分组进度。
- [ ] 前端每 1-2 秒轮询当前进度。

---

## Task 9：前端队列服务

**文件：**

- 新增：`services/dailySeoService.ts`
- 测试：`src/tests/daily-seo-service.test.ts`

- [ ] 新增 typed API wrapper：

```ts
export const listDailySeoTasks = async (filters?: { status?: string; type?: string }) => requestJson(...);
export const createDailySeoTask = async (payload: DailySeoTaskCreate) => postJson(...);
export const startDailySeoRun = async () => postJson(...);
export const fetchCurrentDailySeoRun = async () => requestJson(...);
```

- [ ] 测试 URL 拼接和 payload 映射。

运行：

```bash
npm test -- src/tests/daily-seo-service.test.ts
```

---

## Task 10：中控台进度面板

**文件：**

- 新增：`components/DailySeoQueuePanel.tsx`
- 修改：`components/CommandCenterDashboard.tsx`
- 测试：`src/tests/seo-health-dashboard.test.ts` 或新增组件测试

- [ ] 显示 SEO 空缺搜索入口和今日队列数量，按类型分组。
- [ ] 显示定时时间、立即运行按钮、启用/暂停开关。
- [ ] 显示进度条：

```text
总进度：23 / 80
图片：6 / 20
文章：4 / 12
产品：13 / 48
当前：产品 #1811 - 压缩详情页切片 3/7
```

- [ ] 显示失败项和重试按钮。

---

## Task 11：产品页面加入队列控件

**文件：**

- 修改：`components/ProductSeoDashboard.tsx`
- 测试：现有产品 Dashboard 测试或新增测试

- [ ] 在现有批量生成控件旁边增加“加入今日生成队列”。
- [ ] 如果选择了 `short_description`，提示它会解析上传/选择的 short description 参考图；没有图片时允许继续，但 UI 要提示“缺少规格图时可能只能根据现有文字生成”。
- [ ] 如果选择了 `description`，但没有选择详情页切片，提示：

```text
Description 会使用详情页切片生成。请先选择或上传切片，或关闭“使用切片生成详情页”。
```

- [ ] 增加切片 UI 字段：

```text
用途：Short Description 参考 / Description 切片 / 图册参考
顺序
对应章节
压缩状态
图片 SEO 状态
上传状态
```

- [ ] 任务 payload 必须包含选中字段、关键词、语言、`useShortDescriptionImages`、`shortDescriptionImageAssetIds`、`useDetailSlices`、`sliceAssetIds`。

---

## Task 12：图片和文章页面加入队列控件

**文件：**

- 修改：`components/MediaOpsDashboard.tsx`
- 修改：文章 Dashboard 组件
- 测试：相关前端测试

- [ ] 给选中的媒体图片增加“加入今日生成队列”。
- [ ] 给选中的文章任务增加“加入今日生成队列”。
- [ ] 保留现有“立即生成”按钮。
- [ ] 不移除现有审核/同步流程。

---

## Task 13：每日定时

**文件：**

- 修改：`backend/daily_seo_queue.py`
- 修改：`backend/main.py`

- [ ] 增加本地定时设置：

```json
{
  "enabled": true,
  "time": "23:00",
  "timezone": "Asia/Shanghai"
}
```

- [ ] 第一版可以使用后端进程内 scheduler。
- [ ] UI 明确提示：

```text
定时任务需要后端服务保持运行；关闭服务后不会自动执行。
```

- [ ] 提供“立即运行一次”，方便你不用等到定时时间也能验证。

---

## 六、验证方式

后端测试：

```bash
python -m pytest backend/tests/test_daily_seo_queue.py backend/tests/test_product_detail_slices.py backend/tests/test_seo_gap_search.py -q
```

前端/单元测试：

```bash
npm test
```

构建：

```bash
npm run build
```

手动验证：

1. 选择一个产品。
2. 上传或选择 1-2 张 short description 规格/参数参考图。
3. 上传或选择 2-3 张 description 详情页切片。
4. 从 SEO 空缺搜索里找到缺 `short_description` 或缺 AIOSEO 的产品。
5. 把产品 `short_description`、`description`、`aioseo_title`、`aioseo_description` 加入今日队列。
6. 把一张图片加入今日队列。
7. 把一篇文章加入今日队列。
8. 点击“立即运行一次”。
9. 确认进度会经过：short description 图片解析、详情切片压缩、图片 SEO、上传、产品 description 生成、图片任务生成、文章任务生成。
10. 确认生成内容出现在现有审核/编辑区域。
11. 确认 WordPress 内容不会自动同步，必须等你点击现有同步/应用按钮。

---

## 七、推荐上线顺序

1. 队列表和运行进度。
2. SEO 空缺快速搜索。
3. 产品详情页切片/short description 参考图资产管理。
4. 产品队列运行器：short description 图片解析、切片压缩、图片 SEO、上传、description 生成。
5. 中控台搜索和进度面板。
6. 图片队列运行器。
7. 文章队列运行器。
8. 每日定时器。

这个顺序先解决“快速找到 SEO 空缺”，再解决产品 `short_description` 和 `description` 的图片解析生成，因为这两块最直接影响每天的处理效率和最终 SEO 内容质量。
