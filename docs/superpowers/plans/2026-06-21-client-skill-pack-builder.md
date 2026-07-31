# Client Skill Pack Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first working version of customer-scoped Skill Pack creation, review, publish, and reuse status inside the existing SEO/WordPress app.

**Architecture:** Extend the existing customer profile and knowledge-source model instead of introducing a new tenancy system. Add backend endpoints for customer knowledge listing, source-type uploads, Skill Pack generation/list/update/publish/active reads, then add a React service and `Skill 工厂` dashboard that integrates with the app shell and command center. Keep the generated pack as structured JSON/text sections that are sent to Gemini later by existing AI workflows in a follow-up phase.

**Tech Stack:** FastAPI backend in `backend/main.py`, React 19 + TypeScript + Vite frontend, existing Node test runner, existing Python unittest/pytest-compatible backend tests.

---

## File Structure

- Modify `backend/main.py`: add Skill Pack normalization helpers, customer-scoped Skill Pack endpoints, active pack context helper, and source-type-aware customer knowledge list support.
- Create `services/skillPackService.ts`: typed frontend client for Skill Pack and customer knowledge endpoints.
- Create `components/SkillFactoryDashboard.tsx`: UI for selecting/uploading company/product/keyword files, generating drafts, editing sections, and publishing a pack.
- Modify `appTabs.ts`: add `skillFactory` app mode.
- Modify `App.tsx`: route the new mode, pass active customer profile data to the command center and Skill Factory, and surface Skill Pack status.
- Modify `components/CommandCenterDashboard.tsx`: render a customer Skill Pack status panel when profile data is provided.
- Modify `src/tests/skills-service.test.ts`: add service validation tests for Skill Pack responses.
- Modify `src/tests/app-tabs.test.ts`: assert the new app mode, route, and command-center customer status.
- Create `backend/tests/test_skill_packs.py`: backend behavior tests for customer knowledge source typing and Skill Pack draft/publish lifecycle.

## Task 1: Backend Skill Pack Lifecycle

**Files:**
- Modify: `backend/main.py`
- Create: `backend/tests/test_skill_packs.py`

- [ ] **Step 1: Write backend tests**

Add tests that create a client profile, import three knowledge sources with `sourceType` values `company`, `product`, and `keyword`, generate a Skill Pack draft with the AI generator monkey-patched, publish it, and verify the active pack is returned for the same customer only.

- [ ] **Step 2: Run backend tests and verify RED**

Run: `.venv/bin/python -m pytest backend/tests/test_skill_packs.py`

Expected: fail because Skill Pack endpoints do not exist.

- [ ] **Step 3: Implement backend helpers and endpoints**

Add customer-scoped helpers in `backend/main.py`:

- Normalize source types to `company`, `product`, `keyword`, or `general`.
- Normalize Skill Pack sections and status.
- Build a Gemini prompt from grouped source text.
- Generate a draft Skill Pack.
- List packs.
- Update pack content.
- Publish a pack and set `activeSkillPackId`.
- Return active pack.

- [ ] **Step 4: Run backend tests and verify GREEN**

Run: `.venv/bin/python -m pytest backend/tests/test_skill_packs.py`

Expected: pass.

## Task 2: Frontend Service Layer

**Files:**
- Create: `services/skillPackService.ts`
- Modify: `src/tests/skills-service.test.ts`

- [ ] **Step 1: Write service tests**

Add validation tests for:

- malformed Skill Pack list response
- malformed knowledge source response
- successful list/generate/publish request URLs

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test -- src/tests/skills-service.test.ts`

Expected: fail because `skillPackService.ts` does not exist.

- [ ] **Step 3: Implement `skillPackService.ts`**

Create typed functions:

- `fetchClientKnowledgeSources(profileId, apiBase)`
- `importClientKnowledgeFile(profileId, file, sourceType, label, apiBase)`
- `fetchSkillPacks(profileId, apiBase)`
- `generateSkillPack(profileId, apiBase)`
- `updateSkillPack(profileId, packId, payload, apiBase)`
- `publishSkillPack(profileId, packId, apiBase)`
- `fetchActiveSkillPack(profileId, apiBase)`

- [ ] **Step 4: Run tests and verify GREEN**

Run: `npm test -- src/tests/skills-service.test.ts`

Expected: pass.

## Task 3: Skill Factory Dashboard

**Files:**
- Create: `components/SkillFactoryDashboard.tsx`
- Modify: `src/tests/app-tabs.test.ts`

- [ ] **Step 1: Write render/source tests**

Assert that the new dashboard renders:

- `客户资料 / Skills`
- `公司信息`
- `产品信息`
- `产品关键词`
- `生成 Skill Pack`
- `发布 Skill Pack`

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test -- src/tests/app-tabs.test.ts`

Expected: fail because the component and app mode are missing.

- [ ] **Step 3: Implement dashboard**

Build a focused dashboard that:

- Lists uploaded customer knowledge by source type.
- Uploads one file at a time with selected source type.
- Generates a draft Skill Pack.
- Displays editable textareas for company/product/keyword/task sections.
- Publishes the selected draft.
- Shows active published Skill Pack status.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `npm test -- src/tests/app-tabs.test.ts`

Expected: pass.

## Task 4: App Shell And Command Center Integration

**Files:**
- Modify: `appTabs.ts`
- Modify: `App.tsx`
- Modify: `components/CommandCenterDashboard.tsx`
- Modify: `src/tests/app-tabs.test.ts`

- [ ] **Step 1: Write integration tests**

Assert that:

- `APP_MODE_TABS` includes `skillFactory`.
- `App.tsx` lazy-loads `SkillFactoryDashboard`.
- Command center receives active profile and can render `客户 Skill Pack`.
- The left navigation includes `客户资料 / Skills`.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test -- src/tests/app-tabs.test.ts`

Expected: fail because integration is missing.

- [ ] **Step 3: Implement integration**

Add the app tab and route. Pass `activeClientProfile`, `activeProfileId`, `settings.backendUrl`, and a profile refresh callback to `SkillFactoryDashboard`. Add a compact command-center status panel for service customer, site, source counts, and Skill Pack status.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npm test -- src/tests/app-tabs.test.ts src/tests/skills-service.test.ts`

Expected: pass.

## Task 5: Build Verification

**Files:**
- No new files.

- [ ] **Step 1: Run frontend build**

Run: `npm run build:web`

Expected: Vite build completes.

- [ ] **Step 2: Run focused backend test**

Run: `.venv/bin/python -m pytest backend/tests/test_skill_packs.py`

Expected: pass.

- [ ] **Step 3: Record limitations**

If the full test suite is too slow or blocked by environment settings, record exactly which focused tests were run and which broader verification was not run.
