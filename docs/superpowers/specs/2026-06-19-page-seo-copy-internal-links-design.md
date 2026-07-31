# Page SEO Copy and Internal Links Design

Date: 2026-06-19

## Goal

Extend the existing `页面计划 > 页面 SEO` workspace so operators can generate copy-ready page optimization text and internal-link suggestions for existing WordPress pages and product category pages.

## Scope

The first version adds a `文案与内链优化` mode beside the existing SEO field generation mode. It reads the same `WordPress Pages` and `产品分类页` inventory, lets the operator select pages, and generates copy blocks that can be pasted manually into Elementor, a category description, or a page editor.

The first version does not automatically overwrite page body content, edit Elementor data, or publish content.

## Internal Link Rules

Allowed internal link targets:

- WooCommerce product pages.
- WooCommerce product category pages.
- WordPress fixed pages, including contact or inquiry pages.

Excluded internal link targets:

- Blog posts.
- Any candidate whose source type is `post`.
- Any AI-returned URL that is not in the backend-provided candidate pool.

## Output Model

Each optimized page result contains:

- Page id and source.
- A short optimization summary.
- Target sections such as Hero, category introduction, buying guide, FAQ, or CTA.
- One copy-ready English text block per target section.
- Section placement guidance.
- Keywords used naturally in the copy.
- Internal links with anchor text, destination, placement, reason, and ready-to-copy HTML.

## User Workflow

1. The operator opens `页面计划 > 页面 SEO`.
2. The operator reads `WordPress Pages` or `产品分类页`.
3. The operator switches generation mode from `SEO 字段` to `文案与内链优化`.
4. The operator enters core keywords if needed.
5. The operator selects one or more pages and clicks the generation button.
6. The result appears in the page table.
7. The operator uses quick-copy buttons:
   - Copy the full page optimization package.
   - Copy one section's text block.
   - Copy an internal-link anchor.
   - Copy an internal-link HTML snippet.

## Architecture

Backend:

- Reuse the Page SEO inventory and AI provider wiring in `backend/main.py`.
- Add a link-candidate collector scoped to products, product categories, and fixed pages.
- Add `POST /page-seo/optimize-copy`.
- Normalize AI output and reject links outside the allowed candidate set.

Frontend:

- Extend `services/pageSeoService.ts` with copy optimization types and a fetch helper.
- Extend `components/PageSeoPanel.tsx` with a generation mode toggle, copy optimization state, rendering, and clipboard actions.

## Error Handling

- If no selected pages exist, the UI asks the operator to select pages.
- If no allowed link candidates are available, the backend still returns copy blocks and includes a warning.
- If AI returns a link outside the allowed pool, that link is dropped.
- If AI returns no usable copy blocks, the endpoint returns a clear error.

## Testing

Backend tests should verify:

- The prompt and candidate list exclude Blog posts.
- AI-returned Blog links or unknown links are removed.
- Valid product/category/page links return normalized anchor text and HTML.

Frontend tests should verify:

- The service posts to `/page-seo/optimize-copy`.
- Malformed optimization responses are rejected.
- The Page SEO panel exposes `文案与内链优化` and quick-copy labels.
