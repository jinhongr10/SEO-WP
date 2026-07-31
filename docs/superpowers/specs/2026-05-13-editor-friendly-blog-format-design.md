# Editor-Friendly Blog Format Design

## Goal

Build an editor-friendly blog formatting system for example.com so existing and newly prepared WordPress blog posts can be normalized in bulk without making future manual editing difficult.

## Approved Direction

Use the hybrid approach:

- Editor CSS + front-end CSS for consistent typography.
- Gutenberg-native block output for content structure.
- A standalone app module for batch fixing published or draft blog posts.
- The existing "发布前优化与 WordPress 同步" flow must use the same output format.
- A Markdown format guide must document font, spacing, table, image, CTA, and editor conventions.

## Editor-Friendly Content Rules

The formatter must use normal Gutenberg-compatible blocks:

- Heading blocks for H2/H3 sections.
- Paragraph blocks for body copy.
- List blocks for bullets and ordered steps.
- Table blocks for comparison/spec tables.
- Image/Figure blocks for images and captions when image HTML already exists.
- Group blocks only for editorial components such as TOC, CTA, quick answer, and related resources.

The formatter must avoid Elementor dependency, shortcodes for layout, and dense inline styles inside every post. Visual polish belongs in CSS.

## Batch Module

The app gets a new top-level tab named "批量修复Blog格式". It must:

- Load WordPress blog posts by status.
- Let the user select posts.
- Generate previews without writing to WordPress.
- Show checks such as headings, tables, images, links, and warnings.
- Apply selected previews in bulk only after confirmation.
- Preserve each post's current WordPress status unless the user uses an existing publish action elsewhere.
- Save local JSON backups before updating content.

## Existing Publish-Prep Integration

The existing blog publish-prep module must continue to support upload, draft loading, optimization preview, and draft/publish sync. Its optimizer output should be the same editor-friendly format used by the batch module.

## WordPress Styling

Create a small installable WordPress plugin that enqueues:

- Front-end blog typography CSS.
- Gutenberg editor CSS for post editing.

The CSS must make the editor resemble the published article enough that users can comfortably edit posts without seeing oversized headings or full-width body text.

## Safety

The formatter must not blindly rewrite complex content. It should preserve existing Gutenberg comments when present, skip or warn about Elementor content and shortcodes, and avoid destructive status changes.

## Notes

This workspace is not a git repository, so the usual Superpowers commit step cannot be performed here.
