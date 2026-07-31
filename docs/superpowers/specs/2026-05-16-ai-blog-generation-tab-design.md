# AI Blog Generation Tab Design

## Goal

Build a `展会/证书/项目blog` tab that lets Demo Brand create a single WordPress blog draft from a small set of inputs: article type, images, exhibition, certificate, or project facts, keywords, and related products. The tab supports exhibition recap blogs, certificate/compliance blogs, and project case study blogs in one guided workflow.

## User Workflow

1. Select the article type:
   - Exhibition recap blog
   - Certificate/compliance blog
   - Project case study blog
2. Add images:
   - Upload local images to the WordPress media library.
   - Search/select existing WordPress media images.
   - Review or edit each image purpose, alt text, caption, and insertion hint.
3. Enter article facts:
   - Exhibition articles collect event name, date, location, booth number, featured products, visitor highlights, buyer questions, and CTA notes.
   - Certificate articles collect certification type, applicable products, applicable models, scope statement, certificate source, certificate file name, and a manual confirmation checkbox.
   - Project articles collect project name, client/project name disclosure preference, location, scenario, installed products, application areas, needs, solution, results, public date, and CTA notes.
4. Generate an outline first.
5. Review/edit the outline.
6. Generate the full blog article, SEO title, SEO description, excerpt, FAQ, CTA, image alt text, image captions, and warnings.
7. Preview and edit the Gutenberg-friendly HTML.
8. Save the result as a WordPress draft.

## First-Version Scope

The first version supports one article at a time. It creates WordPress drafts only; it never directly publishes posts. It does not include batch generation, a complex history system, or automatic certificate authenticity verification.

## Data Model

The UI maintains a `BlogAIGenerationDraft` with these groups:

- Base fields:
  - `articleType`: `exhibition`, `certificate`, or `project`
  - `language`
  - `topic`
  - `targetKeywords`
  - `targetAudience`
  - `relatedProducts`
  - `relatedCategories`
- Image fields:
  - `mediaId`
  - `url`
  - `altText`
  - `caption`
  - `purpose`
  - `insertHint`
- Exhibition fields:
  - `eventName`
  - `eventDate`
  - `eventLocation`
  - `boothNumber`
  - `featuredProducts`
  - `visitorHighlights`
  - `buyerQuestions`
  - `followUpCta`
- Certificate fields:
  - `certificateSource`
  - `certificationType`
  - `applicableProducts`
  - `applicableModels`
  - `scopeStatement`
  - `certificateFileName`
  - `confirmedByUser`
- Project fields:
  - `projectName`
  - `discloseClientName`
  - `clientOrProjectName`
  - `projectLocation`
  - `projectScenario`
  - `installedProducts`
  - `applicationAreas`
  - `projectNeeds`
  - `solutionProvided`
  - `projectResults`
  - `projectDate`
  - `projectCta`
- Generated fields:
  - `outline`
  - `markdown`
  - `html`
  - `seoTitle`
  - `seoDescription`
  - `excerpt`
  - `faq`
  - `cta`
  - `warnings`

## Backend API

Add a `/blog-ai/*` API surface:

- `POST /blog-ai/upload-image`
  - Uploads a local image to the WordPress media library.
  - Returns the WordPress media id, URL, current alt text, caption, and title.
- `GET /blog-ai/media`
  - Searches WordPress media items so the user can select existing images.
- `POST /blog-ai/outline`
  - Generates a structured outline from the draft inputs.
- `POST /blog-ai/generate`
  - Generates full blog content, SEO metadata, FAQ, CTA, image alt text, image captions, and warnings from the confirmed outline.
- `POST /blog-ai/create-draft`
  - Creates a WordPress draft post with the final title, HTML content, excerpt, and optional AIOSEO metadata.

Existing blog AI and blog formatting logic can be reused where appropriate, but the new endpoints stay separate from the existing bulk format workflow.

## AI Generation Rules

Generation happens in two stages:

1. Outline generation:
   - Produces title ideas, H2/H3 structure, image placement notes, FAQ direction, CTA direction, and warnings.
   - Does not create or save WordPress content.
2. Full article generation:
   - Uses the reviewed outline and confirmed facts.
   - Produces Gutenberg-friendly HTML, SEO metadata, excerpt, FAQ, CTA, image metadata, and warnings.

The prompts use the existing company knowledge, keyword database, provided article facts, and image metadata. The generated copy targets English-speaking B2B buyers such as partners, project buyers, facility teams, enterprises, institutions, campuses, retailers, and customization customers.

## Certificate Safety Rules

Certificate/compliance articles must be conservative:

- The user must manually confirm certification type, applicable products or models, and scope before the draft can be created.
- AI image recognition is treated as a suggestion, not a verified source.
- The article must not claim that all products hold a certification unless a verified source explicitly supports that scope.
- ISO 9001 may be described as a company quality management system certification, not as a product certification.
- If a certificate is not present in the internal certificate database or manually confirmed, the UI and generated output must show a warning.
- Draft creation is blocked when `articleType` is `certificate` and `confirmedByUser` is false.

## Exhibition Content Rules

Exhibition articles must avoid invented business facts:

- Do not invent event dates, locations, visitor counts, order amounts, customer names, or countries.
- If an event fact is missing, write around it or show a warning.
- Images may support booth, display, product, factory, or customer-interest descriptions, but they cannot justify unsupported claims.
- CTA copy should guide buyers to request catalogs, quotes, samples, customization details, or project recommendations.

## Project Content Rules

Project case articles must stay useful without exposing private buyer information:

- If `discloseClientName` is false, do not send the entered client or project name into the AI prompt, and do not mention it in the article. Refer to the case by location and scenario, such as a enterprise project in Dubai.
- Do not invent customer names, exact addresses, order amounts, installation quantities, project size, dates, or performance results.
- If the exact project date is missing or not public, use broad wording or omit the date.
- Images may support deployment site, installation area, product detail, packing, delivery, or finished application descriptions, but they cannot justify unsupported claims.
- CTA copy should guide buyers to request a similar project recommendation, quote, sample, customization support, or installation/product selection advice.

## WordPress Draft Behavior

Saving creates a WordPress post with status `draft`. The generated HTML inserts selected images using normal WordPress image markup with alt text and captions. The draft save flow also attempts to sync AIOSEO title and description through the existing AIOSEO helper when available, returning a warning if that metadata sync fails.

## Acceptance Criteria

1. Uploading two to five exhibition images can produce an English exhibition recap draft.
2. Selecting or uploading a certificate image can produce an English certificate/compliance draft after manual scope confirmation.
3. Entering project location, scenario, products, needs, solution, results, and disclosure preference can produce an English project case study draft.
4. Selected images appear in the WordPress draft body with editable alt text and captions.
5. SEO title is at most 60 characters and SEO description is at most 160 characters.
6. Certificate drafts cannot be created until scope is manually confirmed.
7. Project drafts do not expose the client/project name when the disclosure toggle is off.
8. The preview renders Gutenberg-friendly HTML that follows the existing blog format rules.
9. Created posts remain in WordPress `draft` status for final human review.

## Non-Goals

- Batch article generation.
- Direct publishing.
- Automatic legal verification of certificate authenticity.
- Long-term content calendar generation.
- Full certificate database management UI.
