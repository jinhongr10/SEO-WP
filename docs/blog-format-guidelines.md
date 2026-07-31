# Blog Format Guidelines

This guide defines the standard format for WordPress blog posts generated for the active site. The goal is a professional reading experience that remains easy to edit in WordPress Gutenberg.

## Content Model

Use WordPress-native blocks only:

- Heading block for H2 and H3.
- Paragraph block for body text.
- Table block for comparisons and specifications.
- List block for bullets and numbered steps.
- Image or Gallery block for visuals.
- Group block only for TOC, quick answer, CTA, and related resources.

Avoid Elementor layouts inside blog articles, dense inline CSS, pasted table-like plain text, and custom shortcode layouts for normal editorial content.

## Typography

- Font family: inherit the site font; recommended stack is `Inter, Arial, Helvetica, sans-serif`.
- Body font size: `17px` on desktop, `16px` on mobile.
- Body line height: `1.75`.
- Body color: `#334155`.
- Article content width: `820px` max for normal body content.
- Wide media/table width: up to `1040px` when needed.

## Headings

- H1 is controlled by the theme/template, not manually inserted inside article content.
- H2: `32px` desktop, `26px` mobile; line height `1.22`; margin top `44px`; margin bottom `14px`.
- H3: `23px` desktop, `21px` mobile; line height `1.35`; margin top `30px`; margin bottom `10px`.
- Do not use heading blocks only to make text large. Use headings for structure.

## Paragraphs

- Paragraph margin bottom: `18px`.
- Keep paragraphs short: usually 2-4 sentences.
- Avoid forced line breaks for spacing. Use block spacing.
- Links should be blue, readable, and not visually overpower the paragraph.

## Tables

- Use real Table blocks for comparisons.
- Header row background: deep blue `#12344d`.
- Header text: white.
- Cell border: `#dbe5ec`.
- Cell padding: `14px 16px`.
- Table font size: `15px`.
- On mobile, tables may scroll horizontally.

## Images

- Use Image, Gallery, or Figure blocks.
- Image border radius: `8px`.
- Image margin: `28px auto`.
- Caption font size: `14px`.
- Caption color: `#64748b`.
- Captions should explain the image, not repeat alt text mechanically.

## TOC

- Add a table of contents when an article has at least 3 H2/H3 sections.
- TOC uses a Group block with class `blog-toc`.
- TOC should appear after the introduction.

## Quick Answer

- For comparison or buying-guide posts, add a short answer near the top.
- Use Group block class `blog-quick-answer`.
- Keep it to 1-2 short paragraphs.

## CTA

- CTA uses Group block class `blog-cta`.
- CTA should be specific to the active site's verified offer, such as quote, demo, catalog, consultation, sample request, booking, or another action supported by uploaded knowledge.
- Do not repeat the same CTA after every section.

## Related Resources

- Related links use Group block class `blog-internal-links`.
- Prefer product, category, and service pages before other blog posts.
- Use no more than 6 links unless the article is a long pillar guide.

## WordPress Editing Rules

- If a user opens `Edit Post`, every main part should be editable as a normal block.
- Avoid custom HTML blocks except when preserving legacy content that cannot be safely converted.
- Do not paste tables as plain text with `|` separators; convert them to Table blocks.
- Do not add inline font-size/color styles in individual posts.
