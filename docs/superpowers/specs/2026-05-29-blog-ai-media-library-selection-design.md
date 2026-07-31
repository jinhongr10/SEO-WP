# Blog AI Media Library Selection Design

## Goal

Allow the `展会/证书/项目blog` Blog AI workflow to choose images from the existing local media library managed by `媒体库SEO压缩`, instead of only uploading local images or doing the simple WordPress media search.

## Scope

This change adds a media-library picker to the Blog AI image section. It reuses the existing `/media/list` data source and selection behavior already used by the WooCommerce product SEO workflow. It does not change AI article generation, WordPress draft creation, image upload, or media optimization behavior.

## User Workflow

1. Open `展会/证书/项目blog`.
2. In the `图片` section, click `选择媒体库图片`.
3. Search filenames, titles, alt text, URLs, or generated SEO fields.
4. Optionally filter by media processing status or SEO issue.
5. Select one or more images from the paginated grid.
6. Click `使用选中图片`.
7. The selected images appear in the Blog AI image list with editable purpose, alt text, caption, and insert hint fields.

## UI Changes

The Blog AI image section keeps the existing `上传本地图片` control and simple WordPress media search. It gains a `选择媒体库图片` button that opens a modal.

The modal includes:

- Search input
- Status filter, defaulting to `updated,optimized`
- SEO issue filter
- Refresh button
- Paginated image grid
- Selected count and total count
- Cancel and apply buttons

The image cards show thumbnail, filename, title or alt text, optimization status, missing-alt badge, and selected state.

## Data Flow

The frontend calls `/api/media/list` through the existing API client base. The request uses:

- `page`
- `limit`
- `sort=id_desc`
- `q`
- `status`
- `issue`

Each media-library row is converted into a `BlogAIImage`:

- `mediaId`: `row.id`
- `url`: `row.source_url`
- `title`: `row.title || row.gen_title || row.filename`
- `altText`: `row.alt_text || row.gen_alt_text`
- `caption`: `row.caption || row.gen_caption`
- `purpose`: empty
- `insertHint`: empty

Duplicate selected images are ignored by URL or matching media ID, matching the existing Blog AI `addImages` behavior.

## Error Handling

If `/media/list` fails, the modal stays open and the notice area shows `媒体库读取失败：...`.

If no images match, the modal shows the existing guidance to refresh scanning in `媒体库SEO压缩`.

Images without `source_url` are shown as placeholders and cannot be applied to the Blog AI draft.

## Testing

Frontend service tests cover:

- Building the Blog AI media-library list path with search, status, issue, and pagination.
- Converting media-library rows into `BlogAIImage` objects with original SEO fields preferred.
- Falling back to generated SEO fields and filename when original fields are missing.

UI smoke tests cover:

- Blog AI renders `选择媒体库图片`.
- Blog AI keeps the existing upload and WordPress search controls.

## Acceptance Criteria

1. Blog AI users can open a picker for images from `/media/list`.
2. The picker supports search, status filter, SEO issue filter, pagination, and multi-select.
3. Applying selected images adds them to the Blog AI selected-image list.
4. Added images include media ID, source URL, title, alt text, and caption where available.
5. Existing local upload and WordPress media search behavior continues to work.
