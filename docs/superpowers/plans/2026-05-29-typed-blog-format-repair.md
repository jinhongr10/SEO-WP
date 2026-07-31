# Typed Blog Format Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Blog type filtering and type-aware repair profiles to bulk Blog format repair.

**Architecture:** Backend owns type detection, filtering, preview profile selection, and apply-time type tag sync. Frontend exposes a compact Blog type selector and displays returned type badges. Service helpers pass `blogType` through existing API calls.

**Tech Stack:** React 19, TypeScript, Node test runner, FastAPI/Python unittest.

---

### Task 1: Backend Type Detection and Profiles

**Files:**
- Modify: `backend/main.py`
- Test: `backend/tests/test_blog_ai.py`

- [ ] Write failing tests for `_blog_bulk_format_type`, `_blog_format_profile`, and `_blog_append_cta_if_missing`.
- [ ] Run `python3 -m unittest backend.tests.test_blog_ai` and confirm failure.
- [ ] Implement supported type constants, term extraction, type detection, profile labels, and type-specific CTA text.
- [ ] Run `python3 -m unittest backend.tests.test_blog_ai` and confirm pass.

### Task 2: Backend Bulk Format API

**Files:**
- Modify: `backend/main.py`
- Test: `backend/tests/test_blog_rest_queries.py`

- [ ] Write failing tests proving `/blog/bulk-format/posts` filters by `blogType` and preview uses type profile.
- [ ] Run `python3 -m unittest backend.tests.test_blog_rest_queries` and confirm failure.
- [ ] Add `blogType` to list and preview payloads, return type metadata, and include type on apply auto-tag sync.
- [ ] Run `python3 -m unittest backend.tests.test_blog_rest_queries` and confirm pass.

### Task 3: Frontend Services and UI

**Files:**
- Modify: `services/blogPublishService.ts`
- Modify: `components/BlogFormatDashboard.tsx`
- Test: `src/tests/app-tabs.test.ts`
- Test: create `src/tests/blog-publish-service.test.ts`

- [ ] Write failing service tests for `fetchBulkFormatBlogPosts(..., blogType)` and `previewBulkFormatBlogPosts({ blogType })`.
- [ ] Write failing UI smoke test for `Blog 类型`, `展会 Blog`, and `普通 Blog`.
- [ ] Implement service parameter pass-through and dashboard type selector/badges.
- [ ] Run `node --import tsx --test src/tests/blog-publish-service.test.ts src/tests/app-tabs.test.ts` and confirm pass.

### Task 4: Verification

**Files:**
- Verify: backend tests, frontend tests, build, browser

- [ ] Run `python3 -m unittest backend.tests.test_blog_ai backend.tests.test_blog_rest_queries`.
- [ ] Run `npm test`.
- [ ] Run `npm run build`.
- [ ] Verify in Browser at `http://127.0.0.1:3003/`: selector renders, type filter can be changed, scan request includes `blogType`, and no framework overlay appears.
