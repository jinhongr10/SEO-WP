# Typed Blog Format Repair Design

## Goal

Extend `批量修复 Blog 格式` so posts can be scanned, previewed, and repaired by Blog type. The same screen should support ordinary Blog posts plus exhibition, certificate, project, and product video Blog posts.

## Scope

This change adds type filtering and type-aware repair profiles to the existing bulk format workflow. It does not rewrite article content with AI, publish posts directly, or change the backup-before-apply safety behavior.

## Blog Types

- `all`: all Blog posts
- `standard`: ordinary Blog posts with no recognized type marker
- `exhibition`: exhibition recap Blog posts
- `certificate`: certificate or certification Blog posts
- `project`: project case Blog posts
- `video`: product video Blog posts

## Type Detection

Detection is conservative:

1. Read WordPress terms from embedded post terms when available.
2. Match tag/category names and slugs first.
3. Fall back to title and slug patterns.
4. Return `standard` when no type marker is found.

Blog AI posts already add type tags for exhibition, certificate, and project. Product video posts can be detected from `video`, `product video`, YouTube-related tags, title, or slug.

## User Workflow

1. Open `批量修复 Blog 格式`.
2. Pick status, Blog type, search, and limit.
3. Click `扫描 Blog`.
4. The list shows only posts matching the selected type, except `全部 Blog`.
5. Each post row shows a type badge.
6. Click `生成预览`.
7. Each preview uses its detected or selected repair profile.
8. Click `应用选中预览` to write formatted HTML back to WordPress after backup.

## Type-Aware Repair Profiles

All types keep the existing Gutenberg-friendly formatting: headings, paragraphs, tables, image blocks, table of contents, related links, FAQ, and backup-on-apply.

Each type changes the final CTA and safety notes:

- `standard`: current general Demo Brand CTA.
- `exhibition`: CTA invites follow-up about products shown at the exhibition and buyer discussions.
- `certificate`: CTA asks buyers to confirm applicable models and certification scope; profile warns that certificate claims are not expanded.
- `project`: CTA invites similar project recommendations and product matching.
- `video`: CTA invites buyers to watch the product video and request specs, quote, samples, or customization support.

The formatter must not invent dates, visitor numbers, customer names, certification scope, installation quantities, countries, prices, test results, or guarantees.

## Data Flow

Frontend `fetchBulkFormatBlogPosts` sends:

- `status`
- `search`
- `limit`
- `blogType`

Backend `/blog/bulk-format/posts` returns:

- existing post fields
- `blogType`
- `blogTypeLabel`

Frontend `previewBulkFormatBlogPosts` sends:

- `postIds`
- `maxLinks`
- `blogType`

Backend preview rows return:

- existing preview fields
- `blogType`
- `blogTypeLabel`
- `repairProfile`

Frontend `applyBulkFormatBlogPosts` includes each preview row's `blogType` so auto-tag syncing can preserve or add the type tag where appropriate.

## Acceptance Criteria

1. Users can filter bulk Blog format repair by all, ordinary, exhibition, certificate, project, and product video posts.
2. Post rows and preview cards show the detected type.
3. Type filtering uses WordPress tag/category data first and safe title/slug fallback second.
4. Type-aware previews produce different CTAs and warning notes for specialized types.
5. Applying previews keeps the backup behavior and syncs type tags when relevant.
6. Existing ordinary Blog repair behavior still works.
