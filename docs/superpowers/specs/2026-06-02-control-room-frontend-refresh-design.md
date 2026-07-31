# Control Room Frontend Refresh Design

Date: 2026-06-02

## Summary

Refresh the existing React/Vite SEO and WordPress operations frontend with a focused "Control Room" direction. The work is scoped to the global app shell, primary navigation, shared visual primitives, and the command center dashboard. Existing business logic, backend API contracts, routing state, lazy-loaded workspaces, and data flows stay intact.

## Goals

- Make the app feel like a durable SEO operations console rather than a collection of separate utility panels.
- Improve scanability for daily work: system status, AI status, high-priority SEO issues, queues, and actions should be easier to read at a glance.
- Establish a shared visual language for cards, buttons, inputs, badges, tables, pagination, and notices.
- Keep the implementation low risk by avoiding new runtime dependencies and preserving the existing Tailwind CDN setup.
- Improve responsive behavior for desktop and narrow screens, especially around navigation and dense dashboard controls.

## Non-Goals

- No backend endpoint changes.
- No new routing framework or state management library.
- No redesign of every workspace in detail.
- No Figma export or external design system integration.
- No large refactor of business logic inside image, blog, media, WooCommerce, audit, or planner workflows.

## Visual Direction

The approved direction is **Control Room**.

- Base: warm off-white and cool gray surfaces for long working sessions.
- Anchor color: deep ink/navy for brand and primary structure.
- Primary action: teal/green for productive operations such as refresh, start, apply, and open.
- Status colors: red for critical, amber for warnings, blue for informational notices, emerald for success.
- Shape language: restrained 8px radius for cards, panels, controls, and badges unless existing image previews require larger containers.
- Density: operational and scannable; avoid landing-page hero treatment, oversized decorative sections, and nested card stacks.
- Motion: subtle transitions for active tabs, hover states, loading indicators, and notice entry only.

## Architecture

The refresh should fit the current structure:

- `index.html` remains the place for global font, Tailwind config, base body styles, scrollbars, and new app-level CSS utilities.
- `App.tsx` remains the owner of app shell state, theme values, top-level navigation, settings modal, global notices, and workspace rendering.
- `components/CommandCenterDashboard.tsx` remains the command center surface and receives the existing `theme` object.
- Existing lazy imports and persistent view logic stay unchanged.

Implementation should favor small helpers and shared class strings near the surfaces that use them. A new abstraction is only warranted if it removes repeated class logic across the shell and command center.

## App Shell Design

The top shell should become a compact command bar:

- Left side: stronger brand block with icon, `独立站AI`, and a short context label such as `SEO Control Room` if space allows.
- Right side: system network status, AI provider status, settings, and theme toggle as compact controls with consistent height.
- Status pills should use clear color and icon/dot states without taking too much horizontal space.
- The settings and theme controls should look like icon buttons with stable square dimensions and hover/focus states.

Primary navigation should be restyled as an operations nav:

- Keep existing `APP_MODE_TABS`.
- Keep the current click handlers and page-planner running dot.
- Improve active state with a stronger filled surface and subtle left/top accent.
- Let navigation wrap cleanly on smaller screens without text overflow.
- Use stable icon sizes so tabs do not shift when labels differ.

Secondary blog/media workspace tabs can inherit the same segmented-control treatment, but their internal panels should not be deeply redesigned in this phase.

## Shared Visual Primitives

Introduce or consolidate shared classes for:

- Page surface: background, content width, spacing, and top-level bands.
- Card/panel: border, background, shadow, padding, and radius.
- Buttons: primary, neutral, subtle, danger, and disabled states.
- Inputs/selects: border, focus ring, surface color, readable text color.
- Badges/pills: critical, warning, notice, success, muted.
- Tables: header background, row dividers, hover state, compact cell padding.
- Notices: global notice and inline warning/error panels.

These can be implemented as CSS utility classes in `index.html` and combined with existing Tailwind classes. The goal is consistency without converting the whole app away from Tailwind.

## Command Center Design

The command center should be reorganized visually around daily operations:

1. Header band
   - Title: `中控台`
   - Supporting line: keep the current meaning around unified task center and review queue.
   - Primary action: refresh button using the new primary button style.
   - Error state: inline warning panel under the header.

2. Health summary
   - Make the overall SEO score the visual anchor.
   - Pair the score with label and updated time.
   - Show critical, warning, notice, and generated-unsynced counts as compact metric blocks.
   - Avoid nested cards; use one clean panel with internal grid.

3. Workflow and discovery panels
   - Keep `WorkflowModelCard`, `SeoGapSearchPanel`, and `DailySeoQueuePanel`.
   - Restyle only the local command-center wrappers and shared controls where low-risk.
   - Preserve all copy and behavior unless layout needs short label wrapping.

4. Group cards
   - Keep the four SEO health groups.
   - Make score, issue counts, and summaries easier to scan with consistent severity chips.
   - Use the Control Room palette rather than mixed blue/purple accents.

5. Priority issue queue
   - Treat the issue table as an actionable queue.
   - Move filters into a clean filter bar with consistent labels and inputs.
   - Improve table header contrast and row readability.
   - Keep pagination behavior unchanged.
   - Action buttons should use a compact primary or neutral action style depending on severity.

## Responsive Behavior

- Desktop: keep the command center constrained to a max content width and preserve dense information grids.
- Tablet: allow metric cards and filters to wrap without overlapping.
- Mobile/narrow: navigation wraps into multiple rows; command center cards stack; tables remain horizontally scrollable where necessary.
- Text inside pills, buttons, and tabs must not overlap or clip. Long labels should wrap or truncate only where the existing behavior already allows it.

## Accessibility

- Keep semantic buttons and existing aria attributes.
- Preserve visible focus rings for interactive controls.
- Maintain sufficient contrast for all status colors in light and dark modes.
- Do not rely on color alone for critical state; keep labels such as `紧急`, `警告`, and `提示`.

## Testing And Verification

Run:

- `npm run build:web`

Then start Vite locally and verify in the browser:

- App shell loads without console-breaking runtime errors.
- Command center renders at desktop width.
- Command center and app navigation do not overflow or overlap at a narrow/mobile viewport.
- Theme toggle still switches dark mode.
- Refresh button and navigation tabs still call existing handlers.

If backend data is unavailable, verify loading, empty, and error-safe visual states where possible.

## Implementation Boundaries

Expected files:

- `index.html`
- `App.tsx`
- `components/CommandCenterDashboard.tsx`

Possible file if repeated local icons or helper classes need minor support:

- `components/Icons.tsx`

Avoid editing unrelated backend, services, tests, generated `dist`, generated `dist-cli`, or workspace data files.

## Confirmed Decisions

- Use the approved Control Room direction.
- Scope remains app shell, command center, and shared style primitives only.
- No new dependency should be added unless implementation reveals an existing package already available in the project.
