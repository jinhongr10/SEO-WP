import unittest
from pathlib import Path

from backend.blog_formatting import (
    BlogFormatSummary,
    append_blog_faq_section,
    build_blog_backup_payload,
    build_blog_format_preview_item,
    format_editor_friendly_blog_html,
    summarize_blog_format,
)


class BlogFormattingTests(unittest.TestCase):
    def test_markdown_table_becomes_gutenberg_table_block(self):
        content = """# Main Title

Intro paragraph for the article.

## Key Differences

| Factor | Automatic | Manual |
| --- | --- | --- |
| Operation | Touch-free sensor | Press button |
| Cost | Higher upfront | Lower upfront |
"""

        result = format_editor_friendly_blog_html(content)

        self.assertIn("<!-- wp:heading", result.html)
        self.assertIn("<h2>Key Differences</h2>", result.html)
        self.assertIn("<!-- wp:table", result.html)
        self.assertIn("<table", result.html)
        self.assertIn("<th>Factor</th>", result.html)
        self.assertIn("<td>Touch-free sensor</td>", result.html)
        self.assertNotIn("<h1>", result.html)
        self.assertGreaterEqual(result.summary.tableCount, 1)

    def test_existing_plain_html_headings_are_normalized_to_editable_blocks(self):
        content = """
<h1>Automatic vs Manual Product Samples</h1>
<p>Manual product samples require pressing a lever.</p>
<h3>Maintenance</h3>
<p>Automatic models require sensor checks.</p>
"""

        result = format_editor_friendly_blog_html(content)

        self.assertIn('<!-- wp:heading {"level":2} -->', result.html)
        self.assertIn("<h2>Automatic vs Manual Product Samples</h2>", result.html)
        self.assertIn("<!-- wp:paragraph -->", result.html)
        self.assertIn("<!-- wp:heading {\"level\":3} -->", result.html)
        self.assertEqual(result.summary.headingCount, 2)

    def test_markdown_lists_use_current_gutenberg_list_item_markup(self):
        content = """## Compliance checklist

- Product safety
- Environmental responsibility
- Regulatory compliance
"""

        result = format_editor_friendly_blog_html(content)

        self.assertIn("<!-- wp:list -->", result.html)
        self.assertIn('<ul class="wp-block-list">', result.html)
        self.assertIn("<!-- wp:list-item -->", result.html)
        self.assertIn("<li>Product safety</li>", result.html)
        self.assertNotIn("<ul><li>", result.html)

    def test_existing_gutenberg_malformed_nested_lists_are_collapsed(self):
        content = """
<!-- wp:paragraph -->
<p>This certification demonstrates our commitment to:</p>
<!-- /wp:paragraph -->
<ul class="wp-block-list">
  <li style="list-style-type: none;"><ul></ul></li>
</ul>
<ul>
  <li style="list-style-type: none;"><ul><li>Product safety</li></ul></li>
</ul>
<ul>
  <li style="list-style-type: none;"><ul><li>Environmental responsibility</li></ul></li>
</ul>
<ul>
  <li style="list-style-type: none;"><ul><li>Regulatory compliance</li></ul></li>
</ul>
"""

        result = format_editor_friendly_blog_html(content)

        self.assertEqual(result.html.count("<!-- wp:list -->"), 1)
        self.assertEqual(result.html.count("<!-- wp:list-item -->"), 3)
        self.assertIn('<ul class="wp-block-list">', result.html)
        self.assertIn("<li>Product safety</li>", result.html)
        self.assertNotIn("list-style-type", result.html)
        self.assertNotIn("<ul></ul>", result.html)

    def test_existing_gutenberg_bare_single_image_figure_becomes_centered_block(self):
        content = """
<!-- wp:paragraph -->
<p>Certificate Statement:</p>
<!-- /wp:paragraph -->
<figure><img src="https://example.com/rohs.jpg" alt="RoHS certificate" width="639" height="878" />
<figcaption>Official RoHS Declaration of Conformity</figcaption></figure>
"""

        result = format_editor_friendly_blog_html(content)

        self.assertIn('<!-- wp:image {"align":"center","sizeSlug":"large","linkDestination":"none","className":"blog-inline-image"} -->', result.html)
        self.assertIn('<figure class="wp-block-image aligncenter size-large blog-inline-image">', result.html)
        self.assertIn('src="https://example.com/rohs.jpg"', result.html)
        self.assertIn("Official RoHS Declaration of Conformity", result.html)
        self.assertNotIn("<figure><img", result.html)
        self.assertNotIn('style="max-width', result.html)

    def test_warns_for_elementor_and_shortcodes_without_destroying_content(self):
        content = """
<!-- wp:paragraph -->
<p>[contact-form-7 id="1"]</p>
<!-- /wp:paragraph -->
<div data-elementor-type="wp-post">Legacy content</div>
"""

        result = format_editor_friendly_blog_html(content)

        self.assertIn("[contact-form-7", result.html)
        self.assertTrue(any("shortcode" in warning.lower() for warning in result.warnings))
        self.assertTrue(any("elementor" in warning.lower() for warning in result.warnings))

    def test_summary_counts_editor_blocks(self):
        html = """
<!-- wp:heading {"level":2} -->
<h2>Choosing The Right Product Sample</h2>
<!-- /wp:heading -->
<!-- wp:paragraph -->
<p>Contact <a href="https://example.com/contact-us/">Demo Brand</a>.</p>
<!-- /wp:paragraph -->
<!-- wp:image -->
<figure class="wp-block-image"><img src="https://example.com/a.jpg" alt="Product sample"/><figcaption>Product sample</figcaption></figure>
<!-- /wp:image -->
"""

        summary = summarize_blog_format(html)

        self.assertEqual(
            summary,
            BlogFormatSummary(
                wordCount=10,
                headingCount=1,
                tableCount=0,
                imageCount=1,
                linkCount=1,
                hasEditorFriendlyBlocks=True,
            ),
        )

    def test_backup_payload_keeps_original_post_fields(self):
        row = {
            "id": 8517,
            "status": "publish",
            "slug": "automatic-vs-manual",
            "link": "https://example.com/automatic-vs-manual/",
            "modified": "2026-01-08T09:18:00",
            "title": {"raw": "Automatic vs Manual"},
            "content": {"raw": "<p>Original</p>"},
            "excerpt": {"raw": "Original excerpt"},
        }

        payload = build_blog_backup_payload(row)

        self.assertEqual(payload["id"], 8517)
        self.assertEqual(payload["status"], "publish")
        self.assertEqual(payload["title"], "Automatic vs Manual")
        self.assertEqual(payload["content"], "<p>Original</p>")
        self.assertEqual(payload["excerpt"], "Original excerpt")

    def test_preview_item_compares_original_and_optimized_format(self):
        row = {
            "id": 8517,
            "status": "draft",
            "slug": "automatic-vs-manual",
            "link": "https://example.com/automatic-vs-manual/",
            "modified": "2026-01-08T09:18:00",
            "title": {"raw": "Automatic vs Manual"},
            "content": {"raw": "## Key Differences\n\n| Factor | Automatic |\n| --- | --- |\n| Cost | Higher |"},
        }
        optimized = format_editor_friendly_blog_html(row["content"]["raw"])

        item = build_blog_format_preview_item(
            row,
            optimized_html=optimized.html,
            formatter_warnings=optimized.warnings,
            optimizer_warnings=["Pages skipped"],
        )

        self.assertEqual(item["id"], 8517)
        self.assertEqual(item["status"], "draft")
        self.assertEqual(item["title"], "Automatic vs Manual")
        self.assertEqual(item["before"]["hasEditorFriendlyBlocks"], False)
        self.assertEqual(item["after"]["hasEditorFriendlyBlocks"], True)
        self.assertEqual(item["after"]["tableCount"], 1)
        self.assertEqual(item["warnings"], ["Pages skipped"])

    def test_append_blog_faq_section_uses_existing_article_sections(self):
        html = """
<!-- wp:paragraph -->
<p>Automatic product samples reduce touchpoints in busy deployment sites and help teams manage maintenance more consistently.</p>
<!-- /wp:paragraph -->
<!-- wp:heading {"level":2} -->
<h2>Maintenance</h2>
<!-- /wp:heading -->
<!-- wp:paragraph -->
<p>Automatic models need sensor checks and battery replacement, while manual products usually require simpler pump cleaning.</p>
<!-- /wp:paragraph -->
<!-- wp:heading {"level":2} -->
<h2>Installation</h2>
<!-- /wp:heading -->
<!-- wp:paragraph -->
<p>compact units should be placed at a comfortable height and fixed to a stable surface for daily public use.</p>
<!-- /wp:paragraph -->
"""

        updated, items = append_blog_faq_section(
            html,
            title="Automatic vs Manual Product Samples",
        )

        self.assertIn("<!-- wp:aioseo/faq ", updated)
        self.assertIn('class="wp-block-aioseo-faq"', updated)
        self.assertIn("Frequently Asked Questions", updated)
        self.assertIn('class="aioseo-faq-block-question"', updated)
        self.assertIn('class="aioseo-faq-block-answer"', updated)
        self.assertIn("Q: What should readers know about Maintenance", updated)
        self.assertNotIn("buyers", updated.lower())
        self.assertIn('<p class="has-medium-font-size" style="line-height:2">A: Automatic models need sensor checks', updated)
        self.assertNotIn("<strong>A:</strong>", updated)
        self.assertGreaterEqual(len(items), 3)
        self.assertTrue(any("Maintenance" in item["question"] for item in items))
        self.assertIn("sensor checks and battery replacement", updated)

    def test_legacy_blog_faq_section_converts_to_aioseo_blocks(self):
        html = """
<!-- wp:group {"className":"blog-faq"} -->
<div class="wp-block-group blog-faq"><h2>Frequently Asked Questions</h2><div class="blog-faq-item"><p class="blog-faq-question"><strong>Q: What is the ordering constraints?</strong></p><p class="blog-faq-answer">A: Demo Brand can discuss trial and volume order quantities.</p></div></div>
<!-- /wp:group -->
"""

        updated, items = append_blog_faq_section(html, title="Product Sample")

        self.assertIn("<!-- wp:aioseo/faq ", updated)
        self.assertIn('class="wp-block-aioseo-faq"', updated)
        self.assertIn("Q: What is the ordering constraints?", updated)
        self.assertIn("A: Demo Brand can discuss trial and volume order quantities.", updated)
        self.assertNotIn('class="wp-block-group blog-faq"', updated)
        self.assertEqual(items, [])

    def test_append_blog_faq_section_does_not_duplicate_existing_faq(self):
        html = """
<!-- wp:aioseo/faq {"question":"\u003cstrong\u003eQ: Can Demo Brand provide samples?\u003c/strong\u003e","schemaBlockId":"aioseo-existing"} -->
<div data-schema-only="false" class="wp-block-aioseo-faq"><h3 class="aioseo-faq-block-question"><strong>Q: Can Demo Brand provide samples?</strong></h3><div class="aioseo-faq-block-answer"><p>A: Demo Brand can discuss sample requests.</p></div></div>
<!-- /wp:aioseo/faq -->
"""

        updated, items = append_blog_faq_section(html, title="Product Sample")

        self.assertEqual(updated, html)
        self.assertEqual(items, [])

    def test_blog_layout_css_styles_faq_and_related_product_cards(self):
        root = Path(__file__).resolve().parents[2]
        css_path = root / "wordpress-plugins/demo-brand-blog-layout/assets/blog-layout.css"
        if not css_path.exists():
            self.skipTest("WordPress plugin fixtures are not included in this desktop workspace.")
        frontend_css = css_path.read_text()
        editor_css = (root / "wordpress-plugins/demo-brand-blog-layout/assets/editor-blog-layout.css").read_text()

        self.assertIn(".single-post .wp-block-aioseo-faq", frontend_css)
        self.assertIn(".single-post .blog-related-card", frontend_css)
        self.assertIn(".single-post .blog-related-card img", frontend_css)
        self.assertIn(".single-post .blog-internal-links a", frontend_css)
        self.assertIn(".editor-styles-wrapper .wp-block-aioseo-faq", editor_css)
        self.assertIn(".editor-styles-wrapper .blog-related-card", editor_css)
        self.assertIn("background: transparent;", frontend_css)
        self.assertIn("border: 0;", frontend_css)
        self.assertIn("box-shadow: none;", frontend_css)
        self.assertIn("background: transparent;", editor_css)
        self.assertIn("border: 0;", editor_css)
        self.assertIn("box-shadow: none;", editor_css)


if __name__ == "__main__":
    unittest.main()
