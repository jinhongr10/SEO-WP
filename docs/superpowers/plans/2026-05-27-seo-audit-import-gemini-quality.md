# SEO Audit Import and Gemini Quality Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a user-uploaded SEO audit workspace that imports per-page audit and keyword planning spreadsheets, creates repair tasks, and generates higher-quality Gemini suggestions with quality checks.

**Architecture:** Add a focused backend helper module for spreadsheet parsing, task normalization, prompt building, and quality scoring, then expose it through `/seo-audit/*` endpoints in `backend/main.py`. Add a React service and `SeoAuditDashboard` workspace, then wire a command-center entry and navigation tab while keeping WordPress changes manual-only.

**Tech Stack:** FastAPI, SQLite, Python CSV/XLSX parsing via `csv` and `openpyxl`, React 19, TypeScript, existing `services/apiClient.ts`, Node test runner, Python `unittest`.

---

## File Structure

- Create `backend/seo_audit.py`: pure helpers for parsing uploaded CSV/XLSX rows, detecting file type, classifying tasks, normalizing generated output, building Gemini prompts, and scoring quality.
- Modify `backend/main.py`: database table helpers and `/seo-audit/*` routes; delegate parsing and generation logic to `backend/seo_audit.py`.
- Create `backend/tests/test_seo_audit.py`: unit tests for file detection, task classification, database persistence, quality checks, and generation normalization.
- Create `services/seoAuditService.ts`: typed frontend API wrapper for preview, import, list batches/tasks, patch status, generate, and load generation history.
- Create `components/SeoAuditDashboard.tsx`: upload/preview UI, filters, task table, detail panel, generation actions, status actions.
- Modify `appTabs.ts`: add `seoAudit` view mode and tab label.
- Modify `App.tsx`: import/render `SeoAuditDashboard`, add mode icon, and route command-center navigation to the new workspace.
- Modify `components/CommandCenterDashboard.tsx`: add optional SEO audit summary card and action button.
- Create or modify `src/tests/seo-audit-service.test.ts`: service-level type and endpoint tests using mocked `fetch`.
- Modify `src/tests/app-tabs.test.ts`: update tab order and assert the SEO audit workspace renders.

The current workspace is not a Git repository, so this plan uses verification checkpoints instead of commit steps.

---

### Task 1: Backend SEO Audit Helper Module

**Files:**
- Create: `backend/seo_audit.py`
- Test: `backend/tests/test_seo_audit.py`

- [ ] **Step 1: Write failing helper tests**

Create `backend/tests/test_seo_audit.py` with these tests:

```python
import io
import unittest

from backend import seo_audit


class SeoAuditHelperTests(unittest.TestCase):
    def test_detects_per_page_audit_headers(self):
        rows = [
            {
                "URL": "https://example.com/product/a1-13/",
                "页面类型": "product_detail",
                "sitemap": "product",
                "优先级": "P0",
                "建议类别": "产品页扩写 / 补采购信息",
                "Meta建议": "Commercial portable lantern for enterprises.",
                "原始建议": "补齐规格参数、FAQ、内链、询盘 CTA。",
            }
        ]

        detected = seo_audit.detect_audit_file_type(["URL", "页面类型", "sitemap", "优先级", "建议类别", "Meta建议"])
        task = seo_audit.normalize_audit_row(rows[0], source_type=detected, source_file="audit.csv", row_number=2)

        self.assertEqual(detected, "per_page_audit")
        self.assertEqual(task["source_type"], "per_page_audit")
        self.assertEqual(task["task_type"], "product_expand")
        self.assertEqual(task["url"], "https://example.com/product/a1-13/")
        self.assertEqual(task["priority"], "P0")
        self.assertIn("规格参数", task["recommendation"])

    def test_detects_keyword_planning_headers(self):
        row = {
            "建议URL": "/product-sample/",
            "主关键词": "product sample",
            "相关词": "compact product sample; commercial workspace product sample",
            "页面类型": "集合页",
            "具体写法": "新建集合页，覆盖采购场景、型号对比、FAQ。",
            "优先级": "P0",
        }

        detected = seo_audit.detect_audit_file_type(["建议URL", "主关键词", "相关词", "页面类型", "具体写法", "优先级"])
        task = seo_audit.normalize_audit_row(row, source_type=detected, source_file="keywords.csv", row_number=2)

        self.assertEqual(detected, "keyword_plan")
        self.assertEqual(task["task_type"], "new_page_plan")
        self.assertEqual(task["suggested_url"], "/product-sample/")
        self.assertEqual(task["primary_keyword"], "product sample")
        self.assertIn("compact product sample", task["related_keywords"])

    def test_rejects_unrecognized_headers(self):
        with self.assertRaises(ValueError) as ctx:
            seo_audit.detect_audit_file_type(["Name", "Email", "Phone"])

        self.assertIn("Unrecognized SEO audit headers", str(ctx.exception))

    def test_task_type_precedence_prefers_specific_content_tasks(self):
        self.assertEqual(seo_audit.classify_task_type("per_page_audit", {"page_type": "product_detail", "sitemap": "product"}), "product_expand")
        self.assertEqual(seo_audit.classify_task_type("per_page_audit", {"page_type": "product_taxonomy", "sitemap": "product_cat"}), "category_collection")
        self.assertEqual(seo_audit.classify_task_type("per_page_audit", {"page_type": "trust_or_conversion_page", "sitemap": "page"}), "trust_page_enhance")
        self.assertEqual(seo_audit.classify_task_type("per_page_audit", {"page_type": "blog_or_taxonomy", "sitemap": "post"}), "blog_refresh")
        self.assertEqual(seo_audit.classify_task_type("per_page_audit", {"page_type": "product_taxonomy", "sitemap": "product_tag"}), "tag_cleanup")
        self.assertEqual(seo_audit.classify_task_type("keyword_plan", {"page_type": "集合页"}), "new_page_plan")

    def test_quality_check_scores_missing_required_sections(self):
        result = seo_audit.score_generated_output(
            task_type="category_collection",
            generated={
                "seoTitle": "A very long title " * 8,
                "metaDescription": "",
                "contentBlocks": [{"type": "intro", "heading": "Intro", "body": "Short copy"}],
                "faq": [],
                "internalLinks": [],
                "cta": "",
                "warnings": [],
            },
            link_candidates_available=True,
        )

        codes = {issue["code"] for issue in result["issues"]}
        self.assertLess(result["score"], 60)
        self.assertIn("seo_title_too_long", codes)
        self.assertIn("meta_missing", codes)
        self.assertIn("faq_missing", codes)
        self.assertIn("cta_missing", codes)
        self.assertIn("internal_links_missing", codes)
        self.assertIn("category_comparison_missing", codes)

    def test_parse_csv_upload_keeps_rows_and_file_type(self):
        csv_bytes = "URL,页面类型,sitemap,优先级,原始建议\nhttps://example.com/factory/,core_page,page,P0,补强工厂信任内容\n".encode("utf-8-sig")

        parsed = seo_audit.parse_uploaded_audit_file("audit.csv", csv_bytes)

        self.assertEqual(parsed["fileType"], "per_page_audit")
        self.assertEqual(parsed["recognizedRows"], 1)
        self.assertEqual(parsed["tasks"][0]["task_type"], "trust_page_enhance")


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run the helper tests and verify failure**

Run:

```bash
python3 -m unittest backend.tests.test_seo_audit -v
```

Expected: FAIL because `backend/seo_audit.py` does not exist.

- [ ] **Step 3: Implement `backend/seo_audit.py`**

Create `backend/seo_audit.py`:

```python
from __future__ import annotations

import csv
import io
import json
import re
from html import unescape
from typing import Any

try:
    import openpyxl
except Exception:  # pragma: no cover - dependency may be unavailable in minimal test env
    openpyxl = None


SUPPORTED_TASK_TYPES = {
    "product_expand",
    "category_collection",
    "trust_page_enhance",
    "new_page_plan",
    "blog_refresh",
    "tag_cleanup",
    "meta_fix",
}

GENERATION_TASK_TYPES = {
    "product_expand",
    "category_collection",
    "trust_page_enhance",
    "new_page_plan",
}

TASK_TYPE_LABELS = {
    "product_expand": "产品页扩写",
    "category_collection": "分类集合页改造",
    "trust_page_enhance": "信任页/转化页补强",
    "new_page_plan": "新页面规划",
    "blog_refresh": "Blog 翻新",
    "tag_cleanup": "标签页处理",
    "meta_fix": "Meta 修复",
}


def plain_text(value: Any) -> str:
    text = str(value or "")
    text = re.sub(r"<!--[\s\S]*?-->", " ", text)
    text = re.sub(r"<script\b[\s\S]*?</script>", " ", text, flags=re.I)
    text = re.sub(r"<style\b[\s\S]*?</style>", " ", text, flags=re.I)
    text = re.sub(r"<[^>]+>", " ", text)
    return re.sub(r"\s+", " ", unescape(text)).strip()


def normalize_header(value: Any) -> str:
    text = plain_text(value).lower()
    text = text.replace("_", "").replace("-", "").replace(" ", "")
    return text


def find_value(row: dict[str, Any], aliases: list[str]) -> str:
    alias_keys = {normalize_header(alias) for alias in aliases}
    for key, value in row.items():
        if normalize_header(key) in alias_keys:
            return plain_text(value)
    return ""


def detect_audit_file_type(headers: list[str]) -> str:
    normalized = {normalize_header(header) for header in headers}
    per_page_hits = sum(1 for key in ["url", "页面类型", "pagetype", "建议类别", "recommendation", "原始建议", "优先级", "priority", "meta建议", "suggestedmeta"] if normalize_header(key) in normalized)
    keyword_hits = sum(1 for key in ["建议url", "主关键词", "相关词", "页面类型", "具体写法"] if normalize_header(key) in normalized)
    if keyword_hits >= 3 and normalize_header("主关键词") in normalized:
        return "keyword_plan"
    if per_page_hits >= 3 and normalize_header("url") in normalized:
        return "per_page_audit"
    raise ValueError(f"Unrecognized SEO audit headers: {', '.join(headers)}")


def normalize_priority(value: str) -> str:
    clean = plain_text(value).upper()
    match = re.search(r"P[0-3]", clean)
    if match:
        return match.group(0)
    if clean in {"HIGH", "MEDIUM", "LOW"}:
        return clean
    return clean or "P2"


def safe_int(value: Any, default: int = 0) -> int:
    try:
        return int(str(value).strip())
    except (TypeError, ValueError):
        return default


def classify_task_type(source_type: str, row: dict[str, Any]) -> str:
    if source_type == "keyword_plan":
        return "new_page_plan"
    page_type = plain_text(row.get("page_type") or row.get("页面类型")).lower()
    sitemap = plain_text(row.get("sitemap")).lower()
    flags = plain_text(row.get("flags") or row.get("问题")).lower()
    recommendation = plain_text(row.get("recommendation") or row.get("原始建议") or row.get("建议类别")).lower()
    if page_type == "product_detail" or sitemap == "product":
        return "product_expand"
    if sitemap in {"product_tag", "post_tag"}:
        return "tag_cleanup"
    if page_type == "product_taxonomy" or sitemap == "product_cat":
        return "category_collection"
    if page_type in {"core_page", "trust_or_conversion_page"}:
        return "trust_page_enhance"
    if sitemap in {"post", "category"}:
        return "blog_refresh"
    if "missing_meta_description" in flags or "meta" in recommendation:
        return "meta_fix"
    return "meta_fix"


def normalize_audit_row(row: dict[str, Any], *, source_type: str, source_file: str, row_number: int) -> dict[str, Any]:
    if source_type == "keyword_plan":
        mapped = {
            "source_type": source_type,
            "source_file": source_file,
            "row_number": row_number,
            "task_type": "new_page_plan",
            "status": "todo",
            "priority": normalize_priority(find_value(row, ["优先级", "priority"])),
            "url": "",
            "suggested_url": find_value(row, ["建议URL", "suggested_url", "suggested url"]),
            "page_type": find_value(row, ["页面类型", "page_type", "page type"]),
            "sitemap": "",
            "category": find_value(row, ["品类", "category"]),
            "word_count": 0,
            "issue_flags": "",
            "recommendation": find_value(row, ["具体写法", "recommendation", "原始建议"]),
            "seo_title_suggestion": "",
            "meta_suggestion": "",
            "primary_keyword": find_value(row, ["主关键词", "primary_keyword", "primary keyword"]),
            "related_keywords": find_value(row, ["相关词", "secondary_keywords", "related keywords"]),
            "raw_row_json": json.dumps(row, ensure_ascii=False),
        }
        return mapped

    compact_row = {
        "page_type": find_value(row, ["页面类型", "page_type", "page type"]),
        "sitemap": find_value(row, ["sitemap"]),
        "flags": find_value(row, ["问题", "flags"]),
        "recommendation": find_value(row, ["原始建议", "recommendation", "建议类别"]),
    }
    task_type = classify_task_type(source_type, compact_row)
    return {
        "source_type": source_type,
        "source_file": source_file,
        "row_number": row_number,
        "task_type": task_type,
        "status": "todo",
        "priority": normalize_priority(find_value(row, ["优先级", "priority"])),
        "url": find_value(row, ["URL", "url"]),
        "suggested_url": "",
        "page_type": compact_row["page_type"],
        "sitemap": compact_row["sitemap"],
        "category": find_value(row, ["品类", "category"]),
        "word_count": safe_int(find_value(row, ["词数", "word_count", "word count"])),
        "issue_flags": compact_row["flags"],
        "recommendation": compact_row["recommendation"],
        "seo_title_suggestion": find_value(row, ["SEO标题建议", "suggested_seo_title", "seo title"]),
        "meta_suggestion": find_value(row, ["Meta建议", "suggested_meta", "meta description"]),
        "primary_keyword": "",
        "related_keywords": "",
        "raw_row_json": json.dumps(row, ensure_ascii=False),
    }


def parse_csv_bytes(data: bytes) -> tuple[list[str], list[dict[str, Any]]]:
    text = data.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text))
    headers = list(reader.fieldnames or [])
    return headers, [dict(row) for row in reader]


def parse_xlsx_bytes(data: bytes) -> tuple[list[str], list[dict[str, Any]]]:
    if openpyxl is None:
        raise ValueError("XLSX parsing requires openpyxl")
    workbook = openpyxl.load_workbook(io.BytesIO(data), read_only=True, data_only=True)
    sheet = workbook.active
    rows = list(sheet.iter_rows(values_only=True))
    if not rows:
        return [], []
    headers = [plain_text(value) for value in rows[0]]
    result: list[dict[str, Any]] = []
    for raw in rows[1:]:
        if not any(plain_text(value) for value in raw):
            continue
        result.append({headers[index]: raw[index] if index < len(raw) else "" for index in range(len(headers))})
    return headers, result


def parse_uploaded_audit_file(filename: str, data: bytes) -> dict[str, Any]:
    lower = filename.lower()
    if lower.endswith(".csv"):
        headers, rows = parse_csv_bytes(data)
    elif lower.endswith(".xlsx") or lower.endswith(".xls"):
        headers, rows = parse_xlsx_bytes(data)
    else:
        raise ValueError(f"Unsupported file extension for {filename}")
    file_type = detect_audit_file_type(headers)
    tasks = [
        normalize_audit_row(row, source_type=file_type, source_file=filename, row_number=index + 2)
        for index, row in enumerate(rows)
    ]
    return {
        "filename": filename,
        "fileType": file_type,
        "headers": headers,
        "totalRows": len(rows),
        "recognizedRows": len(tasks),
        "tasks": tasks,
        "sampleRows": tasks[:5],
        "warnings": [],
    }


def preview_import(files: list[tuple[str, bytes]]) -> dict[str, Any]:
    parsed_files = []
    errors = []
    all_tasks: list[dict[str, Any]] = []
    for filename, data in files:
        try:
            parsed = parse_uploaded_audit_file(filename, data)
            parsed_files.append({k: v for k, v in parsed.items() if k != "tasks"})
            all_tasks.extend(parsed["tasks"])
        except Exception as exc:
            errors.append({"filename": filename, "detail": str(exc)})
    counts = summarize_tasks(all_tasks)
    return {
        "ok": not errors and bool(parsed_files),
        "files": parsed_files,
        "errors": errors,
        "summary": counts,
        "tasksPreview": all_tasks[:20],
    }


def summarize_tasks(tasks: list[dict[str, Any]]) -> dict[str, Any]:
    by_task_type: dict[str, int] = {}
    by_priority: dict[str, int] = {}
    by_status: dict[str, int] = {}
    for task in tasks:
        by_task_type[task.get("task_type", "")] = by_task_type.get(task.get("task_type", ""), 0) + 1
        by_priority[task.get("priority", "")] = by_priority.get(task.get("priority", ""), 0) + 1
        by_status[task.get("status", "")] = by_status.get(task.get("status", ""), 0) + 1
    return {
        "totalTasks": len(tasks),
        "byTaskType": by_task_type,
        "byPriority": by_priority,
        "byStatus": by_status,
    }


def normalize_generated_output(raw: dict[str, Any]) -> dict[str, Any]:
    content_blocks = raw.get("contentBlocks") or raw.get("sections") or []
    if not isinstance(content_blocks, list):
        content_blocks = []
    faq = raw.get("faq") or raw.get("faqs") or []
    if not isinstance(faq, list):
        faq = [plain_text(faq)]
    links = raw.get("internalLinks") or raw.get("links") or []
    if not isinstance(links, list):
        links = []
    warnings = raw.get("warnings") or []
    if not isinstance(warnings, list):
        warnings = [plain_text(warnings)]
    return {
        "title": plain_text(raw.get("title") or raw.get("pageTitle")),
        "seoTitle": plain_text(raw.get("seoTitle") or raw.get("seo_title")),
        "metaDescription": plain_text(raw.get("metaDescription") or raw.get("seoDescription") or raw.get("meta")),
        "primaryKeyword": plain_text(raw.get("primaryKeyword") or raw.get("keyword")),
        "contentBlocks": content_blocks,
        "faq": [plain_text(item) for item in faq if plain_text(item)],
        "internalLinks": links,
        "cta": plain_text(raw.get("cta")),
        "warnings": [plain_text(item) for item in warnings if plain_text(item)],
        "sourceNotes": raw.get("sourceNotes") if isinstance(raw.get("sourceNotes"), list) else [],
    }


def _issue(severity: str, code: str, message: str) -> dict[str, str]:
    return {"severity": severity, "code": code, "message": message}


def _has_block_text(generated: dict[str, Any], pattern: str) -> bool:
    text = json.dumps(generated.get("contentBlocks") or [], ensure_ascii=False).lower()
    return re.search(pattern, text, flags=re.I) is not None


def score_generated_output(task_type: str, generated: dict[str, Any], *, link_candidates_available: bool = False) -> dict[str, Any]:
    normalized = normalize_generated_output(generated)
    issues: list[dict[str, str]] = []
    seo_title = normalized["seoTitle"]
    meta = normalized["metaDescription"]
    if not seo_title:
        issues.append(_issue("critical", "seo_title_missing", "SEO title is missing."))
    elif len(seo_title) > 60:
        issues.append(_issue("warning", "seo_title_too_long", "SEO title is longer than 60 characters."))
    if not meta:
        issues.append(_issue("critical", "meta_missing", "Meta description is missing."))
    elif len(meta) > 160:
        issues.append(_issue("warning", "meta_too_long", "Meta description is longer than 160 characters."))
    if task_type in GENERATION_TASK_TYPES and not normalized["faq"]:
        issues.append(_issue("warning", "faq_missing", "FAQ section is missing."))
    if task_type in GENERATION_TASK_TYPES and not normalized["cta"]:
        issues.append(_issue("warning", "cta_missing", "CTA is missing."))
    if link_candidates_available and not normalized["internalLinks"]:
        issues.append(_issue("warning", "internal_links_missing", "Internal link suggestions are missing."))
    if task_type == "product_expand" and not _has_block_text(normalized, r"spec|规格|material|capacity|installation"):
        issues.append(_issue("warning", "product_specs_missing", "Product output should include a specification table or spec section."))
    if task_type == "category_collection" and not _has_block_text(normalized, r"compare|comparison|filter|筛选|对比|model"):
        issues.append(_issue("warning", "category_comparison_missing", "Category output should include comparison or filter guidance."))
    if task_type == "trust_page_enhance" and not _has_block_text(normalized, r"factory|certificate|quality|quote|contact|工厂|证书|质量"):
        issues.append(_issue("warning", "trust_proof_missing", "Trust page output should include proof and quote/contact direction."))
    if task_type == "new_page_plan" and not _has_block_text(normalized, r"elementor|h1|h2|outline|brief"):
        issues.append(_issue("warning", "page_plan_outline_missing", "New page plan should include an Elementor brief or outline."))
    risk_text = json.dumps(normalized, ensure_ascii=False).lower()
    if re.search(r"\$\d+|in stock|guaranteed|certified for all|客户名称|order amount|exact quantity", risk_text):
        issues.append(_issue("critical", "unsupported_claim_risk", "Generated copy may include unsupported commercial or certification claims."))
    score = 100
    for issue in issues:
        if issue["severity"] == "critical":
            score -= 25
        elif issue["severity"] == "warning":
            score -= 10
        else:
            score -= 5
    return {"score": max(0, min(100, score)), "issues": issues}


def build_link_candidate_summary(candidates: list[dict[str, Any]], limit: int = 80) -> list[dict[str, Any]]:
    summary = []
    seen = set()
    for candidate in candidates:
        url = plain_text(candidate.get("url"))
        title = plain_text(candidate.get("title"))
        key = url.rstrip("/").lower()
        if not url or not title or key in seen:
            continue
        seen.add(key)
        summary.append({
            "type": plain_text(candidate.get("type")) or "page",
            "title": title[:120],
            "url": url,
            "terms": plain_text(f"{title} {candidate.get('slug', '')} {candidate.get('extra', '')}")[:220],
        })
        if len(summary) >= limit:
            break
    return summary


def build_generation_prompt(task: dict[str, Any], *, company_context: str = "", link_candidates: list[dict[str, Any]] | None = None) -> str:
    task_type = task.get("task_type")
    base = f"""You are a B2B SEO strategist for example.com, a deployment site products manufacturer.
Return ONLY valid JSON with keys: title, seoTitle, metaDescription, primaryKeyword, contentBlocks, faq, internalLinks, cta, warnings, sourceNotes.

Task type: {task_type}
URL: {task.get('url') or task.get('suggested_url')}
Priority: {task.get('priority')}
Page type: {task.get('page_type')}
Category: {task.get('category')}
Primary keyword: {task.get('primary_keyword')}
Related keywords: {task.get('related_keywords')}
Original recommendation:
\"\"\"
{task.get('recommendation', '')}
\"\"\"
SEO title suggestion:
\"\"\"
{task.get('seo_title_suggestion', '')}
\"\"\"
Meta suggestion:
\"\"\"
{task.get('meta_suggestion', '')}
\"\"\"
Company context:
\"\"\"
{company_context[:12000]}
\"\"\"
Internal link candidates:
{json.dumps(link_candidates or [], ensure_ascii=False)[:12000]}

Safety rules:
- Do not invent prices, stock, certification scope, customer names, order amounts, exact quantities, dimensions, or lead times.
- If a fact is missing, add a warning or editable question prompt instead of inventing it.
- Write natural B2B English for partners, enterprises, institutions, contractors, and facility teams.
"""
    task_rules = {
        "product_expand": "Include spec table guidance, short description, full product sections, material/capacity/installation when supported, FAQ, related links, and quote CTA.",
        "category_collection": "Include buyer intro above product grid, purchase scenarios, model comparison, filter dimensions, customization, FAQ, internal links, and CTA.",
        "trust_page_enhance": "Include factory capability, quality proof, certificate handling, customization process, case proof only when supported, contact/quote CTA, and thank-you tracking recommendation.",
        "new_page_plan": "Include page title, SEO title, slug, H1/H2/H3 outline, Elementor construction brief, suggested copy blocks, image briefs, FAQ, internal links, and CTA.",
    }
    return base + "\nTask-specific requirements:\n" + task_rules.get(task_type, "Give concise SEO repair recommendations and warnings.")
```

- [ ] **Step 4: Run helper tests and verify pass**

Run:

```bash
python3 -m unittest backend.tests.test_seo_audit -v
```

Expected: PASS for all tests in `SeoAuditHelperTests`.

- [ ] **Step 5: Verification checkpoint**

Run:

```bash
python3 -m unittest backend.tests.test_page_planner_helpers backend.tests.test_blog_ai backend.tests.test_seo_audit -v
```

Expected: PASS.

---

### Task 2: Backend Database Helpers and Import APIs

**Files:**
- Modify: `backend/main.py`
- Test: `backend/tests/test_seo_audit.py`

- [ ] **Step 1: Add failing persistence and import API tests**

Append these tests to `backend/tests/test_seo_audit.py`:

```python
import json
import sqlite3
import tempfile
from pathlib import Path
from unittest.mock import patch

from backend import main as backend_main


class SeoAuditPersistenceTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db_path = Path(self.tmp.name) / "seo-audit.db"
        self.db_patch = patch.object(backend_main, "DB_PATH", self.db_path)
        self.db_patch.start()
        self.addCleanup(self.db_patch.stop)
        self.addCleanup(self.tmp.cleanup)

    def test_save_import_batch_and_list_tasks(self):
        tasks = [
            {
                "source_type": "per_page_audit",
                "source_file": "audit.csv",
                "row_number": 2,
                "task_type": "product_expand",
                "status": "todo",
                "priority": "P0",
                "url": "https://example.com/product/a1-13/",
                "suggested_url": "",
                "page_type": "product_detail",
                "sitemap": "product",
                "category": "paper_product",
                "word_count": 160,
                "issue_flags": "missing_meta_description; thin_content",
                "recommendation": "补齐规格参数、FAQ、内链。",
                "seo_title_suggestion": "Commercial portable lantern",
                "meta_suggestion": "Commercial product for enterprise deployment sites.",
                "primary_keyword": "",
                "related_keywords": "",
                "raw_row_json": json.dumps({"URL": "https://example.com/product/a1-13/"}, ensure_ascii=False),
            }
        ]

        batch_id = backend_main._save_seo_audit_import_batch(
            name="SEO audit import",
            source_files=["audit.csv"],
            parsed_tasks=tasks,
            preview_summary={"totalTasks": 1},
        )

        batches = backend_main._list_seo_audit_batches()
        listed = backend_main._list_seo_audit_tasks(batch_id=batch_id, filters={})

        self.assertEqual(batches[0]["id"], batch_id)
        self.assertEqual(batches[0]["totalTasks"], 1)
        self.assertEqual(listed["total"], 1)
        self.assertEqual(listed["items"][0]["taskType"], "product_expand")
        self.assertEqual(listed["items"][0]["priority"], "P0")

    def test_patch_task_status_updates_updated_at(self):
        batch_id = backend_main._save_seo_audit_import_batch(
            name="SEO audit import",
            source_files=["audit.csv"],
            parsed_tasks=[
                {
                    "source_type": "per_page_audit",
                    "source_file": "audit.csv",
                    "row_number": 2,
                    "task_type": "meta_fix",
                    "status": "todo",
                    "priority": "P1",
                    "url": "https://example.com/factory/",
                    "suggested_url": "",
                    "page_type": "core_page",
                    "sitemap": "page",
                    "category": "sample_product",
                    "word_count": 156,
                    "issue_flags": "missing_meta_description",
                    "recommendation": "补强转化信任。",
                    "seo_title_suggestion": "",
                    "meta_suggestion": "",
                    "primary_keyword": "",
                    "related_keywords": "",
                    "raw_row_json": "{}",
                }
            ],
            preview_summary={"totalTasks": 1},
        )
        task_id = backend_main._list_seo_audit_tasks(batch_id=batch_id, filters={})["items"][0]["id"]

        updated = backend_main._update_seo_audit_task(task_id, {"status": "skipped", "notes": "Handle manually"})

        self.assertEqual(updated["status"], "skipped")
        self.assertEqual(updated["notes"], "Handle manually")

    def test_save_generation_keeps_quality_score(self):
        batch_id = backend_main._save_seo_audit_import_batch(
            name="SEO audit import",
            source_files=["audit.csv"],
            parsed_tasks=[
                {
                    "source_type": "per_page_audit",
                    "source_file": "audit.csv",
                    "row_number": 2,
                    "task_type": "category_collection",
                    "status": "todo",
                    "priority": "P0",
                    "url": "https://example.com/product-category/product-sample/",
                    "suggested_url": "",
                    "page_type": "product_taxonomy",
                    "sitemap": "product_cat",
                    "category": "sample_product",
                    "word_count": 300,
                    "issue_flags": "thin_content",
                    "recommendation": "增加采购场景和型号对比。",
                    "seo_title_suggestion": "",
                    "meta_suggestion": "",
                    "primary_keyword": "",
                    "related_keywords": "",
                    "raw_row_json": "{}",
                }
            ],
            preview_summary={"totalTasks": 1},
        )
        task_id = backend_main._list_seo_audit_tasks(batch_id=batch_id, filters={})["items"][0]["id"]

        generation_id = backend_main._save_seo_audit_generation(
            task_id=task_id,
            generator="gemini",
            status="generated",
            generated={"seoTitle": "Product Sample", "metaDescription": "Product sample category page.", "contentBlocks": []},
            quality={"score": 80, "issues": [{"severity": "warning", "code": "faq_missing", "message": "FAQ is missing."}]},
            warnings=["Review product facts."],
        )
        generations = backend_main._list_seo_audit_generations(task_id)

        self.assertEqual(generations[0]["id"], generation_id)
        self.assertEqual(generations[0]["qualityScore"], 80)
        self.assertEqual(generations[0]["qualityIssues"][0]["code"], "faq_missing")
```

- [ ] **Step 2: Run persistence tests and verify failure**

Run:

```bash
python3 -m unittest backend.tests.test_seo_audit.SeoAuditPersistenceTests -v
```

Expected: FAIL because `_save_seo_audit_import_batch`, `_list_seo_audit_batches`, `_list_seo_audit_tasks`, `_update_seo_audit_task`, `_save_seo_audit_generation`, and `_list_seo_audit_generations` do not exist.

- [ ] **Step 3: Implement DB helpers in `backend/main.py`**

Add imports near existing imports:

```python
from backend import seo_audit
```

Add helper functions near other database/history helpers:

```python
def _ensure_seo_audit_tables() -> None:
    with get_db_connection() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS seo_audit_import_batches (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL DEFAULT '',
                source_files TEXT NOT NULL DEFAULT '[]',
                total_rows INTEGER NOT NULL DEFAULT 0,
                recognized_rows INTEGER NOT NULL DEFAULT 0,
                unrecognized_rows INTEGER NOT NULL DEFAULT 0,
                status TEXT NOT NULL DEFAULT 'imported',
                preview_summary TEXT NOT NULL DEFAULT '{}',
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS seo_audit_tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                batch_id INTEGER NOT NULL,
                source_type TEXT NOT NULL DEFAULT '',
                source_file TEXT NOT NULL DEFAULT '',
                row_number INTEGER NOT NULL DEFAULT 0,
                task_type TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL DEFAULT 'todo',
                priority TEXT NOT NULL DEFAULT '',
                url TEXT NOT NULL DEFAULT '',
                suggested_url TEXT NOT NULL DEFAULT '',
                page_type TEXT NOT NULL DEFAULT '',
                sitemap TEXT NOT NULL DEFAULT '',
                category TEXT NOT NULL DEFAULT '',
                word_count INTEGER NOT NULL DEFAULT 0,
                issue_flags TEXT NOT NULL DEFAULT '',
                recommendation TEXT NOT NULL DEFAULT '',
                seo_title_suggestion TEXT NOT NULL DEFAULT '',
                meta_suggestion TEXT NOT NULL DEFAULT '',
                primary_keyword TEXT NOT NULL DEFAULT '',
                related_keywords TEXT NOT NULL DEFAULT '',
                raw_row_json TEXT NOT NULL DEFAULT '{}',
                notes TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS seo_audit_generations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                task_id INTEGER NOT NULL,
                generator TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL DEFAULT '',
                generated_json TEXT NOT NULL DEFAULT '{}',
                quality_score INTEGER NOT NULL DEFAULT 0,
                quality_issues_json TEXT NOT NULL DEFAULT '[]',
                warnings_json TEXT NOT NULL DEFAULT '[]',
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            )
            """
        )
        conn.commit()


def _seo_audit_task_row(row: sqlite3.Row | dict[str, Any]) -> dict[str, Any]:
    item = dict(row)
    return {
        "id": int(item.get("id") or 0),
        "batchId": int(item.get("batch_id") or 0),
        "sourceType": item.get("source_type") or "",
        "sourceFile": item.get("source_file") or "",
        "rowNumber": int(item.get("row_number") or 0),
        "taskType": item.get("task_type") or "",
        "taskTypeLabel": seo_audit.TASK_TYPE_LABELS.get(item.get("task_type") or "", item.get("task_type") or ""),
        "status": item.get("status") or "",
        "priority": item.get("priority") or "",
        "url": item.get("url") or "",
        "suggestedUrl": item.get("suggested_url") or "",
        "pageType": item.get("page_type") or "",
        "sitemap": item.get("sitemap") or "",
        "category": item.get("category") or "",
        "wordCount": int(item.get("word_count") or 0),
        "issueFlags": item.get("issue_flags") or "",
        "recommendation": item.get("recommendation") or "",
        "seoTitleSuggestion": item.get("seo_title_suggestion") or "",
        "metaSuggestion": item.get("meta_suggestion") or "",
        "primaryKeyword": item.get("primary_keyword") or "",
        "relatedKeywords": item.get("related_keywords") or "",
        "rawRow": _json_loads_safe(item.get("raw_row_json"), {}),
        "notes": item.get("notes") or "",
        "createdAt": item.get("created_at") or "",
        "updatedAt": item.get("updated_at") or "",
    }


def _seo_audit_generation_row(row: sqlite3.Row | dict[str, Any]) -> dict[str, Any]:
    item = dict(row)
    return {
        "id": int(item.get("id") or 0),
        "taskId": int(item.get("task_id") or 0),
        "generator": item.get("generator") or "",
        "status": item.get("status") or "",
        "generated": _json_loads_safe(item.get("generated_json"), {}),
        "qualityScore": int(item.get("quality_score") or 0),
        "qualityIssues": _json_loads_safe(item.get("quality_issues_json"), []),
        "warnings": _json_loads_safe(item.get("warnings_json"), []),
        "createdAt": item.get("created_at") or "",
    }


def _save_seo_audit_import_batch(
    *,
    name: str,
    source_files: list[str],
    parsed_tasks: list[dict[str, Any]],
    preview_summary: dict[str, Any],
) -> int:
    _ensure_seo_audit_tables()
    with get_db_connection() as conn:
        c = conn.cursor()
        c.execute(
            """
            INSERT INTO seo_audit_import_batches
                (name, source_files, total_rows, recognized_rows, unrecognized_rows, status, preview_summary)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                name,
                json.dumps(source_files, ensure_ascii=False),
                len(parsed_tasks),
                len(parsed_tasks),
                0,
                "imported",
                json.dumps(preview_summary, ensure_ascii=False),
            ),
        )
        batch_id = int(c.lastrowid)
        for task in parsed_tasks:
            c.execute(
                """
                INSERT INTO seo_audit_tasks (
                    batch_id, source_type, source_file, row_number, task_type, status, priority, url,
                    suggested_url, page_type, sitemap, category, word_count, issue_flags, recommendation,
                    seo_title_suggestion, meta_suggestion, primary_keyword, related_keywords, raw_row_json
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    batch_id,
                    task.get("source_type", ""),
                    task.get("source_file", ""),
                    int(task.get("row_number") or 0),
                    task.get("task_type", ""),
                    task.get("status", "todo"),
                    task.get("priority", ""),
                    task.get("url", ""),
                    task.get("suggested_url", ""),
                    task.get("page_type", ""),
                    task.get("sitemap", ""),
                    task.get("category", ""),
                    int(task.get("word_count") or 0),
                    task.get("issue_flags", ""),
                    task.get("recommendation", ""),
                    task.get("seo_title_suggestion", ""),
                    task.get("meta_suggestion", ""),
                    task.get("primary_keyword", ""),
                    task.get("related_keywords", ""),
                    task.get("raw_row_json", "{}"),
                ),
            )
        conn.commit()
        return batch_id


def _list_seo_audit_batches(limit: int = 20) -> list[dict[str, Any]]:
    _ensure_seo_audit_tables()
    with get_db_connection() as conn:
        rows = conn.execute(
            """
            SELECT b.*,
                   COUNT(t.id) AS total_tasks,
                   SUM(CASE WHEN t.priority = 'P0' THEN 1 ELSE 0 END) AS p0_count,
                   SUM(CASE WHEN t.priority = 'P1' THEN 1 ELSE 0 END) AS p1_count
            FROM seo_audit_import_batches b
            LEFT JOIN seo_audit_tasks t ON t.batch_id = b.id
            GROUP BY b.id
            ORDER BY b.id DESC
            LIMIT ?
            """,
            (max(1, min(100, int(limit or 20))),),
        ).fetchall()
    return [
        {
            "id": int(row["id"]),
            "name": row["name"],
            "sourceFiles": _json_loads_safe(row["source_files"], []),
            "totalRows": int(row["total_rows"] or 0),
            "recognizedRows": int(row["recognized_rows"] or 0),
            "unrecognizedRows": int(row["unrecognized_rows"] or 0),
            "status": row["status"],
            "createdAt": row["created_at"],
            "totalTasks": int(row["total_tasks"] or 0),
            "p0Count": int(row["p0_count"] or 0),
            "p1Count": int(row["p1_count"] or 0),
            "previewSummary": _json_loads_safe(row["preview_summary"], {}),
        }
        for row in rows
    ]


def _list_seo_audit_tasks(
    *,
    batch_id: int = 0,
    filters: dict[str, Any] | None = None,
    limit: int = 100,
    offset: int = 0,
) -> dict[str, Any]:
    _ensure_seo_audit_tables()
    filters = filters or {}
    clauses: list[str] = []
    params: list[Any] = []
    if batch_id:
        clauses.append("batch_id = ?")
        params.append(int(batch_id))
    for column, key in [
        ("status", "status"),
        ("task_type", "taskType"),
        ("priority", "priority"),
        ("page_type", "pageType"),
        ("category", "category"),
    ]:
        value = str(filters.get(key) or "").strip()
        if value:
            clauses.append(f"{column} = ?")
            params.append(value)
    search = str(filters.get("search") or "").strip()
    if search:
        clauses.append("(url LIKE ? OR suggested_url LIKE ? OR recommendation LIKE ? OR primary_keyword LIKE ?)")
        like = f"%{search}%"
        params.extend([like, like, like, like])
    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    clean_limit = max(1, min(300, int(limit or 100)))
    clean_offset = max(0, int(offset or 0))
    with get_db_connection() as conn:
        total = conn.execute(f"SELECT COUNT(*) AS count FROM seo_audit_tasks {where}", params).fetchone()["count"]
        rows = conn.execute(
            f"""
            SELECT *
            FROM seo_audit_tasks
            {where}
            ORDER BY
              CASE priority WHEN 'P0' THEN 0 WHEN 'P1' THEN 1 WHEN 'P2' THEN 2 WHEN 'P3' THEN 3 ELSE 4 END,
              id ASC
            LIMIT ? OFFSET ?
            """,
            params + [clean_limit, clean_offset],
        ).fetchall()
    return {"items": [_seo_audit_task_row(row) for row in rows], "total": int(total), "limit": clean_limit, "offset": clean_offset}


def _get_seo_audit_task(task_id: int) -> dict[str, Any]:
    _ensure_seo_audit_tables()
    with get_db_connection() as conn:
        row = conn.execute("SELECT * FROM seo_audit_tasks WHERE id = ?", (int(task_id),)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="SEO audit task not found")
    task = _seo_audit_task_row(row)
    generations = _list_seo_audit_generations(task_id, limit=1)
    task["latestGeneration"] = generations[0] if generations else None
    return task


def _update_seo_audit_task(task_id: int, updates: dict[str, Any]) -> dict[str, Any]:
    allowed_status = {"todo", "generated", "needs_edit", "approved", "done", "skipped", "failed"}
    status = str(updates.get("status") or "").strip()
    notes = str(updates.get("notes") or "").strip()
    sets: list[str] = []
    params: list[Any] = []
    if status:
        if status not in allowed_status:
            raise HTTPException(status_code=400, detail="Invalid SEO audit task status")
        sets.append("status = ?")
        params.append(status)
    if "notes" in updates:
        sets.append("notes = ?")
        params.append(notes)
    if not sets:
        return _get_seo_audit_task(task_id)
    sets.append("updated_at = datetime('now')")
    _ensure_seo_audit_tables()
    with get_db_connection() as conn:
        conn.execute(f"UPDATE seo_audit_tasks SET {', '.join(sets)} WHERE id = ?", params + [int(task_id)])
        conn.commit()
    return _get_seo_audit_task(task_id)


def _save_seo_audit_generation(
    *,
    task_id: int,
    generator: str,
    status: str,
    generated: dict[str, Any],
    quality: dict[str, Any],
    warnings: list[str],
) -> int:
    _ensure_seo_audit_tables()
    with get_db_connection() as conn:
        c = conn.cursor()
        c.execute(
            """
            INSERT INTO seo_audit_generations
                (task_id, generator, status, generated_json, quality_score, quality_issues_json, warnings_json)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                int(task_id),
                generator,
                status,
                json.dumps(generated, ensure_ascii=False),
                int(quality.get("score") or 0),
                json.dumps(quality.get("issues") or [], ensure_ascii=False),
                json.dumps(warnings or [], ensure_ascii=False),
            ),
        )
        generation_id = int(c.lastrowid)
        task_status = "needs_edit" if any(i.get("severity") == "critical" for i in quality.get("issues", [])) else "generated"
        c.execute("UPDATE seo_audit_tasks SET status = ?, updated_at = datetime('now') WHERE id = ?", (task_status, int(task_id)))
        conn.commit()
        return generation_id


def _list_seo_audit_generations(task_id: int, limit: int = 20) -> list[dict[str, Any]]:
    _ensure_seo_audit_tables()
    with get_db_connection() as conn:
        rows = conn.execute(
            """
            SELECT *
            FROM seo_audit_generations
            WHERE task_id = ?
            ORDER BY id DESC
            LIMIT ?
            """,
            (int(task_id), max(1, min(100, int(limit or 20)))),
        ).fetchall()
    return [_seo_audit_generation_row(row) for row in rows]
```

Add this JSON helper near the SEO audit database helpers:

```python
def _json_loads_safe(value: Any, fallback: Any) -> Any:
    try:
        if value is None or value == "":
            return fallback
        return json.loads(str(value))
    except Exception:
        return fallback
```

- [ ] **Step 4: Run persistence tests and verify pass**

Run:

```bash
python3 -m unittest backend.tests.test_seo_audit.SeoAuditPersistenceTests -v
```

Expected: PASS.

- [ ] **Step 5: Add route models and endpoints**

Add Pydantic models near existing payload models:

```python
class SeoAuditTaskPatchPayload(BaseModel):
    status: str = ""
    notes: str = ""
```

Add API routes near other SEO/page-planner routes:

```python
@app.post("/seo-audit/import-preview")
async def preview_seo_audit_import(files: List[UploadFile] = File(...)):
    if not files:
        raise HTTPException(status_code=400, detail="Upload at least one SEO audit CSV/XLSX file")
    payload_files = [(file.filename or "upload.csv", await file.read()) for file in files]
    preview = seo_audit.preview_import(payload_files)
    if preview["errors"]:
        raise HTTPException(status_code=400, detail=preview)
    return preview


@app.post("/seo-audit/import")
async def import_seo_audit(files: List[UploadFile] = File(...), name: str = Form("")):
    if not files:
        raise HTTPException(status_code=400, detail="Upload at least one SEO audit CSV/XLSX file")
    payload_files = [(file.filename or "upload.csv", await file.read()) for file in files]
    parsed = []
    tasks: list[dict[str, Any]] = []
    for filename, data in payload_files:
        item = seo_audit.parse_uploaded_audit_file(filename, data)
        parsed.append(item)
        tasks.extend(item["tasks"])
    summary = seo_audit.summarize_tasks(tasks)
    batch_id = _save_seo_audit_import_batch(
        name=name.strip() or f"SEO audit import {_utc_now()}",
        source_files=[filename for filename, _ in payload_files],
        parsed_tasks=tasks,
        preview_summary=summary,
    )
    return {"batch": _list_seo_audit_batches(limit=1)[0], "batchId": batch_id, "summary": summary}


@app.get("/seo-audit/batches")
def list_seo_audit_batches(limit: int = 20):
    return {"batches": _list_seo_audit_batches(limit=limit)}


@app.get("/seo-audit/tasks")
def list_seo_audit_tasks(
    batchId: int = 0,
    status: str = "",
    taskType: str = "",
    priority: str = "",
    pageType: str = "",
    category: str = "",
    search: str = "",
    limit: int = 100,
    offset: int = 0,
):
    return _list_seo_audit_tasks(
        batch_id=batchId,
        filters={
            "status": status,
            "taskType": taskType,
            "priority": priority,
            "pageType": pageType,
            "category": category,
            "search": search,
        },
        limit=limit,
        offset=offset,
    )


@app.get("/seo-audit/tasks/{task_id}")
def get_seo_audit_task(task_id: int):
    return _get_seo_audit_task(task_id)


@app.patch("/seo-audit/tasks/{task_id}")
def patch_seo_audit_task(task_id: int, payload: SeoAuditTaskPatchPayload):
    return _update_seo_audit_task(task_id, payload.model_dump())


@app.get("/seo-audit/tasks/{task_id}/generations")
def list_seo_audit_task_generations(task_id: int):
    return {"generations": _list_seo_audit_generations(task_id)}
```

- [ ] **Step 6: Run backend SEO audit tests**

Run:

```bash
python3 -m unittest backend.tests.test_seo_audit -v
```

Expected: PASS.

---

### Task 3: Single-Task Gemini Generation Endpoint

**Files:**
- Modify: `backend/main.py`
- Modify: `backend/tests/test_seo_audit.py`

- [ ] **Step 1: Add failing generation endpoint/helper test**

Append to `SeoAuditPersistenceTests`:

```python
    def test_generate_seo_audit_task_stores_normalized_output(self):
        batch_id = backend_main._save_seo_audit_import_batch(
            name="SEO audit import",
            source_files=["audit.csv"],
            parsed_tasks=[
                {
                    "source_type": "per_page_audit",
                    "source_file": "audit.csv",
                    "row_number": 2,
                    "task_type": "category_collection",
                    "status": "todo",
                    "priority": "P0",
                    "url": "https://example.com/product-category/product-sample/",
                    "suggested_url": "",
                    "page_type": "product_taxonomy",
                    "sitemap": "product_cat",
                    "category": "sample_product",
                    "word_count": 300,
                    "issue_flags": "thin_content",
                    "recommendation": "增加采购场景和型号对比。",
                    "seo_title_suggestion": "",
                    "meta_suggestion": "",
                    "primary_keyword": "",
                    "related_keywords": "",
                    "raw_row_json": "{}",
                }
            ],
            preview_summary={"totalTasks": 1},
        )
        task_id = backend_main._list_seo_audit_tasks(batch_id=batch_id, filters={})["items"][0]["id"]

        raw = json.dumps({
            "title": "Product Sample Collection",
            "seoTitle": "Product Sample Collection",
            "metaDescription": "Compare product sample models for shared environments.",
            "contentBlocks": [
                {"type": "comparison", "heading": "Compare models", "body": "Use filter guidance for capacity, material, and installation."}
            ],
            "faq": ["What product sample is best for enterprises? Choose by traffic and service routine."],
            "internalLinks": [{"title": "Automatic Product Samples", "url": "/automatic-product-sample-commercial/"}],
            "cta": "Contact Demo Brand for bulk supply recommendations.",
            "warnings": [],
        })

        with patch.object(backend_main, "_ai_configured", return_value=True), \
             patch.object(backend_main, "_get_gemini_api_key", return_value="test-key"), \
             patch.object(backend_main, "_blog_link_candidates", return_value=([], [])), \
             patch.object(backend_main, "_gemini_generate_text", return_value=raw):
            result = backend_main._generate_seo_audit_task_result(task_id)

        self.assertEqual(result["task"]["status"], "generated")
        self.assertEqual(result["generation"]["qualityScore"], 100)
        self.assertEqual(result["generation"]["generated"]["seoTitle"], "Product Sample Collection")
```

- [ ] **Step 2: Run generation test and verify failure**

Run:

```bash
python3 -m unittest backend.tests.test_seo_audit.SeoAuditPersistenceTests.test_generate_seo_audit_task_stores_normalized_output -v
```

Expected: FAIL because `_generate_seo_audit_task_result` does not exist.

- [ ] **Step 3: Implement generation helper and route**

Add to `backend/main.py`:

```python
def _generate_seo_audit_task_result(task_id: int) -> dict[str, Any]:
    if not _ai_configured():
        raise HTTPException(status_code=400, detail=_ai_missing_detail())
    task = _get_seo_audit_task(task_id)
    if task["taskType"] not in seo_audit.GENERATION_TASK_TYPES:
        raise HTTPException(status_code=400, detail=f"Generation is not enabled for {task['taskType']}")
    try:
        link_candidates, link_warnings = _blog_link_candidates(None)
    except Exception as exc:
        link_candidates, link_warnings = [], [f"Internal link candidates skipped: {_blog_warning_detail(exc)}"]
    prompt_task = {
        "task_type": task["taskType"],
        "url": task["url"],
        "suggested_url": task["suggestedUrl"],
        "priority": task["priority"],
        "page_type": task["pageType"],
        "category": task["category"],
        "primary_keyword": task["primaryKeyword"],
        "related_keywords": task["relatedKeywords"],
        "recommendation": task["recommendation"],
        "seo_title_suggestion": task["seoTitleSuggestion"],
        "meta_suggestion": task["metaSuggestion"],
    }
    prompt = seo_audit.build_generation_prompt(
        prompt_task,
        company_context=_build_company_prompt(""),
        link_candidates=seo_audit.build_link_candidate_summary(link_candidates),
    )
    try:
        raw = _gemini_generate_text(_get_gemini_api_key(), prompt, _ai_pro_model(), timeout=180)
        parsed = _parse_ai_json_object(raw)
        if not parsed:
            raise HTTPException(status_code=502, detail="AI did not return valid SEO audit JSON")
        generated = seo_audit.normalize_generated_output(parsed)
        warnings = list(generated.get("warnings") or []) + list(link_warnings)
        quality = seo_audit.score_generated_output(
            task["taskType"],
            generated,
            link_candidates_available=bool(link_candidates),
        )
        generation_id = _save_seo_audit_generation(
            task_id=task_id,
            generator="gemini",
            status="generated",
            generated=generated,
            quality=quality,
            warnings=warnings,
        )
        generations = _list_seo_audit_generations(task_id, limit=1)
        return {"task": _get_seo_audit_task(task_id), "generation": generations[0], "generationId": generation_id}
    except HTTPException:
        raise
    except Exception as exc:
        failure = {"error": _page_planner_error_message(exc)}
        quality = {"score": 0, "issues": [{"severity": "critical", "code": "generation_failed", "message": failure["error"]}]}
        _save_seo_audit_generation(
            task_id=task_id,
            generator="gemini",
            status="failed",
            generated=failure,
            quality=quality,
            warnings=[failure["error"]],
        )
        _update_seo_audit_task(task_id, {"status": "failed"})
        raise HTTPException(status_code=502, detail=f"SEO audit generation failed: {failure['error']}")


@app.post("/seo-audit/tasks/{task_id}/generate")
def generate_seo_audit_task(task_id: int):
    return _generate_seo_audit_task_result(task_id)
```

- [ ] **Step 4: Run generation test**

Run:

```bash
python3 -m unittest backend.tests.test_seo_audit.SeoAuditPersistenceTests.test_generate_seo_audit_task_stores_normalized_output -v
```

Expected: PASS.

- [ ] **Step 5: Run all backend SEO audit tests**

Run:

```bash
python3 -m unittest backend.tests.test_seo_audit -v
```

Expected: PASS.

---

### Task 4: Frontend SEO Audit Service

**Files:**
- Create: `services/seoAuditService.ts`
- Create: `src/tests/seo-audit-service.test.ts`

- [ ] **Step 1: Write failing service tests**

Create `src/tests/seo-audit-service.test.ts`:

```typescript
import assert from 'node:assert/strict';
import test from 'node:test';

test('seo audit service sends FormData for preview and import', async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({ ok: true, files: [], summary: { totalTasks: 0 } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    const service = await import('../../services/seoAuditService.ts');
    const file = new File(['URL,页面类型\nhttps://example.com/,core_page\n'], 'audit.csv', { type: 'text/csv' });
    await service.previewSeoAuditImport([file]);
    await service.importSeoAudit([file], 'Audit import');
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(calls[0].url, '/api/seo-audit/import-preview');
  assert.equal(calls[0].init?.method, 'POST');
  assert.ok(calls[0].init?.body instanceof FormData);
  assert.equal(calls[1].url, '/api/seo-audit/import');
  assert.equal(calls[1].init?.method, 'POST');
  assert.ok(calls[1].init?.body instanceof FormData);
});

test('seo audit service builds task query filters', async () => {
  const calls: string[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL | Request) => {
    calls.push(String(url));
    return new Response(JSON.stringify({ items: [], total: 0, limit: 100, offset: 0 }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    const service = await import('../../services/seoAuditService.ts');
    await service.fetchSeoAuditTasks({ batchId: 3, taskType: 'product_expand', priority: 'P0', search: 'factory' });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.match(calls[0], /\/api\/seo-audit\/tasks\?/);
  assert.match(calls[0], /batchId=3/);
  assert.match(calls[0], /taskType=product_expand/);
  assert.match(calls[0], /priority=P0/);
  assert.match(calls[0], /search=factory/);
});
```

- [ ] **Step 2: Run service tests and verify failure**

Run:

```bash
npm test -- src/tests/seo-audit-service.test.ts
```

Expected: FAIL because `services/seoAuditService.ts` does not exist.

- [ ] **Step 3: Implement service**

Create `services/seoAuditService.ts`:

```typescript
import { API_BASE, postForm, requestJson } from "./apiClient";

export type SeoAuditTaskType =
  | "product_expand"
  | "category_collection"
  | "trust_page_enhance"
  | "new_page_plan"
  | "blog_refresh"
  | "tag_cleanup"
  | "meta_fix";

export type SeoAuditTaskStatus =
  | "todo"
  | "generated"
  | "needs_edit"
  | "approved"
  | "done"
  | "skipped"
  | "failed";

export interface SeoAuditSummary {
  totalTasks: number;
  byTaskType: Record<string, number>;
  byPriority: Record<string, number>;
  byStatus: Record<string, number>;
}

export interface SeoAuditPreviewFile {
  filename: string;
  fileType: string;
  headers: string[];
  totalRows: number;
  recognizedRows: number;
  sampleRows: SeoAuditTask[];
  warnings: string[];
}

export interface SeoAuditImportPreview {
  ok: boolean;
  files: SeoAuditPreviewFile[];
  errors: Array<{ filename: string; detail: string }>;
  summary: SeoAuditSummary;
  tasksPreview: SeoAuditTask[];
}

export interface SeoAuditBatch {
  id: number;
  name: string;
  sourceFiles: string[];
  totalRows: number;
  recognizedRows: number;
  unrecognizedRows: number;
  status: string;
  createdAt: string;
  totalTasks: number;
  p0Count: number;
  p1Count: number;
  previewSummary: SeoAuditSummary;
}

export interface SeoAuditQualityIssue {
  severity: "critical" | "warning" | "notice";
  code: string;
  message: string;
}

export interface SeoAuditGeneration {
  id: number;
  taskId: number;
  generator: string;
  status: string;
  generated: {
    title?: string;
    seoTitle?: string;
    metaDescription?: string;
    primaryKeyword?: string;
    contentBlocks?: Array<{ type?: string; heading?: string; body?: string; notes?: string }>;
    faq?: string[];
    internalLinks?: Array<{ title?: string; url?: string; anchorText?: string; reason?: string }>;
    cta?: string;
    warnings?: string[];
  };
  qualityScore: number;
  qualityIssues: SeoAuditQualityIssue[];
  warnings: string[];
  createdAt: string;
}

export interface SeoAuditTask {
  id: number;
  batchId: number;
  sourceType: string;
  sourceFile: string;
  rowNumber: number;
  taskType: SeoAuditTaskType;
  taskTypeLabel: string;
  status: SeoAuditTaskStatus;
  priority: string;
  url: string;
  suggestedUrl: string;
  pageType: string;
  sitemap: string;
  category: string;
  wordCount: number;
  issueFlags: string;
  recommendation: string;
  seoTitleSuggestion: string;
  metaSuggestion: string;
  primaryKeyword: string;
  relatedKeywords: string;
  rawRow: Record<string, unknown>;
  notes: string;
  createdAt: string;
  updatedAt: string;
  latestGeneration?: SeoAuditGeneration | null;
}

export interface SeoAuditTaskQuery {
  batchId?: number;
  status?: string;
  taskType?: string;
  priority?: string;
  pageType?: string;
  category?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

const buildFilesForm = (files: File[], name?: string) => {
  const form = new FormData();
  files.forEach(file => form.append("files", file, file.name));
  if (name) form.append("name", name);
  return form;
};

const queryString = (query: SeoAuditTaskQuery) => {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      params.set(key, String(value));
    }
  });
  const value = params.toString();
  return value ? `?${value}` : "";
};

export const previewSeoAuditImport = (files: File[], apiBase = API_BASE): Promise<SeoAuditImportPreview> => (
  postForm<SeoAuditImportPreview>("/seo-audit/import-preview", buildFilesForm(files), apiBase)
);

export const importSeoAudit = (files: File[], name = "", apiBase = API_BASE): Promise<{ batch: SeoAuditBatch; batchId: number; summary: SeoAuditSummary }> => (
  postForm<{ batch: SeoAuditBatch; batchId: number; summary: SeoAuditSummary }>("/seo-audit/import", buildFilesForm(files, name), apiBase)
);

export const fetchSeoAuditBatches = (apiBase = API_BASE): Promise<{ batches: SeoAuditBatch[] }> => (
  requestJson<{ batches: SeoAuditBatch[] }>("/seo-audit/batches", undefined, apiBase)
);

export const fetchSeoAuditTasks = (query: SeoAuditTaskQuery = {}, apiBase = API_BASE): Promise<{ items: SeoAuditTask[]; total: number; limit: number; offset: number }> => (
  requestJson<{ items: SeoAuditTask[]; total: number; limit: number; offset: number }>(`/seo-audit/tasks${queryString(query)}`, undefined, apiBase)
);

export const fetchSeoAuditTask = (taskId: number, apiBase = API_BASE): Promise<SeoAuditTask> => (
  requestJson<SeoAuditTask>(`/seo-audit/tasks/${encodeURIComponent(String(taskId))}`, undefined, apiBase)
);

export const patchSeoAuditTask = (taskId: number, body: { status?: SeoAuditTaskStatus; notes?: string }, apiBase = API_BASE): Promise<SeoAuditTask> => (
  requestJson<SeoAuditTask>(`/seo-audit/tasks/${encodeURIComponent(String(taskId))}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }, apiBase)
);

export const generateSeoAuditTask = (taskId: number, apiBase = API_BASE): Promise<{ task: SeoAuditTask; generation: SeoAuditGeneration; generationId: number }> => (
  requestJson<{ task: SeoAuditTask; generation: SeoAuditGeneration; generationId: number }>(`/seo-audit/tasks/${encodeURIComponent(String(taskId))}/generate`, {
    method: "POST",
  }, apiBase)
);

export const fetchSeoAuditGenerations = (taskId: number, apiBase = API_BASE): Promise<{ generations: SeoAuditGeneration[] }> => (
  requestJson<{ generations: SeoAuditGeneration[] }>(`/seo-audit/tasks/${encodeURIComponent(String(taskId))}/generations`, undefined, apiBase)
);
```

- [ ] **Step 4: Run service tests**

Run:

```bash
npm test -- src/tests/seo-audit-service.test.ts
```

Expected: PASS.

---

### Task 5: SEO Audit Dashboard UI

**Files:**
- Create: `components/SeoAuditDashboard.tsx`
- Test: `src/tests/app-tabs.test.ts`

- [ ] **Step 1: Add failing render test**

Append to `src/tests/app-tabs.test.ts`:

```typescript
test('seo audit dashboard renders upload, filters, and empty task state', async () => {
  const module = await import('../../components/SeoAuditDashboard.tsx');
  const SeoAuditDashboard = module.SeoAuditDashboard as React.ComponentType<any>;
  const html = renderToStaticMarkup(React.createElement(SeoAuditDashboard, {
    theme,
    onNavigate: () => undefined,
  }));

  assert.match(html, /SEO 审计工作台/);
  assert.match(html, /上传 SEO 审计文件/);
  assert.match(html, /可同时选择逐页审计表和关键词规划表/);
  assert.match(html, /任务类型/);
  assert.match(html, /优先级/);
  assert.match(html, /暂无审计任务/);
});
```

- [ ] **Step 2: Run render test and verify failure**

Run:

```bash
npm test -- src/tests/app-tabs.test.ts
```

Expected: FAIL because `components/SeoAuditDashboard.tsx` does not exist.

- [ ] **Step 3: Implement `SeoAuditDashboard`**

Create `components/SeoAuditDashboard.tsx`:

```tsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchSeoAuditBatches,
  fetchSeoAuditTasks,
  generateSeoAuditTask,
  importSeoAudit,
  patchSeoAuditTask,
  previewSeoAuditImport,
  SeoAuditBatch,
  SeoAuditGeneration,
  SeoAuditImportPreview,
  SeoAuditTask,
  SeoAuditTaskStatus,
} from "../services/seoAuditService";
import { IconCheck, IconDocumentText, IconImport, IconRefresh, IconSparkles } from "./Icons";

type Theme = {
  cardBg: string;
  cardBorder: string;
  heading: string;
  subText: string;
  inputBg: string;
  inputBorder: string;
};

interface SeoAuditDashboardProps {
  theme: Theme;
  onNavigate?: (mode: string, options?: { filter?: string }) => void;
}

const taskTypeOptions = [
  ["", "全部类型"],
  ["product_expand", "产品页扩写"],
  ["category_collection", "分类集合页"],
  ["trust_page_enhance", "信任页补强"],
  ["new_page_plan", "新页面规划"],
  ["blog_refresh", "Blog 翻新"],
  ["tag_cleanup", "标签页处理"],
  ["meta_fix", "Meta 修复"],
];

const statusOptions: Array<[SeoAuditTaskStatus | "", string]> = [
  ["", "全部状态"],
  ["todo", "未开始"],
  ["generated", "已生成"],
  ["needs_edit", "需修改"],
  ["approved", "已审核"],
  ["done", "已完成"],
  ["skipped", "暂不处理"],
  ["failed", "失败"],
];

const priorityOptions = ["", "P0", "P1", "P2", "P3"];

const statusLabel = (status: string) => statusOptions.find(([value]) => value === status)?.[1] || status;

const scoreTone = (score: number) => {
  if (score >= 90) return "text-emerald-600 dark:text-emerald-300";
  if (score >= 70) return "text-blue-600 dark:text-blue-300";
  if (score >= 40) return "text-amber-600 dark:text-amber-300";
  return "text-red-600 dark:text-red-300";
};

const generatedSections = (generation?: SeoAuditGeneration | null) => generation?.generated?.contentBlocks || [];

export const SeoAuditDashboard: React.FC<SeoAuditDashboardProps> = ({ theme, onNavigate }) => {
  const [files, setFiles] = useState<File[]>([]);
  const [preview, setPreview] = useState<SeoAuditImportPreview | null>(null);
  const [batches, setBatches] = useState<SeoAuditBatch[]>([]);
  const [tasks, setTasks] = useState<SeoAuditTask[]>([]);
  const [total, setTotal] = useState(0);
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [filters, setFilters] = useState({ batchId: 0, taskType: "", priority: "", status: "", search: "" });

  const selectedTask = useMemo(
    () => tasks.find(task => task.id === selectedTaskId) || tasks[0] || null,
    [tasks, selectedTaskId],
  );

  const loadBatches = useCallback(async () => {
    const data = await fetchSeoAuditBatches();
    setBatches(data.batches || []);
    if (!filters.batchId && data.batches?.[0]?.id) {
      setFilters(prev => ({ ...prev, batchId: data.batches[0].id }));
    }
  }, [filters.batchId]);

  const loadTasks = useCallback(async () => {
    const data = await fetchSeoAuditTasks({ ...filters, limit: 100 });
    setTasks(data.items || []);
    setTotal(data.total || 0);
    if (data.items?.length && !data.items.some(item => item.id === selectedTaskId)) {
      setSelectedTaskId(data.items[0].id);
    }
  }, [filters, selectedTaskId]);

  useEffect(() => {
    loadBatches().catch(err => setNotice(`批次加载失败：${err.message || String(err)}`));
  }, [loadBatches]);

  useEffect(() => {
    loadTasks().catch(err => setNotice(`任务加载失败：${err.message || String(err)}`));
  }, [loadTasks]);

  const handleFiles = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files || []);
    setFiles(selected);
    setPreview(null);
    setNotice(selected.length ? `已选择 ${selected.length} 个文件。` : "");
    event.target.value = "";
  };

  const runPreview = async () => {
    if (!files.length) {
      setNotice("请先选择 CSV/XLSX 文件。");
      return;
    }
    try {
      setBusy("preview");
      const data = await previewSeoAuditImport(files);
      setPreview(data);
      setNotice(`预览完成：识别 ${data.summary.totalTasks || 0} 条任务。`);
    } catch (err: any) {
      setNotice(`预览失败：${err.message || String(err)}`);
    } finally {
      setBusy("");
    }
  };

  const runImport = async () => {
    if (!files.length) return;
    try {
      setBusy("import");
      const data = await importSeoAudit(files, "SEO audit import");
      setNotice(`导入完成：${data.summary.totalTasks || 0} 条任务。`);
      setPreview(null);
      setFiles([]);
      await loadBatches();
      setFilters(prev => ({ ...prev, batchId: data.batchId }));
    } catch (err: any) {
      setNotice(`导入失败：${err.message || String(err)}`);
    } finally {
      setBusy("");
    }
  };

  const updateStatus = async (task: SeoAuditTask, status: SeoAuditTaskStatus) => {
    try {
      setBusy(`status-${task.id}`);
      await patchSeoAuditTask(task.id, { status });
      await loadTasks();
      setNotice(`任务已标记为：${statusLabel(status)}`);
    } catch (err: any) {
      setNotice(`状态更新失败：${err.message || String(err)}`);
    } finally {
      setBusy("");
    }
  };

  const runGenerate = async (task: SeoAuditTask) => {
    try {
      setBusy(`generate-${task.id}`);
      const result = await generateSeoAuditTask(task.id);
      setTasks(prev => prev.map(item => item.id === task.id ? result.task : item));
      setSelectedTaskId(task.id);
      setNotice(`Gemini 生成完成，质量分 ${result.generation.qualityScore}。`);
    } catch (err: any) {
      setNotice(`生成失败：${err.message || String(err)}`);
      await loadTasks();
    } finally {
      setBusy("");
    }
  };

  const navigateTask = (task: SeoAuditTask) => {
    if (task.taskType === "product_expand") onNavigate?.("productSeo");
    else if (task.taskType === "new_page_plan") onNavigate?.("pagePlanner");
    else if (task.taskType === "blog_refresh") onNavigate?.("blogFormat");
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className={`rounded-lg border ${theme.cardBorder} ${theme.cardBg} p-5`}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className={`flex items-center gap-2 text-xl font-bold ${theme.heading}`}>
                <IconSparkles className="size-5" /> SEO 审计工作台
              </h2>
              <p className={`mt-1 text-sm ${theme.subText}`}>上传 SEO 审计文件，可同时选择逐页审计表和关键词规划表。</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <input id="seo-audit-upload" type="file" multiple accept=".csv,.xlsx,.xls" className="hidden" onChange={handleFiles} />
              <label htmlFor="seo-audit-upload" className={`inline-flex cursor-pointer items-center gap-2 rounded-md border ${theme.cardBorder} px-3 py-2 text-sm font-semibold ${theme.heading} hover:bg-slate-100 dark:hover:bg-slate-800`}>
                <IconImport className="size-4" /> 选择文件
              </label>
              <button type="button" onClick={runPreview} disabled={!files.length || !!busy} className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
                <IconDocumentText className="size-4" /> 预览导入
              </button>
              <button type="button" onClick={runImport} disabled={!preview || !!busy} className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
                <IconCheck className="size-4" /> 确认导入
              </button>
            </div>
          </div>

          {files.length > 0 && (
            <div className={`mt-4 rounded-md border ${theme.cardBorder} p-3 text-xs ${theme.subText}`}>
              已选择：{files.map(file => file.name).join("，")}
            </div>
          )}

          {preview && (
            <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
              <div className="rounded-md bg-slate-50 p-3 dark:bg-slate-900"><div className={theme.subText}>任务数</div><div className={`text-xl font-bold ${theme.heading}`}>{preview.summary.totalTasks}</div></div>
              <div className="rounded-md bg-red-50 p-3 text-red-700 dark:bg-red-950/30"><div>P0</div><div className="text-xl font-bold">{preview.summary.byPriority?.P0 || 0}</div></div>
              <div className="rounded-md bg-blue-50 p-3 text-blue-700 dark:bg-blue-950/30"><div>产品页</div><div className="text-xl font-bold">{preview.summary.byTaskType?.product_expand || 0}</div></div>
              <div className="rounded-md bg-indigo-50 p-3 text-indigo-700 dark:bg-indigo-950/30"><div>新页面</div><div className="text-xl font-bold">{preview.summary.byTaskType?.new_page_plan || 0}</div></div>
            </div>
          )}

          {notice && (
            <div className={`mt-4 rounded-md px-3 py-2 text-xs ${notice.includes("失败") ? "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300" : "bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300"}`}>
              {notice}
            </div>
          )}
        </section>

        <section className={`rounded-lg border ${theme.cardBorder} ${theme.cardBg} p-4`}>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
            <select aria-label="批次" value={filters.batchId} onChange={e => setFilters(prev => ({ ...prev, batchId: Number(e.target.value) || 0 }))} className={`${theme.inputBg} border ${theme.inputBorder} rounded-md px-2 py-2 text-sm ${theme.heading}`}>
              <option value={0}>全部批次</option>
              {batches.map(batch => <option key={batch.id} value={batch.id}>{batch.name || `Batch ${batch.id}`}</option>)}
            </select>
            <select aria-label="任务类型" value={filters.taskType} onChange={e => setFilters(prev => ({ ...prev, taskType: e.target.value }))} className={`${theme.inputBg} border ${theme.inputBorder} rounded-md px-2 py-2 text-sm ${theme.heading}`}>
              {taskTypeOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <select aria-label="优先级" value={filters.priority} onChange={e => setFilters(prev => ({ ...prev, priority: e.target.value }))} className={`${theme.inputBg} border ${theme.inputBorder} rounded-md px-2 py-2 text-sm ${theme.heading}`}>
              {priorityOptions.map(value => <option key={value} value={value}>{value || "全部优先级"}</option>)}
            </select>
            <select aria-label="状态" value={filters.status} onChange={e => setFilters(prev => ({ ...prev, status: e.target.value }))} className={`${theme.inputBg} border ${theme.inputBorder} rounded-md px-2 py-2 text-sm ${theme.heading}`}>
              {statusOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <input aria-label="搜索" value={filters.search} onChange={e => setFilters(prev => ({ ...prev, search: e.target.value }))} placeholder="搜索 URL / 建议 / 关键词" className={`${theme.inputBg} border ${theme.inputBorder} rounded-md px-2 py-2 text-sm ${theme.heading}`} />
          </div>
        </section>

        <section className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,.9fr)]">
          <div className={`rounded-lg border ${theme.cardBorder} ${theme.cardBg} overflow-hidden`}>
            <div className={`border-b ${theme.cardBorder} px-4 py-3 text-sm ${theme.subText}`}>共 {total} 条任务</div>
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead className={`${theme.inputBg} text-xs ${theme.subText}`}>
                  <tr>
                    <th className="px-3 py-2 text-left">任务</th>
                    <th className="px-3 py-2 text-left">优先级</th>
                    <th className="px-3 py-2 text-left">状态</th>
                    <th className="px-3 py-2 text-right">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {tasks.length ? tasks.map(task => (
                    <tr key={task.id} onClick={() => setSelectedTaskId(task.id)} className={`cursor-pointer border-t ${theme.cardBorder} ${selectedTask?.id === task.id ? "bg-indigo-50 dark:bg-indigo-950/20" : "hover:bg-slate-50 dark:hover:bg-slate-800/50"}`}>
                      <td className="px-3 py-3">
                        <div className={`font-semibold ${theme.heading}`}>{task.taskTypeLabel}</div>
                        <div className={`mt-1 max-w-xl truncate text-xs ${theme.subText}`}>{task.url || task.suggestedUrl}</div>
                        <div className={`mt-1 line-clamp-2 text-xs ${theme.subText}`}>{task.recommendation}</div>
                      </td>
                      <td className="px-3 py-3 text-xs font-bold">{task.priority}</td>
                      <td className="px-3 py-3 text-xs">{statusLabel(task.status)}</td>
                      <td className="px-3 py-3 text-right">
                        <button type="button" onClick={e => { e.stopPropagation(); runGenerate(task); }} disabled={!!busy || !["product_expand", "category_collection", "trust_page_enhance", "new_page_plan"].includes(task.taskType)} className="rounded-md bg-slate-900 px-2 py-1 text-xs font-semibold text-white disabled:opacity-40 dark:bg-white dark:text-slate-900">
                          {busy === `generate-${task.id}` ? "生成中" : "生成"}
                        </button>
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={4} className={`px-4 py-10 text-center ${theme.subText}`}>暂无审计任务</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <aside className={`rounded-lg border ${theme.cardBorder} ${theme.cardBg} p-4`}>
            {selectedTask ? (
              <div className="space-y-4">
                <div>
                  <div className={`text-xs ${theme.subText}`}>任务详情</div>
                  <h3 className={`mt-1 text-lg font-bold ${theme.heading}`}>{selectedTask.taskTypeLabel}</h3>
                  <p className={`mt-1 break-all text-xs ${theme.subText}`}>{selectedTask.url || selectedTask.suggestedUrl}</p>
                </div>
                <div className={`rounded-md border ${theme.cardBorder} p-3 text-xs ${theme.subText}`}>{selectedTask.recommendation || "无原始建议"}</div>
                {selectedTask.latestGeneration ? (
                  <div className="space-y-3">
                    <div className={`text-sm font-bold ${scoreTone(selectedTask.latestGeneration.qualityScore)}`}>质量分：{selectedTask.latestGeneration.qualityScore}</div>
                    <div>
                      <div className={`text-xs font-semibold ${theme.heading}`}>SEO Title</div>
                      <div className={`mt-1 text-xs ${theme.subText}`}>{selectedTask.latestGeneration.generated.seoTitle || "未生成"}</div>
                    </div>
                    <div>
                      <div className={`text-xs font-semibold ${theme.heading}`}>Meta Description</div>
                      <div className={`mt-1 text-xs ${theme.subText}`}>{selectedTask.latestGeneration.generated.metaDescription || "未生成"}</div>
                    </div>
                    {generatedSections(selectedTask.latestGeneration).map((section, index) => (
                      <div key={`${section.heading || section.type}-${index}`} className={`rounded-md border ${theme.cardBorder} p-3`}>
                        <div className={`text-xs font-semibold ${theme.heading}`}>{section.heading || section.type || `Section ${index + 1}`}</div>
                        <p className={`mt-1 whitespace-pre-wrap text-xs ${theme.subText}`}>{section.body || section.notes || ""}</p>
                      </div>
                    ))}
                    {selectedTask.latestGeneration.qualityIssues?.length ? (
                      <div className="space-y-1">
                        {selectedTask.latestGeneration.qualityIssues.map(issue => (
                          <div key={issue.code} className="rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">{issue.message}</div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className={`rounded-md bg-slate-50 p-3 text-xs ${theme.subText} dark:bg-slate-900`}>还没有生成建议。</div>
                )}
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => updateStatus(selectedTask, "approved")} className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white">已审核</button>
                  <button type="button" onClick={() => updateStatus(selectedTask, "needs_edit")} className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white">需修改</button>
                  <button type="button" onClick={() => updateStatus(selectedTask, "skipped")} className="rounded-md bg-slate-500 px-3 py-1.5 text-xs font-semibold text-white">暂不处理</button>
                  {["product_expand", "new_page_plan", "blog_refresh"].includes(selectedTask.taskType) && (
                    <button type="button" onClick={() => navigateTask(selectedTask)} className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold">跳转执行</button>
                  )}
                </div>
              </div>
            ) : (
              <div className={`p-8 text-center text-sm ${theme.subText}`}>选择任务后查看详情。</div>
            )}
          </aside>
        </section>
      </div>
    </div>
  );
};
```

- [ ] **Step 4: Run dashboard render test**

Run:

```bash
npm test -- src/tests/app-tabs.test.ts
```

Expected: PASS for the new dashboard test, with older tab tests still failing until Task 6 updates tab order.

---

### Task 6: App Navigation and Command Center Entry

**Files:**
- Modify: `appTabs.ts`
- Modify: `App.tsx`
- Modify: `components/CommandCenterDashboard.tsx`
- Modify: `src/tests/app-tabs.test.ts`

- [ ] **Step 1: Update tab test expectation**

In `src/tests/app-tabs.test.ts`, update the tab order assertion:

```typescript
assert.deepEqual(
  tabs.map(tab => tab.mode),
  ['commandCenter', 'seoAudit', 'image', 'blog', 'blogAi', 'blogFormat', 'pagePlanner', 'mediaOps', 'productSeo'],
);

const labelsByMode = new Map(tabs.map(tab => [tab.mode, tab.label]));
assert.equal(labelsByMode.get('seoAudit'), 'SEO审计');
```

Add to the static app markup test:

```typescript
assert.match(html, /data-testid="mode-tab-seoAudit"[^>]*shrink-0 whitespace-nowrap/);
```

- [ ] **Step 2: Run app tab tests and verify failure**

Run:

```bash
npm test -- src/tests/app-tabs.test.ts
```

Expected: FAIL because `seoAudit` mode is not registered in the app.

- [ ] **Step 3: Add `seoAudit` tab**

Modify `appTabs.ts`:

```typescript
export type AppViewMode = 'commandCenter' | 'seoAudit' | 'image' | 'blog' | 'blogAi' | 'blogFormat' | 'pagePlanner' | 'mediaOps' | 'productSeo';

export const APP_MODE_TABS: Array<{ mode: AppViewMode; label: string }> = [
  { mode: 'commandCenter', label: '中控台' },
  { mode: 'seoAudit', label: 'SEO审计' },
  { mode: 'image', label: '图片处理' },
  { mode: 'blog', label: '博客写作' },
  { mode: 'blogAi', label: '展会/证书/项目blog' },
  { mode: 'blogFormat', label: '批量修复Blog格式' },
  { mode: 'pagePlanner', label: '页面计划' },
  { mode: 'mediaOps', label: '媒体库SEO压缩' },
  { mode: 'productSeo', label: 'WooCommerce' },
];
```

- [ ] **Step 4: Wire `SeoAuditDashboard` in `App.tsx`**

Add import:

```typescript
import { SeoAuditDashboard } from './components/SeoAuditDashboard';
```

Update `renderModeIcon`:

```typescript
if (mode === 'seoAudit') return <IconDocumentText />;
```

Update overflow mode conditions to include `seoAudit` wherever `commandCenter`, `mediaOps`, `pagePlanner`, and `blogAi` are handled as scrollable full-page workspaces.

Add render block after command center:

```tsx
{viewMode === 'seoAudit' && (
  <SeoAuditDashboard
    theme={theme}
    onNavigate={handleCommandCenterNavigate}
  />
)}
```

- [ ] **Step 5: Add command-center audit card**

In `components/CommandCenterDashboard.tsx`, add a small card below the main score cards:

```tsx
<div className={`rounded-lg border ${theme.cardBorder} ${theme.cardBg} p-4`}>
  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
    <div>
      <div className={`text-sm font-semibold ${theme.heading}`}>SEO 审计任务</div>
      <p className={`mt-1 text-xs ${theme.subText}`}>上传审计表后，在独立工作台生成修复任务和 Gemini 建议。</p>
    </div>
    <button
      type="button"
      onClick={() => onNavigate?.("seoAudit")}
      className="inline-flex items-center justify-center gap-2 rounded-md bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-500"
    >
      <IconDocumentText className="size-4" /> 进入 SEO 审计
    </button>
  </div>
</div>
```

Also import `IconDocumentText` from `./Icons`.

- [ ] **Step 6: Run app tab tests**

Run:

```bash
npm test -- src/tests/app-tabs.test.ts
```

Expected: PASS.

---

### Task 7: Full Verification

**Files:**
- No source changes unless tests reveal issues.

- [ ] **Step 1: Run backend SEO audit tests**

Run:

```bash
python3 -m unittest backend.tests.test_seo_audit -v
```

Expected: PASS.

- [ ] **Step 2: Run related backend tests**

Run:

```bash
python3 -m unittest backend.tests.test_page_planner_history backend.tests.test_page_planner_helpers backend.tests.test_blog_ai backend.tests.test_seo_health -v
```

Expected: PASS.

- [ ] **Step 3: Run frontend tests**

Run:

```bash
npm test -- src/tests/app-tabs.test.ts src/tests/seo-audit-service.test.ts
```

Expected: PASS.

- [ ] **Step 4: Run production build**

Run:

```bash
npm run build
```

Expected: Vite build succeeds and emits `dist/` assets.

- [ ] **Step 5: Manual smoke path**

Run the backend and frontend using existing project scripts:

```bash
npm run dev:all
```

Expected: frontend and backend start. Open the printed Vite URL, click `SEO审计`, select the sample per-page CSV and keyword planning CSV, click `预览导入`, confirm that counts render, then stop before any WordPress-changing action. The first version must not auto-publish, auto-sync, or auto-noindex anything.
