# Editor-Friendly Blog Format Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an editor-friendly blog formatting system with a standalone bulk repair module, shared publish-prep formatting, WordPress styling plugin, and Markdown format guide.

**Architecture:** Extract blog formatting into `backend/blog_formatting.py` so it can be tested independently and reused by both single-post publish-prep and batch repair endpoints. Add lightweight REST endpoints in `backend/main.py`, TypeScript service helpers, and a top-level React module for scan-preview-apply workflows.

**Tech Stack:** FastAPI, Python unittest, React/TypeScript, WordPress REST API, Gutenberg block comments, WordPress plugin PHP/CSS.

---

### Task 1: Formatter

**Files:**
- Create: `backend/blog_formatting.py`
- Test: `backend/tests/test_blog_formatting.py`
- Modify: `backend/main.py`

- [ ] Write failing tests for Markdown tables, heading normalization, block comments, and warning detection.
- [ ] Run `python3 -m unittest backend.tests.test_blog_formatting -v` and confirm failures are from missing formatter functions.
- [ ] Implement editor-friendly formatter helpers in `backend/blog_formatting.py`.
- [ ] Wire `/blog/optimize` through the formatter.
- [ ] Re-run formatter tests and confirm pass.

### Task 2: Batch API

**Files:**
- Modify: `backend/main.py`
- Test: `backend/tests/test_blog_formatting.py`

- [ ] Add payload models for list, preview, and apply.
- [ ] Add `GET /blog/bulk-format/posts`.
- [ ] Add `POST /blog/bulk-format/preview`.
- [ ] Add `POST /blog/bulk-format/apply`.
- [ ] Save pre-update backups under `data/blog_format_backups/<run-id>/post-<id>.json`.
- [ ] Add tests for preview item summaries and backup payload construction.

### Task 3: Frontend Module

**Files:**
- Modify: `appTabs.ts`
- Modify: `App.tsx`
- Modify: `services/blogPublishService.ts`
- Test: `src/tests/app-tabs.test.ts`

- [ ] Add top-level tab `blogFormat` with label `批量修复Blog格式`.
- [ ] Add service functions for listing posts, previewing selected posts, and applying selected previews.
- [ ] Add React state and UI for status filter, scan, selection, preview cards, and apply confirmation.
- [ ] Update navigation tests to include the new tab.
- [ ] Run `npm test`.

### Task 4: WordPress Styling Plugin

**Files:**
- Create: `wordpress-plugins/demo-brand-blog-layout/demo-brand-blog-layout.php`
- Create: `wordpress-plugins/demo-brand-blog-layout/assets/blog-layout.css`
- Create: `wordpress-plugins/demo-brand-blog-layout/assets/editor-blog-layout.css`

- [ ] Create a plugin that enqueues front-end CSS only on posts.
- [ ] Enqueue editor CSS in Gutenberg admin.
- [ ] Keep selectors scoped to `.single-post` and editor content areas.
- [ ] Build `wordpress-plugins/demo-brand-blog-layout.zip`.

### Task 5: Format Guide

**Files:**
- Create: `docs/blog-format-guidelines.md`

- [ ] Document font family, body width, heading sizes, line heights, spacing, table style, image/caption style, CTA style, and editor rules.
- [ ] Include "do not use" rules for inline styling, Elementor layout content, and pasted table-like plain text.

### Task 6: Verification

**Files:**
- All changed files.

- [ ] Run `python3 -m unittest backend.tests.test_blog_formatting -v`.
- [ ] Run `npm test`.
- [ ] Run `npm run build`.
- [ ] Report any unavailable checks or environmental blockers.

## Self-Review

- Spec coverage: formatter, batch module, publish-prep integration, WordPress CSS, and Markdown guide are covered.
- Placeholder scan: no TODO/TBD placeholders are present.
- Type consistency: frontend service names and backend endpoint names are aligned around `bulk-format`.
