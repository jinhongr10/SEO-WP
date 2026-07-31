# Page Planner HTML Export Design

Date: 2026-05-13

## Context

The page planner currently generates fixed-page SEO plans for manual Elementor production. Each plan includes page metadata, search intent, an outline, FAQ, CTA, and internal link suggestions. The outline is helpful, but it is too brief for execution: a user still has to decide what each section should say, which heading widget level to use, which image to place, and where internal links belong.

The new requirement is to export each generated page plan as a readable HTML construction brief. The HTML is not intended to be imported into Elementor as finished page markup. It is a side-by-side production guide that the user can open in a browser and follow while building the page manually in Elementor.

## Goals

- Add a per-page `Export HTML` action in the page planner detail panel.
- Export a standalone HTML construction brief for the selected page.
- Make every exported HTML brief detailed enough for manual Elementor work.
- Include explicit heading levels: Hero uses `H1`; major sections use `H2`; nested section ideas use `H3`.
- Include Elementor widget guidance for each area, such as Heading, Text Editor, Image, Button, Icon Box, Comparison Table, FAQ Accordion, and CTA section.
- Include detailed writing briefs, suggested copy, image placement guidance, image alt text, and internal link placement.
- Ensure each exported page brief targets more than 1,000 English words of guidance and suggested content.
- Keep generation local in the browser for the first version: no backend file writing, no WordPress page creation, and no Elementor HTML import.

## Non-Goals

- Do not generate final Elementor HTML or shortcode layouts.
- Do not publish or create WordPress pages.
- Do not overwrite any existing WordPress content.
- Do not require backend storage for exported HTML in the first version.
- Do not require ZIP batch export in this first implementation.

## Data Model Changes

The existing outline section fields remain backward compatible:

- `heading`
- `details`
- `assets`

Each section gains richer execution fields:

- `headingLevel`: expected to be `H2` for main sections.
- `elementorWidget`: the primary Elementor widget or section type.
- `elementorLayout`: the recommended Elementor layout pattern.
- `sectionPurpose`: why this section belongs on the page.
- `writingBrief`: detailed instructions for what the copywriter should cover.
- `suggestedCopy`: draft English copy that the user can adapt inside Elementor.
- `imageBrief`: what kind of image should be placed in the section.
- `imageAlt`: recommended image alt text.
- `subheadings`: optional `H3` ideas for complex sections.
- `internalLinkAnchors`: section-specific anchor text, URL, target title, type, reason, and placement.

The global `internalLinks` list remains available, but section-level links tell the user exactly where to place each link in the body copy.

## Prompt Changes

The AI prompt should ask for Elementor construction briefs instead of short outline notes. For every generated page:

- Hero must define `H1`, supporting text, recommended hero image, and primary CTA.
- Each section must use explicit heading levels.
- Each section should include enough detail to help a user write or paste copy without guessing.
- Suggested section copy should be substantial, aiming for 150-220 words per major section when possible.
- Pages should include enough sections and supporting text for the exported HTML brief to exceed 1,000 words.
- Internal links must only use provided candidates or generated planned pages.
- Section-level internal link anchors should specify the exact text to link and the destination URL.

## HTML Export

The front end generates the HTML file from the selected page plan. The file name uses the slug:

`<slug>-elementor-brief.html`

The exported HTML includes:

- Page overview: page title, SEO title, slug, primary keyword, secondary keywords, search intent, priority, page type.
- Word-count notice with the exported guide word count.
- Hero construction card with `H1`, widget guidance, hero image brief, CTA guidance, and copy notes.
- Section construction cards for each outline section.
- For each section: heading level, widget, layout, section purpose, writing brief, suggested copy, image brief, image alt, assets, `H3` subheadings, and internal links.
- FAQ section with suggested Elementor Accordion usage.
- CTA construction guidance.
- Global internal link table.
- Notes for manual Elementor execution.

## UI Changes

In `components/PagePlannerDashboard.tsx`:

- Add an `Export HTML` button near the existing `Copy` button.
- Generate and download a standalone HTML file using a Blob.
- Continue supporting the current copy-to-markdown flow.
- Show richer section details in the detail panel when present, while preserving current rendering for older responses.

## Validation

- Add backend normalization tests for richer outline fields and section-level links.
- Add frontend build verification with `npm run build`.
- Manually verify that a selected plan can export a readable HTML file.

## Acceptance Criteria

- Every generated page plan can be exported as a standalone HTML construction brief.
- The exported HTML clearly labels `H1`, `H2`, and `H3` usage.
- Every major section includes writing guidance, image guidance, Elementor layout guidance, and internal link placement when links are available.
- The exported HTML contains a word-count indicator and is designed to exceed 1,000 English words for each page.
- The feature does not create or publish WordPress pages.
- Existing shorter AI responses still render and export without crashing.
