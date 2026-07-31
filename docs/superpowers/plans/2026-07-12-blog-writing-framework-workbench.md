# Blog Writing Framework AI Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the direct Blog framework field editor with a versioned, site-scoped AI workbench that starts from five immutable built-in frameworks and previews each framework as a complete article-generation blueprint before saving.

**Architecture:** Keep `BlogFramework` as the reusable article-generation unit, extend it with explicit task, audience, voice, evidence, and preflight rules, and wrap the five-item collection in a versioned `BlogFrameworkStandard`. Backend endpoints own defaults, migration, AI validation, and versioning; a focused React workbench owns drafts, conversation, comparison, reset, and advanced editing. The existing `blogFrameworks` field and endpoints remain as a one-cycle compatibility projection of the active standard.

**Tech Stack:** React 19, TypeScript 5.8, Arco Design React, FastAPI/Pydantic, Gemini/Vertex AI helpers, Node test runner, Python unittest, Playwright.

## Global Constraints

- Read and follow `design-system/MASTER.md`; there is no page-specific exception for this workbench.
- Preserve all unrelated dirty-worktree changes; stage and commit only files touched by the current task.
- Keep Electron's 1100px minimum width; mobile layouts below 1100px are out of scope.
- Dynamic text in Flex/Grid layouts must have a shrinkable `min-width: 0` ancestor.
- Use `OverflowText`, `ActionGroup`, and `Toolbar` from `components/ui`; all intentional scroll areas require `data-overflow-policy`.
- Do not add `whitespace-nowrap`, page-level horizontal clipping, or fixed dynamic-content widths/heights.
- Draft and assistant endpoints must perform zero profile writes; only the explicit save endpoint may increment and persist a version.
- Run `npm run verify:ui` before completion.

---

### Task 1: Versioned backend framework standard and five complete built-in presets

**Files:**
- Modify: `backend/main.py`
- Test: `backend/tests/test_client_profiles.py`

**Interfaces:**
- Produces: `_default_blog_frameworks(template_pack=None) -> list[dict[str, Any]]` with five immutable normalized presets.
- Produces: `_normalize_blog_framework_standard(value, *, legacy_frameworks=None, template_pack=None) -> dict[str, Any]`.
- Produces: `GET /site-profiles/{site_id}/blog-framework-standard` returning `{ok, standard, presets}`.
- Preserves: legacy `blogFrameworks` as `standard.frameworks` in normalized profile responses.

- [ ] **Step 1: Add failing backend tests for defaults, legacy migration, and zero-write reads**

Add tests that assert the exact standard envelope and the six-layer framework fields:

```python
def test_blog_framework_standard_defaults_to_five_immutable_presets(self):
    with tempfile.TemporaryDirectory() as tmpdir:
        self._patch_profile_paths(tmpdir)
        client = TestClient(backend_main.app)
        site = client.post("/site-profiles", json={"siteName": "Framework Site"}).json()["site"]

        result = client.get(f"/site-profiles/{site['id']}/blog-framework-standard").json()

        self.assertEqual(result["standard"]["status"], "default")
        self.assertEqual(result["standard"]["version"], 0)
        self.assertEqual([item["articleType"] for item in result["presets"]], [
            "standard", "exhibition", "certificate", "project", "video",
        ])
        buyer = result["standard"]["frameworks"][0]
        self.assertEqual(buyer["funnelStage"], "consideration-decision")
        self.assertEqual(buyer["wordCount"], {"min": 1200, "max": 1800})
        self.assertTrue(buyer["voiceRules"])
        self.assertTrue(buyer["evidenceRules"])
        self.assertTrue(buyer["preflightChecks"])

def test_blog_framework_standard_wraps_legacy_frameworks_as_configured_v1(self):
    legacy = backend_main._default_blog_frameworks()[:1]
    standard = backend_main._normalize_blog_framework_standard({}, legacy_frameworks=legacy)
    self.assertEqual(standard["status"], "configured")
    self.assertEqual(standard["version"], 1)
    self.assertEqual(standard["frameworks"][0]["id"], legacy[0]["id"])
```

- [ ] **Step 2: Run the targeted tests and verify they fail**

Run: `.venv/bin/python -m unittest backend.tests.test_client_profiles.ClientProfileTests.test_blog_framework_standard_defaults_to_five_immutable_presets backend.tests.test_client_profiles.ClientProfileTests.test_blog_framework_standard_wraps_legacy_frameworks_as_configured_v1`

Expected: FAIL because the standard normalizer and endpoint do not exist.

- [ ] **Step 3: Extend and normalize the framework schema**

Add these fields to every normalized framework, with safe defaults for old records:

```python
{
    "contentGoal": str,
    "funnelStage": str,
    "defaultLanguage": str,
    "targetAudience": str,
    "wordCount": {"min": int, "max": int},
    "voiceRules": list[str],
    "evidenceRules": list[str],
    "preflightChecks": list[str],
}
```

Use the PDF-informed buyer-guide defaults exactly as follows:

```python
"contentGoal": "Help B2B buyers evaluate fit, compare verified options, and prepare a qualified inquiry.",
"funnelStage": "consideration-decision",
"defaultLanguage": "English",
"targetAudience": "B2B buyers, procurement teams, partners, and project decision-makers",
"wordCount": {"min": 1200, "max": 1800},
"voiceRules": [
    "Use a professional but accessible tone and explain technical terms in plain language.",
    "Prefer active voice, varied sentence length, compact paragraphs, and logical transitions.",
    "Do not force casual filler, rhetorical questions, or emotional language into technical sections.",
    "Avoid stock AI phrases such as in today's world, dive into, unlock, and unleash.",
],
"evidenceRules": [
    "Use product specifications, approved site materials, approved FAQs, and indexed URLs as evidence.",
    "Mark a source gap instead of inventing models, certification, performance, price, lead time, or customer facts.",
    "Create comparison tables only when verified comparable data exists.",
],
"preflightChecks": [
    "The opening directly answers the buyer's question.",
    "Every factual claim is supported by available site evidence.",
    "Internal links come from the validated index and approved FAQs remain unchanged.",
    "The CTA matches the article goal and asks only for information the business can use.",
],
```

Keep AIDA out of the mandatory outline; store it only as optional topic-planning context through `funnelStage`.

- [ ] **Step 4: Add the standard normalizer and read endpoint**

Implement:

```python
def _normalize_blog_framework_standard(
    value: Any,
    *,
    legacy_frameworks: Any = None,
    template_pack: Optional[dict[str, str]] = None,
) -> dict[str, Any]:
    raw = value if isinstance(value, dict) else {}
    has_saved = bool(raw.get("frameworks"))
    has_legacy = isinstance(legacy_frameworks, list) and bool(legacy_frameworks)
    frameworks = _normalize_blog_frameworks(
        raw.get("frameworks") if has_saved else (legacy_frameworks if has_legacy else []),
        template_pack,
    )
    return {
        "status": "configured" if has_saved or has_legacy else "default",
        "version": max(1, int(raw.get("version") or 1)) if has_saved or has_legacy else 0,
        "basePresetVersion": max(1, int(raw.get("basePresetVersion") or 1)),
        "name": str(raw.get("name") or "站点博客撰写框架"),
        "frameworks": frameworks,
        "updatedAt": str(raw.get("updatedAt") or ""),
    }
```

Return deep normalized copies of `_default_blog_frameworks()` as `presets`; never return a mutable module-level list.

- [ ] **Step 5: Project the standard through site profile normalization**

In `_normalize_client_profile`, compute the standard once, return it as `blogFrameworkStandard`, and set legacy `blogFrameworks` to `standard["frameworks"]`. New site creation must store no configured standard; existing raw `blogFrameworks` data becomes configured v1.

- [ ] **Step 6: Run backend profile tests**

Run: `.venv/bin/python -m unittest backend.tests.test_client_profiles`

Expected: PASS.

- [ ] **Step 7: Commit the backend model slice**

```bash
git add backend/main.py backend/tests/test_client_profiles.py
git commit -m "feat: add versioned blog framework standard"
```

---

### Task 2: Real AI draft endpoint with whitelist validation and explicit save versioning

**Files:**
- Modify: `backend/main.py`
- Test: `backend/tests/test_client_profiles.py`

**Interfaces:**
- Consumes: `_normalize_blog_framework_standard` and `_parse_ai_json_object`.
- Produces: `POST /site-profiles/{site_id}/blog-framework-standard/assistant`.
- Produces: `PUT /site-profiles/{site_id}/blog-framework-standard`.
- Produces assistant response `{ok, standard, reply, changes, warnings, clarification?}`.

- [ ] **Step 1: Add failing tests for AI isolation, zero writes, clarification, errors, and saves**

Cover these cases with patched `_gemini_generate_text` and `_ai_configured`:

```python
def test_blog_framework_assistant_changes_only_selected_framework_without_writing(self):
    before = client.get(f"/site-profiles/{site_id}/blog-framework-standard").json()["standard"]
    ai_payload = {
        "reply": "已把开头改为直接回答。",
        "framework": {**before["frameworks"][0], "voiceRules": ["Open with a direct answer."]},
        "warnings": [],
    }
    with patch.object(backend_main, "_ai_configured", return_value=True), patch.object(
        backend_main, "_gemini_generate_text", return_value=json.dumps(ai_payload, ensure_ascii=False)
    ):
        response = client.post(f"/site-profiles/{site_id}/blog-framework-standard/assistant", json={
            "frameworkId": before["frameworks"][0]["id"],
            "message": "开头直接一点",
            "standard": before,
            "conversation": [],
        })
    result = response.json()
    self.assertEqual(result["standard"]["frameworks"][1:], before["frameworks"][1:])
    self.assertTrue(result["changes"])
    persisted = client.get(f"/site-profiles/{site_id}/blog-framework-standard").json()["standard"]
    self.assertEqual(persisted["version"], 0)

def test_blog_framework_standard_save_increments_server_version(self):
    draft = client.get(f"/site-profiles/{site_id}/blog-framework-standard").json()["standard"]
    draft["version"] = 99
    saved = client.put(f"/site-profiles/{site_id}/blog-framework-standard", json={"standard": draft}).json()["standard"]
    self.assertEqual(saved["version"], 1)
    self.assertEqual(saved["status"], "configured")
```

Also assert: empty message returns 400; missing AI configuration returns the existing configuration error; unknown `frameworkId` returns 404; malformed AI JSON returns 502 and preserves the draft; an ambiguous “这篇以后都这样写” response may include one `clarification`, but a conversation already containing an assistant clarification must not request a second clarification.

- [ ] **Step 2: Run the assistant tests and verify they fail**

Run: `.venv/bin/python -m unittest backend.tests.test_client_profiles.ClientProfileTests.test_blog_framework_assistant_changes_only_selected_framework_without_writing backend.tests.test_client_profiles.ClientProfileTests.test_blog_framework_standard_save_increments_server_version`

Expected: FAIL because the new endpoints are absent.

- [ ] **Step 3: Replace the deterministic keyword assistant with a structured AI prompt**

Add `SiteBlogFrameworkStandardAssistantPayload` with `frameworkId`, `message`, `standard`, and `conversation`. The prompt must state:

```text
Edit only the selected site-level Blog framework.
Return one complete normalized framework, a short Chinese reply, warnings, and optional clarification.
Preserve facts and IDs. Do not edit other frameworks or version fields.
Treat AIDA as funnel context, not a mandatory outline.
Use the six-layer blueprint: task, required evidence, voice/readability, ordered structure, SEO/media rules, preflight/prohibited claims.
Do not impose fixed Flesch 80, exactly five FAQs, filler phrases, deliberate imperfections, or unsupported trends.
Return ONLY valid JSON.
```

Call `_gemini_generate_text(_get_gemini_api_key(), prompt, _ai_pro_model(), timeout=120)` and route failures through `_raise_ai_error`.

- [ ] **Step 4: Whitelist and diff the AI result**

Normalize the returned `framework`, force its `id` to the selected ID, replace only that list position, and compute field-level changes recursively. Exclude unchanged fields and return paths such as `frameworks.standard.voiceRules.0`. Reject empty or structurally invalid results with HTTP 502.

- [ ] **Step 5: Add explicit save behavior and legacy synchronization**

The PUT endpoint must ignore the client version, derive `next_version = current.version + 1`, set `configured` and `updatedAt`, persist `profile["blogFrameworkStandard"]`, and synchronize `profile["blogFrameworks"]`. The old `PUT /blog-frameworks` remains available and internally saves a new standard version.

- [ ] **Step 6: Run backend tests**

Run: `.venv/bin/python -m unittest backend.tests.test_client_profiles backend.tests.test_blog_ai`

Expected: PASS, including existing Blog AI prompt tests.

- [ ] **Step 7: Commit the API slice**

```bash
git add backend/main.py backend/tests/test_client_profiles.py backend/tests/test_blog_ai.py
git commit -m "feat: add AI blog framework draft workflow"
```

---

### Task 3: Typed client service and compatibility validation

**Files:**
- Modify: `services/clientProfileService.ts`
- Test: `src/tests/client-profile-service.test.ts`

**Interfaces:**
- Produces: exported `BlogFrameworkStandard`, `BlogFrameworkChange`, `BlogFrameworkStandardResult`, and `BlogFrameworkAssistantResult` types.
- Produces: `fetchBlogFrameworkStandard`, `reviseBlogFrameworkStandard`, and `saveBlogFrameworkStandard`.
- Preserves: `defaultBlogFrameworks`, `saveBlogFrameworks`, and `SiteProfile.blogFrameworks`.

- [ ] **Step 1: Add failing service tests for GET, assistant, save, and legacy projection**

Use the existing fetch-stub style and assert exact URLs and bodies:

```ts
const loaded = await service.fetchBlogFrameworkStandard('site-a', '/api');
const revised = await service.reviseBlogFrameworkStandard(
  'site-a', 'standard', '开头直接回答', loaded.standard, [], '/api',
);
const saved = await service.saveBlogFrameworkStandard('site-a', revised.standard, '/api');

assert.equal(calls[0].url, '/api/site-profiles/site-a/blog-framework-standard');
assert.deepEqual(JSON.parse(String(calls[1].init?.body)), {
  frameworkId: 'standard', message: '开头直接回答', standard: loaded.standard, conversation: [],
});
assert.equal(calls[2].init?.method, 'PUT');
```

Also assert that invalid `changes`, invalid `wordCount`, or a missing five-preset response throws a descriptive validation error, while an old profile containing only `blogFrameworks` still validates.

- [ ] **Step 2: Run the service tests and verify they fail**

Run: `node --import tsx --test src/tests/client-profile-service.test.ts`

Expected: FAIL because the standard types and functions do not exist.

- [ ] **Step 3: Extend the public TypeScript model**

Add to `BlogFramework`:

```ts
contentGoal: string;
funnelStage: string;
defaultLanguage: string;
targetAudience: string;
wordCount: { min: number; max: number };
voiceRules: string[];
evidenceRules: string[];
preflightChecks: string[];
```

Add the standard and response types exactly as specified by the design, plus:

```ts
export interface BlogFrameworkStandardResult {
  standard: BlogFrameworkStandard;
  presets: BlogFramework[];
}
```

- [ ] **Step 4: Implement strict validators and service calls**

Normalize legacy fields with defaults, but require the new endpoint envelope to contain `standard` and five `presets`. Validate assistant changes as `{path,label,before,after,reason}`. Remove the old `scope`/single-created-framework contract from `generateBlogFrameworkDraftFromBrief`; keep that function as a deprecated wrapper only if another caller remains after Task 5.

- [ ] **Step 5: Project the new standard in `validateSiteProfile`**

Add `blogFrameworkStandard` to `SiteProfile`. When it is absent, derive it from the validated legacy `blogFrameworks`; when present, use its frameworks for the legacy `blogFrameworks` property so all existing Blog AI consumers see the active standard.

- [ ] **Step 6: Run service and type tests**

Run: `node --import tsx --test src/tests/client-profile-service.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 7: Commit the client contract slice**

```bash
git add services/clientProfileService.ts src/tests/client-profile-service.test.ts
git commit -m "feat: type blog framework standards"
```

---

### Task 4: Focused three-column framework workbench

**Files:**
- Create: `components/BlogFrameworkStandardWorkbench.tsx`
- Modify: `src/styles.css`
- Create: `src/tests/blog-framework-standard-workbench.test.ts`

**Interfaces:**
- Consumes: Task 3 service functions and types.
- Produces: `BlogFrameworkStandardWorkbench` with props `{profileId, backendUrl, initialStandard?, theme, onSaved?}`.

- [ ] **Step 1: Add failing source-contract tests for the agreed UX**

Assert that the focused component contains the visible contracts and shared layout primitives:

```ts
test('framework workbench shows an article blueprint instead of a field summary', async () => {
  const source = await readFile(new URL('../../components/BlogFrameworkStandardWorkbench.tsx', import.meta.url), 'utf8');
  assert.match(source, /AI 最终按这张施工图生成文章/);
  assert.match(source, /生成前必须提供/);
  assert.match(source, /文章标题 H1/);
  assert.match(source, /开头：直接回答/);
  assert.match(source, /FAQ/);
  assert.match(source, /结尾 CTA/);
  assert.match(source, /发布前检查/);
  assert.match(source, /禁止编造/);
  assert.match(source, /已保存框架/);
  assert.match(source, /AI 修改后/);
  assert.match(source, /恢复内置默认/);
  assert.match(source, /高级设置/);
  assert.match(source, /Toolbar|ActionGroup|OverflowText/);
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `node --import tsx --test src/tests/blog-framework-standard-workbench.test.ts`

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Build isolated draft state and actions**

The component state must include `saved`, `draft`, `presets`, `activeFrameworkId`, `conversationByFramework`, `changesByFramework`, `previewMode`, `message`, `busy`, `notice`, and `error`. Implement immutable helpers for replacing one framework, restoring the active preset, undoing the last assistant turn, and detecting dirty state with a stable normalized comparison.

- [ ] **Step 4: Build the agreed three-column layout**

Use:

```tsx
<div className="blog-framework-workbench__grid">
  <aside>{/* five framework selectors and custom frameworks */}</aside>
  <section>{/* current-framework conversation */}</section>
  <section>{/* ordered article blueprint */}</section>
</div>
```

The blueprint renders task metadata, required inputs/evidence, H1, direct-answer opening, ordered `outlineBlocks`, conditional comparison/table guidance, FAQ, internal links/media, CTA, preflight checks, and prohibited claims in generation order. Use field paths from `changesByFramework` to mark only changed cards.

- [ ] **Step 5: Add comparison, reset, undo, save, and advanced editing**

“已保存框架” uses the same active ID from `saved`; “AI 修改后” uses `draft`. Reset copies the matching preset into the draft while preserving the site framework ID. Save calls `saveBlogFrameworkStandard`, then replaces both saved and draft and clears change/conversation history. Advanced settings edits every public framework field, including word-count bounds and the three rule arrays.

- [ ] **Step 6: Add layout-safe CSS**

At widths at least 1280px use:

```css
.blog-framework-workbench__grid {
  display: grid;
  grid-template-columns: minmax(168px, .42fr) minmax(280px, .78fr) minmax(0, 1.4fr);
  gap: 16px;
  min-width: 0;
}
```

At 1100–1279px stack the blueprint below a two-column selector/conversation row; do not create a mobile breakpoint. Give only the conversation history and long blueprint body `data-overflow-policy="y-scroll"`, with max-height derived from the desktop viewport rather than a fixed content height.

- [ ] **Step 7: Run component and layout-contract tests**

Run: `node --import tsx --test src/tests/blog-framework-standard-workbench.test.ts src/tests/ui-layout-contract.test.ts src/tests/ui-layout-components.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit the workbench slice**

```bash
git add components/BlogFrameworkStandardWorkbench.tsx src/styles.css src/tests/blog-framework-standard-workbench.test.ts
git commit -m "feat: build blog framework AI workbench"
```

---

### Task 5: Integrate the workbench and make the saved standard drive Blog AI

**Files:**
- Modify: `components/SkillFactoryDashboard.tsx`
- Modify: `components/BlogAIGeneratorDashboard.tsx`
- Modify: `App.tsx`
- Test: `src/tests/app-tabs.test.ts`
- Test: `src/tests/blog-workspace-layout.test.ts`

**Interfaces:**
- Consumes: `SiteProfile.blogFrameworkStandard` and the Task 4 component.
- Preserves: Blog AI `frameworkId` selection and article-type fallback.

- [ ] **Step 1: Add failing integration tests**

Assert that `SkillFactoryDashboard` renders `BlogFrameworkStandardWorkbench`, no longer owns `frameworkAiBrief` or the direct framework field grid outside the new component, and passes `activeProfile.blogFrameworkStandard`. Assert that Blog AI options still receive all five active frameworks and default to the matching `articleType` when `frameworkId` is empty.

- [ ] **Step 2: Run integration tests and verify they fail**

Run: `node --import tsx --test src/tests/app-tabs.test.ts src/tests/blog-workspace-layout.test.ts`

Expected: FAIL on the new workbench integration assertions.

- [ ] **Step 3: Replace the existing framework section**

Remove framework-specific draft state, deterministic assistant handlers, and direct editor markup from `SkillFactoryDashboard`. Render the focused workbench and call `onRefreshProfiles` after save. Update the section description to “用 AI 定义每类文章从资料、结构到发布检查的统一施工图”. Keep the summary count as the number of active standard frameworks.

- [ ] **Step 4: Preserve Blog AI selection and default matching**

Continue passing `activeSiteProfile.blogFrameworks`, which Task 3 projects from the active standard. In `BlogAIGeneratorDashboard`, when article type changes and the current framework is empty or belongs to the previous type, select the first framework with the new `articleType`; never overwrite an explicit compatible selection.

- [ ] **Step 5: Confirm single-article instructions remain local**

Do not call the site framework assistant from Blog AI. Article-specific audience, outline, and feedback remain in the generator draft and request payload only; add a test proving they do not call `/blog-framework-standard`.

- [ ] **Step 6: Run integration and type tests**

Run: `node --import tsx --test src/tests/app-tabs.test.ts src/tests/blog-workspace-layout.test.ts src/tests/blog-ai-service.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 7: Commit the integration slice**

```bash
git add components/SkillFactoryDashboard.tsx components/BlogAIGeneratorDashboard.tsx App.tsx src/tests/app-tabs.test.ts src/tests/blog-workspace-layout.test.ts src/tests/blog-ai-service.test.ts
git commit -m "feat: connect framework standards to Blog AI"
```

---

### Task 6: Interaction coverage, full verification, and compatibility audit

**Files:**
- Modify: `tests/app-interactions/blog-format.spec.ts`
- Modify: `tests/app-interactions/harness.tsx`
- Modify: `tests/ui-layout/harness.tsx` only if the framework view is not already reachable
- Modify: `backend/tests/test_blog_ai.py`

**Interfaces:**
- Verifies the complete user path without changing production interfaces.

- [ ] **Step 1: Update the API harness with standard endpoints**

Return five presets and a default v0 standard for GET, return a one-framework diff for assistant POST, and return configured v1 for PUT. Record requests so the test can assert assistant calls do not save and save calls occur only on the explicit button.

- [ ] **Step 2: Add the end-to-end interaction test**

Cover: open “博客写作框架”; see five built-ins; select standard buyer guide; see the full construction blueprint; submit “开头不要空话，直接告诉买家怎么选”; verify the direct-answer card is marked; switch to saved view and back; reset to built-in default; make another change; save; verify v1 and cleared dirty state.

- [ ] **Step 3: Add backend prompt consumption assertions**

Extend `backend/tests/test_blog_ai.py` to assert the generated prompt includes `contentGoal`, funnel stage, target audience, voice rules, evidence rules, outline blocks, preflight checks, and prohibited claims from the selected saved framework.

- [ ] **Step 4: Run targeted interaction and backend tests**

Run: `npm run test:interactions -- --grep "博客写作框架|framework"`

Run: `.venv/bin/python -m unittest backend.tests.test_blog_ai backend.tests.test_client_profiles`

Expected: PASS.

- [ ] **Step 5: Run the full required verification matrix**

Run: `npm run typecheck`

Run: `npm run test:backend`

Run: `npm run verify:ui`

Expected: all commands PASS. Playwright must cover `1100×720`, `1320×860`, and `1600×900`, light/dark, and 100%/125%/150% scale with no unexpected overflow, overlap, clipped actions, React error overlay, or console errors.

- [ ] **Step 6: Audit compatibility and the dirty worktree before completion**

Run:

```bash
git diff --check
git status --short
git diff -- backend/main.py services/clientProfileService.ts components/BlogFrameworkStandardWorkbench.tsx components/SkillFactoryDashboard.tsx components/BlogAIGeneratorDashboard.tsx App.tsx
```

Confirm the old `/blog-frameworks` GET/PUT contracts still work, `blogFrameworks` remains in site responses for one compatibility cycle, no plugin actions were reintroduced, and no unrelated user changes are staged.

- [ ] **Step 7: Commit final verification updates**

```bash
git add tests/app-interactions/blog-format.spec.ts tests/app-interactions/harness.tsx tests/ui-layout/harness.tsx backend/tests/test_blog_ai.py
git commit -m "test: verify blog framework workbench workflow"
```
