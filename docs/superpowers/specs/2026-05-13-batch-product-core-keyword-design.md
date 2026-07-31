# Batch Product Core Keyword Design

## Goal

Allow a user to select multiple WooCommerce products, enter one core SEO keyword, choose generated fields, and run AI generation so every selected product uses the same keyword guidance.

## Design

Add a visible "批量核心关键词" input in the WooCommerce product SEO toolbar near the batch AI controls. The input uses the existing `seoKeywords` state so single-field generation and batch generation remain consistent.

Batch AI generation continues to call `POST /api/products/generate-batch`. The request body includes the selected product IDs, selected AI fields except `slug`, generation language, optional templates, and a trimmed `seo_keywords` value. The backend already applies `seo_keywords` to supported fields: `short_description`, `description`, `acf_seo_extra_info`, `aioseo_title`, `aioseo_description`, and `tag_names`.

## Field Behavior

The shared keyword applies only to AI-generated fields. `slug` remains sync-only and is not included in batch AI generation.

## Testing

Add tests for the batch request payload helper and static rendering of the new toolbar input.
