# Page Planner HTML Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-page HTML construction brief export for page planner results, with explicit Elementor heading levels, detailed section guidance, image guidance, internal link placement, and a 1,000+ word target.

**Architecture:** Keep export generation in the browser. Extend backend normalization and prompt shape so new AI responses carry richer section details, while preserving compatibility with existing short outline responses.

**Tech Stack:** Python FastAPI helper tests with pytest, React + TypeScript front end, browser Blob download.

---

### Task 1: Backend Rich Outline Normalization

**Files:**
- Modify: `backend/page_planner.py`
- Modify: `backend/tests/test_page_planner_helpers.py`

- [ ] **Step 1: Write failing tests**

Add tests that call `normalize_page_planner_response` with a section containing `headingLevel`, `elementorWidget`, `elementorLayout`, `sectionPurpose`, `writingBrief`, `suggestedCopy`, `imageBrief`, `imageAlt`, `subheadings`, and `internalLinkAnchors`. Assert that all fields survive normalization and that nested internal links are restricted to the provided candidates.

- [ ] **Step 2: Run the targeted test**

Run: `python3 -m pytest backend/tests/test_page_planner_helpers.py -q`

Expected before implementation: the new assertions fail because normalized sections only include `heading`, `details`, and `assets`.

- [ ] **Step 3: Implement normalization**

Update `_normalize_outline` to include the richer fields. Add helpers for heading levels, section internal links, and subheadings. Keep the old fields intact.

- [ ] **Step 4: Re-run targeted tests**

Run: `python3 -m pytest backend/tests/test_page_planner_helpers.py -q`

Expected after implementation: all tests pass.

### Task 2: Prompt Rich Construction Briefs

**Files:**
- Modify: `backend/page_planner.py`

- [ ] **Step 1: Update prompt JSON shape**

Ask the AI to return detailed construction briefs with `H1`, `H2`, `H3`, Elementor widget names, section purpose, writing brief, suggested copy, image brief, image alt, and section internal links.

- [ ] **Step 2: Preserve no-HTML rule**

Keep the prompt explicit that it should return JSON only and not finished Elementor HTML.

### Task 3: Frontend Types and HTML Export

**Files:**
- Modify: `services/pagePlannerService.ts`
- Modify: `components/PagePlannerDashboard.tsx`

- [ ] **Step 1: Extend TypeScript types**

Add interfaces for section subheadings and section-level internal links.

- [ ] **Step 2: Add HTML escaping and word-count helpers**

Add local helper functions in `PagePlannerDashboard.tsx` for escaping text, counting words, generating a slug-based HTML filename, and downloading a Blob.

- [ ] **Step 3: Build selected-plan HTML**

Generate a standalone HTML document with page overview, hero `H1`, section `H2` cards, optional `H3` subheading rows, detailed copy guidance, image briefs, section link tables, FAQ, CTA, and global internal links.

- [ ] **Step 4: Add the Export HTML button**

Place the button near `Copy`, use the existing icon style, and call the selected-plan export handler.

### Task 4: Frontend Rendering Compatibility

**Files:**
- Modify: `components/PagePlannerDashboard.tsx`

- [ ] **Step 1: Display richer fields when present**

Inside each section card, show heading level, widget, layout, writing brief, suggested copy, image brief, alt text, subheadings, and section internal links if available.

- [ ] **Step 2: Preserve old display**

If an older plan only has `details` and `assets`, continue rendering those fields without errors.

### Task 5: Verification

**Files:**
- Read: package scripts and test output

- [ ] **Step 1: Run backend tests**

Run: `python3 -m pytest backend/tests/test_page_planner_helpers.py -q`

- [ ] **Step 2: Run frontend build**

Run: `npm run build`

- [ ] **Step 3: Report evidence**

Report exact verification commands and whether they passed or failed.
