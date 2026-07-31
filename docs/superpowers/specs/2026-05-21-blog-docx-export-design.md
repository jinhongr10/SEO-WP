# Blog DOCX Export Design

## Goal

Make all blog writing and editing flows download the current edited blog body as a real `.docx` file.

## Approved Direction

Use browser-side DOCX generation. The export must use the text currently visible in the editor, not an optimized preview, WordPress draft body, or previously generated version.

## Included Blog Surfaces

- The normal Blog writing, rewrite, and refinement workflow in `App.tsx`.
- The `展会/证书/项目blog` workflow in `components/BlogAIGeneratorDashboard.tsx`.

The bulk Blog format preview workflow is not included in this version because it is a preview and batch-apply tool, not a direct blog writing or editing editor.

## Export Behavior

The normal Blog workflow exports `blogState.content` only. If an optimization preview exists, the export still ignores it.

The `展会/证书/项目blog` workflow exports `generated.html` only. If the user edits the HTML body textarea, the exported document reflects that edited HTML.

Both exports produce a `.docx` filename based on the current title. If the title is empty, the filename falls back to `blog-post.docx`.

## Implementation Shape

Add a shared frontend module, `src/blogDocxExport.ts`, responsible for:

- Cleaning and normalizing the output filename.
- Converting Markdown-ish text into simple document blocks for the normal Blog workflow.
- Converting HTML into simple document blocks for the AI Blog workflow.
- Packaging a minimal Office Open XML `.docx` zip in the browser.
- Triggering the browser download.

The module should support the content structures the app already emits and edits most often:

- Paragraphs.
- H1/H2/H3 headings.
- Bullet and numbered lists.
- Simple tables.
- Basic inline links as readable text.

Image binary embedding is out of scope for the first version. If HTML contains images, the exported DOCX may include the image alt text, caption, or URL as text rather than embedding the image file.

## UI Changes

In the normal Blog editor, replace the current Word-compatible `.doc` download with a real `.docx` download. The visible label should clearly say `Download DOCX` or equivalent.

In the `展会/证书/项目blog` generated result panel, add a DOCX download button near the HTML body editor. The button is enabled only when `generated.html` has content.

## Testing

Add focused frontend tests for the shared export module:

- Filename sanitization always returns a `.docx` filename.
- Generated output starts as a ZIP document and includes core Word document entries.
- Markdown input writes heading and paragraph text into `word/document.xml`.
- HTML input writes heading and paragraph text into `word/document.xml`.

Add or update component-level static markup tests only if the existing test setup can verify the new buttons without brittle DOM simulation.

## Acceptance Criteria

1. Normal Blog writing, rewriting, and refining can download the current editor body as `.docx`.
2. Existing optimized preview content is not exported unless it is copied into the main editor body.
3. The `展会/证书/项目blog` HTML body editor can download its current body as `.docx`.
4. Downloaded files use the `.docx` extension, not `.doc`.
5. Generated DOCX files open as valid Word/OpenXML documents.

## Non-Goals

- Server-side DOCX generation.
- Exporting optimized preview content by default.
- Batch DOCX export from the bulk formatting screen.
- Pixel-perfect Word styling.
- Embedding remote or WordPress media images into the DOCX file.

## Notes

This workspace is not a git repository, so the usual Superpowers commit step cannot be performed here.
