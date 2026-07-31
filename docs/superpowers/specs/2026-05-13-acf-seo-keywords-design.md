# ACF SEO Keywords Design

## Goal

ACF Extra Info -- SEO (`acf_seo_extra_info`, synced to the ACF field named `short_description`) should be generated with awareness of the current `SEO Core Keywords` input.

## Current Behavior

The product SEO dashboard sends `seo_keywords` to the backend for single-field and batch generation. The backend includes `acf_seo_extra_info` in the keyword-aware field list, but treats the entire comma-separated keyword string as one primary keyword. The UI hint also says the keyword input affects Description and AIOSEO fields, which makes ACF support unclear.

## Design

Normalize `SEO Core Keywords` on the backend into a primary keyword plus secondary keywords. For ACF Extra Info, the prompt should ask the model to use the primary keyword or one close secondary keyword naturally in sentence 1 or sentence 2, while preserving the existing short card-copy style and word limit.

The UI should state that the keyword input is used by ACF Extra Info as well as Description, Tags, and AIOSEO fields. The keyword input should remain visible when filtering for ACF-empty products so users can provide keywords before generating ACF copy.

## Testing

Add focused backend tests for keyword prompt generation so comma-separated keywords are parsed into primary and secondary terms, and ACF-specific placement rules are explicit. Add or update frontend rendering tests so the dashboard text reflects ACF keyword support.

## Constraints

No database schema changes are needed. No WordPress sync behavior changes are needed. The project directory is not a git repository, so no design commit can be created here.
