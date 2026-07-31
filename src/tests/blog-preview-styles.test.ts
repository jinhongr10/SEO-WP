import assert from "node:assert/strict";
import test from "node:test";

import {
  BLOG_PREVIEW_FAQ_CSS,
  BLOG_PREVIEW_IMAGE_CSS,
  BLOG_PREVIEW_INTERNAL_LINK_CSS,
  BLOG_PREVIEW_LINK_CSS,
} from "../blogPreviewStyles.ts";

test("blog preview links are readable before hover", async () => {
  assert.match(BLOG_PREVIEW_LINK_CSS, /a,a:visited/);
  assert.match(BLOG_PREVIEW_LINK_CSS, /color:#1d4ed8!important/);
  assert.match(BLOG_PREVIEW_LINK_CSS, /a:hover,a:focus-visible/);
  assert.match(BLOG_PREVIEW_LINK_CSS, /outline:2px solid/);

  const { readFile } = await import("node:fs/promises");
  const root = new URL("../../", import.meta.url);
  const files = [
    "App.tsx",
    "components/BlogFormatDashboard.tsx",
    "components/BlogAIGeneratorDashboard.tsx",
  ];

  for (const file of files) {
    const source = await readFile(new URL(file, root), "utf8");
    assert.match(source, /BLOG_PREVIEW_LINK_CSS/, `${file} should use shared readable blog link styles`);
  }
});

test("bulk blog format related links keep a readable non-hover color", () => {
  assert.match(BLOG_PREVIEW_INTERNAL_LINK_CSS, /blog-internal-links a,.blog-internal-links a:visited/);
  assert.match(BLOG_PREVIEW_INTERNAL_LINK_CSS, /color:#0f766e!important/);
  assert.match(BLOG_PREVIEW_INTERNAL_LINK_CSS, /blog-internal-links a:hover/);
});

test("blog preview FAQ styling matches the plain article format", async () => {
  assert.match(BLOG_PREVIEW_FAQ_CSS, /\.wp-block-aioseo-faq\{background:transparent;border:0;box-shadow:none/);
  assert.match(BLOG_PREVIEW_FAQ_CSS, /\.aioseo-faq-block-question\{font-size:20px/);
  assert.match(BLOG_PREVIEW_FAQ_CSS, /\.aioseo-faq-block-answer\{font-size:18px/);

  const { readFile } = await import("node:fs/promises");
  const root = new URL("../../", import.meta.url);
  const files = [
    "App.tsx",
    "components/BlogFormatDashboard.tsx",
    "components/BlogAIGeneratorDashboard.tsx",
  ];

  for (const file of files) {
    const source = await readFile(new URL(file, root), "utf8");
    assert.match(source, /BLOG_PREVIEW_FAQ_CSS/, `${file} should use shared FAQ preview styles`);
  }
});

test("blog preview images are capped to a readable article width", async () => {
  assert.match(BLOG_PREVIEW_IMAGE_CSS, /blog-inline-image/);
  assert.match(BLOG_PREVIEW_IMAGE_CSS, /max-width:720px/);
  assert.match(BLOG_PREVIEW_IMAGE_CSS, /img\{width:100%;max-width:100%;height:auto/);

  const { readFile } = await import("node:fs/promises");
  const root = new URL("../../", import.meta.url);
  const files = [
    "App.tsx",
    "components/BlogFormatDashboard.tsx",
    "components/BlogAIGeneratorDashboard.tsx",
  ];

  for (const file of files) {
    const source = await readFile(new URL(file, root), "utf8");
    assert.match(source, /BLOG_PREVIEW_IMAGE_CSS/, `${file} should use shared readable blog image styles`);
  }
});

test("WordPress blog layout plugin caps inserted blog image blocks", async (t) => {
  const { access, readFile } = await import("node:fs/promises");
  const root = new URL("../../", import.meta.url);
  const files = [
    "wordpress-plugins/demo-brand-blog-layout/assets/blog-layout.css",
    "wordpress-plugins/demo-brand-blog-layout/assets/editor-blog-layout.css",
  ];

  for (const file of files) {
    const url = new URL(file, root);
    try {
      await access(url);
    } catch {
      t.skip("WordPress plugin fixtures are not included in this desktop workspace.");
      return;
    }
    const source = await readFile(url, "utf8");
    assert.match(source, /wp-block-image\.blog-inline-image/, `${file} should target inserted blog image blocks`);
    assert.match(source, /wp-block-image:not\(\.alignwide\):not\(\.alignfull\)/, `${file} should cap ordinary WordPress image blocks`);
    assert.match(source, /max-width:\s*720px/, `${file} should cap inserted blog images to 720px`);
  }
});
