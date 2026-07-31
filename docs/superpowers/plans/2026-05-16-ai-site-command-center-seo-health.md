# AI Site Command Center SEO Health Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first-version `中控台` tab with rule-based SEO health scoring for products, media, blogs, and page planner results.

**Architecture:** Add a FastAPI `/seo-health/summary` endpoint that reads existing SQLite/WordPress data and returns deterministic score groups plus prioritized issues. Add a small frontend service and dashboard component, then register a new top-level app tab that can navigate to existing workspaces.

**Tech Stack:** FastAPI, SQLite, React, TypeScript, Vite, Node test runner, Python unittest.

---

### Task 1: Backend SEO Health Scoring

**Files:**
- Modify: `backend/main.py`
- Test: `backend/tests/test_seo_health.py`

- [ ] Write failing Python tests for product, media, page planner, and weighted score helpers.
- [ ] Run `python3 -m unittest backend.tests.test_seo_health -v` and verify the tests fail because helpers are missing.
- [ ] Implement small scoring helpers in `backend/main.py`: `_health_label`, `_score_from_issues`, `_combine_health_groups`, `_score_product_health_items`, `_score_media_health_items`, and `_score_page_planner_history_items`.
- [ ] Add `GET /seo-health/summary`, returning partial results when one source fails.
- [ ] Run `python3 -m unittest backend.tests.test_seo_health -v` and verify the tests pass.

### Task 2: Frontend Service and Dashboard

**Files:**
- Create: `services/seoHealthService.ts`
- Create: `components/CommandCenterDashboard.tsx`
- Test: `src/tests/seo-health-dashboard.test.ts`

- [ ] Write failing Node tests for the service types, dashboard rendering of score groups, issue severity labels, empty state, and action callbacks.
- [ ] Run `npm run test -- src/tests/seo-health-dashboard.test.ts` and verify the tests fail because files are missing.
- [ ] Implement `fetchSeoHealthSummary` and the dashboard component.
- [ ] Keep rendering deterministic, avoid inline child component definitions, and use primitive effect dependencies.
- [ ] Run `npm run test -- src/tests/seo-health-dashboard.test.ts` and verify the tests pass.

### Task 3: App Navigation Integration

**Files:**
- Modify: `appTabs.ts`
- Modify: `App.tsx`
- Modify: `src/tests/app-tabs.test.ts`

- [ ] Update the existing navigation test to expect `commandCenter` as the first tab.
- [ ] Run `npm run test -- src/tests/app-tabs.test.ts` and verify the test fails before integration.
- [ ] Add `commandCenter` to `AppViewMode` and `APP_MODE_TABS`.
- [ ] Import and render `CommandCenterDashboard` in `App.tsx`.
- [ ] Wire command center action buttons to `setViewMode`.
- [ ] Run `npm run test -- src/tests/app-tabs.test.ts` and verify it passes.

### Task 4: Full Verification

**Files:**
- No new files.

- [ ] Run `python3 -m unittest backend.tests.test_seo_health -v`.
- [ ] Run `npm run test -- src/tests/seo-health-dashboard.test.ts src/tests/app-tabs.test.ts`.
- [ ] Run `npm run build`.
- [ ] Report any blocked verification exactly, with command output summary.
