# macOS Collapsed Sidebar Window Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the native macOS traffic-light controls fully inside the 72px collapsed sidebar and separated from the workspace sidebar-toggle button.

**Architecture:** Keep the existing Electron `hiddenInset` title bar and fixed 72px Arco sidebar. Move the native traffic-light group horizontally at the BrowserWindow configuration boundary; do not add renderer state synchronization or change React/CSS layout.

**Tech Stack:** Electron BrowserWindow, React, Arco Design, Node test runner with TypeScript via `tsx`.

## Global Constraints

- Keep the collapsed sidebar width at 72px.
- Keep Electron's minimum window width at 1100px.
- Preserve the existing traffic-light vertical position.
- Do not change Windows or Linux title-bar behavior.
- Run `npm run verify:ui` before declaring completion.

---

### Task 1: Constrain macOS traffic lights to the collapsed sidebar

**Files:**
- Modify: `src/tests/arco-ui-shell.test.ts:70-83`
- Modify: `desktop/main.cjs:631-640`

**Interfaces:**
- Consumes: Electron `BrowserWindowConstructorOptions.trafficLightPosition` and the existing 72px renderer sidebar contract.
- Produces: A fixed macOS traffic-light origin `{ x: 12, y: 26 }`; non-macOS receives `undefined` as before.

- [x] **Step 1: Write the failing regression assertion**

Change the existing assertion in `src/tests/arco-ui-shell.test.ts` so the test requires the new safe horizontal origin while retaining the existing vertical and CSS assertions:

```ts
assert.match(main, /trafficLightPosition:\s*process\.platform === 'darwin' \? \{ x:\s*12,\s*y:\s*26 \} : undefined/);
```

- [x] **Step 2: Run the focused test and verify RED**

Run `node --import tsx --test src/tests/arco-ui-shell.test.ts`.

Expected: FAIL in `desktop collapsed sidebar keeps macOS window controls visually centered` because `desktop/main.cjs` still contains `{ x: 24, y: 26 }`.

- [x] **Step 3: Implement the minimal Electron fix**

Change only the macOS horizontal origin in `desktop/main.cjs`:

```js
trafficLightPosition: process.platform === 'darwin' ? { x: 12, y: 26 } : undefined,
```

- [x] **Step 4: Run focused tests and verify GREEN**

Run `node --import tsx --test src/tests/arco-ui-shell.test.ts src/tests/desktop-packaging-config.test.ts` and expect all tests to pass.

- [x] **Step 5: Run the required UI verification**

Run `npm run verify:ui` and expect the web build, frontend tests, layout tests, and interaction tests to pass.

- [x] **Step 6: Inspect the final diff and commit the fix**

Run `git diff --check`, inspect only the expected test and Electron coordinate change, then commit with `fix: contain macOS window controls in collapsed sidebar`.
