# Page SEO Copy and Internal Links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add copy-ready page optimization and internal-link suggestions to the existing Page SEO panel.

**Architecture:** Extend the current Page SEO backend and frontend rather than creating a new workspace. The backend builds an allowed link pool without Blog posts, asks AI for structured copy blocks, and normalizes output. The frontend renders the result beside each selected page with quick-copy actions.

**Tech Stack:** FastAPI backend, Python unittest, React 19, TypeScript, Node test runner with `tsx`.

---

## File Structure

- Modify `backend/main.py`
  - Add Page SEO copy optimization payload, link candidate collector, AI prompt, normalizer, and endpoint.
- Modify `backend/tests/test_page_seo.py`
  - Add tests for Blog-link exclusion and normalized copy optimization output.
- Modify `services/pageSeoService.ts`
  - Add copy optimization types, validation, and API helper.
- Modify `components/PageSeoPanel.tsx`
  - Add generation mode, copy optimization rendering, and clipboard buttons.
- Modify or add frontend tests under `src/tests/`
  - Cover service path/validation and Page SEO panel source labels.

## Tasks

- [ ] Write failing backend tests for `/page-seo/optimize-copy`.
- [ ] Implement backend link candidate collection, prompt, output normalization, and endpoint.
- [ ] Run backend tests for Page SEO.
- [ ] Write failing frontend service and panel source tests.
- [ ] Implement frontend service types/helper.
- [ ] Implement Page SEO UI mode and quick-copy controls.
- [ ] Run focused frontend tests.
- [ ] Run build verification.

## Notes

This workspace currently has no `.git` directory, so commit checkpoints are not available here. Record changed files and verification results in the final response.
