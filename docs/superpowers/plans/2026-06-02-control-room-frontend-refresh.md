# Control Room Frontend Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refresh the app shell, command center, and shared visual primitives into the approved Control Room operations-console design.

**Architecture:** Keep the existing React/Vite structure and Tailwind CDN setup. Add reusable CSS utilities in `index.html`, then apply those classes to `App.tsx` and `components/CommandCenterDashboard.tsx` without changing business logic, API calls, or view state.

**Tech Stack:** React 19, Vite 6, TypeScript, Tailwind CDN, Node test runner, React server rendering tests.

---

## File Structure

- Modify `index.html`: update font import/body styles and add Control Room CSS utilities for shell, navigation, buttons, cards, badges, tables, inputs, and notices.
- Modify `App.tsx`: apply the Control Room shell classes to the header, brand block, status controls, top navigation, secondary workspace tabs, and global notice.
- Modify `components/CommandCenterDashboard.tsx`: apply Control Room classes to stat boxes, severity badges, group cards, workflow card, header, health summary, filters, issue queue, and pagination.
- Modify `src/tests/app-tabs.test.ts`: add regression assertions for the Control Room app shell classes and brand context.
- Modify `src/tests/seo-health-dashboard.test.ts`: add regression assertions for command center Control Room classes.
- Do not modify backend code, services, generated `dist`, generated `dist-cli`, or workspace data files.

## Task 1: Add Shell And Command Center Regression Tests

**Files:**
- Modify: `src/tests/app-tabs.test.ts`
- Modify: `src/tests/seo-health-dashboard.test.ts`

- [ ] **Step 1: Add app shell class assertions**

In `src/tests/app-tabs.test.ts`, extend the existing `top navigation wraps compact tab labels instead of showing a horizontal scrollbar` test with these assertions after the current brand assertions:

```ts
  assert.match(html, /class="[^"]*control-shell[^"]*"/);
  assert.match(html, /class="[^"]*control-commandbar[^"]*"/);
  assert.match(html, /class="[^"]*control-brand[^"]*"/);
  assert.match(html, />SEO Control Room</);
  assert.match(html, /data-testid="mode-toggle-list"[^>]*control-nav/);
  assert.match(html, /data-testid="mode-tab-commandCenter"[^>]*control-nav-tab/);
  assert.match(html, /data-testid="system-network-status"[^>]*control-status-pill/);
```

- [ ] **Step 2: Add command center class assertions**

In `src/tests/seo-health-dashboard.test.ts`, extend `command center dashboard renders scores, unavailable groups, and issue actions` with these assertions near the end of the test:

```ts
  assert.match(html, /class="[^"]*control-page[^"]*"/);
  assert.match(html, /class="[^"]*control-hero-panel[^"]*"/);
  assert.match(html, /class="[^"]*control-metric-card[^"]*"/);
  assert.match(html, /class="[^"]*control-filter-bar[^"]*"/);
  assert.match(html, /class="[^"]*control-table[^"]*"/);
  assert.match(html, /优先处理队列/);
```

- [ ] **Step 3: Run the focused tests and verify RED**

Run:

```bash
npm test -- src/tests/app-tabs.test.ts src/tests/seo-health-dashboard.test.ts
```

Expected: tests fail because the new Control Room class names and `SEO Control Room` text are not rendered yet.

## Task 2: Add Control Room CSS Utilities

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Replace the font import**

In `index.html`, replace the current Inter import:

```html
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
```

with:

```html
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=Noto+Sans+SC:wght@400;500;700&display=swap" rel="stylesheet">
```

- [ ] **Step 2: Replace the base body style**

In the same `<style>` block, replace:

```css
body { font-family: 'Inter', sans-serif; background-color: #0f172a; color: #f8fafc; }
```

with:

```css
:root {
  --control-ink: #13231f;
  --control-ink-soft: #213b34;
  --control-page: #f4f7f4;
  --control-page-dark: #0e1513;
  --control-surface: #ffffff;
  --control-surface-dark: #131d1a;
  --control-border: #d7e2dc;
  --control-border-dark: #243a34;
  --control-muted: #66756f;
  --control-teal: #0f766e;
  --control-teal-strong: #0b5f59;
  --control-teal-soft: #dff7ef;
  --control-amber: #b7791f;
  --control-red: #b42318;
  --control-blue: #2563eb;
}
body {
  font-family: 'IBM Plex Sans', 'Noto Sans SC', sans-serif;
  background-color: var(--control-page);
  color: #24332f;
}
```

- [ ] **Step 3: Add Control Room utility CSS**

Still in `index.html`, add this CSS before the checkerboard styles:

```css
.control-shell {
  background:
    linear-gradient(180deg, rgba(15, 118, 110, 0.08), transparent 220px),
    var(--control-page);
}
.dark .control-shell {
  background:
    linear-gradient(180deg, rgba(15, 118, 110, 0.16), transparent 240px),
    var(--control-page-dark);
}
.control-commandbar {
  min-height: 68px;
  border-bottom: 1px solid var(--control-border);
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 10px 28px rgba(19, 35, 31, 0.08);
}
.dark .control-commandbar {
  border-bottom-color: var(--control-border-dark);
  background: rgba(19, 29, 26, 0.92);
  box-shadow: 0 14px 30px rgba(0, 0, 0, 0.22);
}
.control-brand-mark {
  background: linear-gradient(135deg, var(--control-ink), var(--control-teal));
  box-shadow: 0 12px 22px rgba(15, 118, 110, 0.24);
}
.control-eyebrow {
  color: var(--control-muted);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0;
  line-height: 1;
}
.control-status-pill,
.control-icon-button {
  min-height: 36px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.72);
  box-shadow: inset 0 0 0 1px rgba(19, 35, 31, 0.08);
}
.dark .control-status-pill,
.dark .control-icon-button {
  background: rgba(255, 255, 255, 0.06);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.08);
}
.control-nav-band {
  border-bottom: 1px solid var(--control-border);
  background: rgba(244, 247, 244, 0.86);
}
.dark .control-nav-band {
  border-bottom-color: var(--control-border-dark);
  background: rgba(14, 21, 19, 0.88);
}
.control-nav {
  border: 1px solid var(--control-border);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.72);
  box-shadow: 0 12px 28px rgba(19, 35, 31, 0.06);
}
.dark .control-nav {
  border-color: var(--control-border-dark);
  background: rgba(255, 255, 255, 0.05);
}
.control-nav-tab {
  min-height: 38px;
  border-radius: 6px;
  letter-spacing: 0;
}
.control-nav-tab-active {
  background: var(--control-ink);
  color: #ffffff;
  box-shadow: 0 10px 22px rgba(19, 35, 31, 0.18);
}
.dark .control-nav-tab-active {
  background: var(--control-teal-soft);
  color: #10322c;
}
.control-page {
  background: transparent;
}
.control-card,
.control-hero-panel,
.control-metric-card {
  border: 1px solid var(--control-border);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.88);
  box-shadow: 0 16px 38px rgba(19, 35, 31, 0.07);
}
.dark .control-card,
.dark .control-hero-panel,
.dark .control-metric-card {
  border-color: var(--control-border-dark);
  background: rgba(19, 29, 26, 0.9);
  box-shadow: 0 18px 38px rgba(0, 0, 0, 0.22);
}
.control-button-primary {
  border-radius: 8px;
  background: var(--control-teal);
  color: #ffffff;
  box-shadow: 0 12px 22px rgba(15, 118, 110, 0.22);
}
.control-button-primary:hover {
  background: var(--control-teal-strong);
}
.control-button-neutral {
  border: 1px solid var(--control-border);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.8);
}
.dark .control-button-neutral {
  border-color: var(--control-border-dark);
  background: rgba(255, 255, 255, 0.06);
}
.control-filter-bar {
  border-top: 1px solid var(--control-border);
  border-bottom: 1px solid var(--control-border);
  background: rgba(223, 247, 239, 0.34);
}
.dark .control-filter-bar {
  border-color: var(--control-border-dark);
  background: rgba(15, 118, 110, 0.12);
}
.control-input {
  border-radius: 8px;
}
.control-table thead {
  background: rgba(19, 35, 31, 0.04);
}
.dark .control-table thead {
  background: rgba(255, 255, 255, 0.05);
}
.control-table tbody tr:hover {
  background: rgba(15, 118, 110, 0.04);
}
.dark .control-table tbody tr:hover {
  background: rgba(15, 118, 110, 0.12);
}
.control-notice {
  border-radius: 8px;
  box-shadow: 0 12px 28px rgba(180, 83, 9, 0.12);
}
```

- [ ] **Step 4: Run the focused tests**

Run:

```bash
npm test -- src/tests/app-tabs.test.ts src/tests/seo-health-dashboard.test.ts
```

Expected: tests still fail because React markup has not been updated yet.

## Task 3: Refresh The App Shell

**Files:**
- Modify: `App.tsx`

- [ ] **Step 1: Update the root shell class**

In `App.tsx`, replace the root wrapper class segment:

```tsx
${theme.bg} ${theme.text} transition-colors duration-500 font-sans relative
```

with:

```tsx
control-shell ${theme.text} transition-colors duration-500 font-sans relative
```

- [ ] **Step 2: Replace the header wrapper classes**

Replace the header wrapper:

```tsx
<div className={`h-16 border-b ${theme.cardBorder} ${theme.cardBg} flex items-center justify-between px-4 sm:px-6 shrink-0 z-40`}>
```

with:

```tsx
<div className={`control-commandbar flex items-center justify-between gap-3 px-4 sm:px-6 shrink-0 z-40`}>
```

- [ ] **Step 3: Replace the brand block markup**

Replace the brand block inside the header:

```tsx
<div className="flex items-center gap-2 min-w-0">
  <div className="bg-blue-600 p-1.5 rounded-lg text-white shrink-0">
    {renderModeIcon(viewMode)}
  </div>
  <span data-testid="app-brand" className={`font-bold text-lg ${theme.heading} whitespace-nowrap`}>独立站AI</span>
</div>
```

with:

```tsx
<div className="control-brand flex min-w-0 items-center gap-3">
  <div className="control-brand-mark flex size-10 shrink-0 items-center justify-center rounded-lg text-white">
    {renderModeIcon(viewMode)}
  </div>
  <div className="min-w-0">
    <span data-testid="app-brand" className={`block whitespace-nowrap text-lg font-bold leading-tight ${theme.heading}`}>独立站AI</span>
    <span className="control-eyebrow hidden sm:block">SEO Control Room</span>
  </div>
</div>
```

- [ ] **Step 4: Apply compact status and icon button classes**

For the system network button, prepend `control-status-pill` to the existing class:

```tsx
className={`control-status-pill text-xs px-2.5 py-1 rounded-full border whitespace-nowrap inline-flex items-center gap-1.5 ${systemStatusToneClasses.pill}`}
```

For the AI status pill, replace its wrapper class with:

```tsx
className={`control-status-pill inline-flex items-center whitespace-nowrap border px-2.5 py-1 text-xs ${hasApiKeyConfigured ? 'border-green-300 text-green-600 dark:border-green-600 dark:text-green-300' : 'border-amber-300 text-amber-700 dark:border-amber-600 dark:text-amber-300'}`}
```

For the settings and theme buttons, replace `p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10` with:

```tsx
control-icon-button inline-flex size-9 items-center justify-center hover:bg-black/5 dark:hover:bg-white/10
```

- [ ] **Step 5: Refresh top navigation classes**

Replace the mode toggle outer wrapper:

```tsx
<div data-testid="mode-toggle-scroll" className={`border-b ${theme.cardBorder} ${theme.cardBg} px-3 sm:px-6 py-2 shrink-0 z-10`}>
```

with:

```tsx
<div data-testid="mode-toggle-scroll" className="control-nav-band px-3 py-2 sm:px-6 shrink-0 z-10">
```

Replace the mode toggle list class:

```tsx
className={`flex flex-wrap items-center justify-center gap-1.5 max-w-7xl mx-auto p-1.5 rounded-lg ${isDarkMode ? 'bg-slate-800' : 'bg-slate-100'}`}
```

with:

```tsx
className="control-nav flex max-w-7xl flex-wrap items-center justify-center gap-1.5 mx-auto p-1.5"
```

In each primary nav button, add `control-nav-tab` and use `control-nav-tab-active` for the active state:

```tsx
className={`control-nav-tab whitespace-nowrap px-2.5 sm:px-3 py-1.5 text-xs sm:text-sm font-medium transition-all flex items-center gap-1.5 ${viewMode === mode ? 'control-nav-tab-active' : 'text-slate-600 dark:text-slate-300 hover:bg-white/70 dark:hover:bg-slate-700/70'}`}
```

- [ ] **Step 6: Refresh secondary tab wrappers**

Apply the same `control-nav` and `control-nav-tab` pattern to `media-workspace-tabs` and `blog-workspace-tabs`, preserving their existing `data-testid`, `aria-*`, and click handlers.

- [ ] **Step 7: Refresh the global notice**

Add `control-notice` to the amber notice container:

```tsx
<div className="control-notice max-w-6xl mx-auto bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-200 px-3 py-2 text-sm flex items-center justify-between">
```

- [ ] **Step 8: Run app shell tests**

Run:

```bash
npm test -- src/tests/app-tabs.test.ts
```

Expected: app shell tests pass.

## Task 4: Refresh Command Center Components

**Files:**
- Modify: `components/CommandCenterDashboard.tsx`

- [ ] **Step 1: Update severity badge styles**

Replace `severityClass` values with Control Room-friendly classes:

```ts
const severityClass: Record<SeoHealthSeverity, string> = {
  critical: "border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200",
  warning: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200",
  notice: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-200",
};
```

- [ ] **Step 2: Update `StatBox` markup**

Replace the outer `StatBox` div class with:

```tsx
<div className="control-metric-card px-3 py-2">
```

Keep the label and value markup unchanged.

- [ ] **Step 3: Update `GroupCard` wrapper and issue chips**

Replace the `GroupCard` outer wrapper with:

```tsx
<div className={`control-card p-4 ${group.available ? "" : "opacity-75"}`}>
```

Keep the internal score and summary behavior unchanged. Keep the three severity mini blocks, but ensure each uses `rounded-md` rather than larger radii.

- [ ] **Step 4: Update `WorkflowModelCard` wrapper and CTA**

Replace the outer wrapper with:

```tsx
<div className="control-card p-5">
```

Replace the SEO Audit button class with:

```tsx
className="control-button-primary inline-flex shrink-0 items-center justify-center gap-2 px-4 py-2 text-sm font-semibold disabled:opacity-50"
```

Keep `data-testid="command-center-seo-audit"` and the click handler.

- [ ] **Step 5: Update the page and header panel wrappers**

Replace the command center root:

```tsx
<div className="flex-1 overflow-y-auto p-4 md:p-8">
```

with:

```tsx
<div className="control-page flex-1 overflow-y-auto p-4 md:p-8">
```

Replace the top header panel wrapper:

```tsx
<div className={`rounded-lg border ${theme.cardBorder} ${theme.cardBg} p-5`}>
```

with:

```tsx
<div className="control-hero-panel p-5">
```

Replace the refresh button class with:

```tsx
className="control-button-primary inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold disabled:opacity-50"
```

- [ ] **Step 6: Update the health summary panel**

Replace the health summary wrapper:

```tsx
<div className={`rounded-lg border ${theme.cardBorder} ${theme.cardBg} p-5`}>
```

with:

```tsx
<div className="control-hero-panel p-5">
```

Replace the inner score wrapper:

```tsx
<div className="flex flex-col justify-between rounded-lg border border-slate-200 bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-950">
```

with:

```tsx
<div className="flex flex-col justify-between rounded-lg border border-emerald-100 bg-emerald-50/70 p-5 dark:border-emerald-900/40 dark:bg-emerald-950/20">
```

- [ ] **Step 7: Update the issue queue heading and filter bar**

Replace the issue table wrapper:

```tsx
<div className={`overflow-hidden rounded-lg border ${theme.cardBorder} ${theme.cardBg}`}>
```

with:

```tsx
<div className="control-card overflow-hidden">
```

Replace the title text:

```tsx
<h3 className={`text-sm font-bold ${theme.heading}`}>优先处理问题</h3>
```

with:

```tsx
<h3 className={`text-sm font-bold ${theme.heading}`}>优先处理队列</h3>
```

Replace the filter grid wrapper:

```tsx
<div className="grid gap-3 border-b border-slate-100 px-4 py-3 dark:border-slate-800 md:grid-cols-2 xl:grid-cols-[160px_160px_minmax(220px,1fr)_130px]">
```

with:

```tsx
<div className="control-filter-bar grid gap-3 px-4 py-3 md:grid-cols-2 xl:grid-cols-[160px_160px_minmax(220px,1fr)_130px]">
```

For each select/input in the filter and pagination controls, add `control-input` to the existing class string.

- [ ] **Step 8: Update the issue table class**

Replace:

```tsx
<table className="w-full text-left">
```

with:

```tsx
<table className="control-table w-full text-left">
```

Replace issue row action button class with:

```tsx
className="control-button-primary px-3 py-1.5 text-xs font-semibold"
```

- [ ] **Step 9: Run command center tests**

Run:

```bash
npm test -- src/tests/seo-health-dashboard.test.ts
```

Expected: command center tests pass.

## Task 5: Build And Browser Verification

**Files:**
- No production file changes unless verification exposes a defect.

- [ ] **Step 1: Run focused tests together**

Run:

```bash
npm test -- src/tests/app-tabs.test.ts src/tests/seo-health-dashboard.test.ts
```

Expected: all focused tests pass.

- [ ] **Step 2: Run the web build**

Run:

```bash
npm run build:web
```

Expected: Vite build exits with code 0.

- [ ] **Step 3: Start Vite dev server**

Run:

```bash
npm run dev -- --host 127.0.0.1
```

Expected: Vite prints a local URL, usually `http://127.0.0.1:5173/`.

- [ ] **Step 4: Verify desktop layout in the in-app browser**

Open the Vite URL in the browser. Confirm:

- The app shell includes `独立站AI` and `SEO Control Room`.
- Top navigation wraps cleanly and active tab styling is visible.
- Command center renders without overlapping controls.
- System and AI status pills keep stable height.

- [ ] **Step 5: Verify narrow layout in the in-app browser**

Set the browser viewport to a narrow width around 390px. Confirm:

- Top navigation wraps instead of overflowing.
- Header controls do not overlap the brand.
- Command center cards stack vertically.
- Issue table remains horizontally scrollable if needed.

- [ ] **Step 6: Stop the Vite dev server**

Stop the running `npm run dev` session after verification.

- [ ] **Step 7: Record git limitation**

Run:

```bash
git rev-parse --show-toplevel
```

Expected: fails with `fatal: not a git repository`. Do not run commit commands in this workspace.
