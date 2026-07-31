# Certificate Blog Explainer Structure Design

## Goal

Improve certificate/compliance Blog generation so certificate posts follow a stable explainer-page structure like the revised RoHS document. The generated article should help B2B buyers understand what the certificate means, which Demo Brand products or models it covers, why it matters for procurement, and how to confirm the documented scope.

## Recommended Approach

Use a backend-controlled certificate outline template, then let AI expand the sections into polished copy. This is safer than free-form prompt guidance because it gives every certificate article the same evidence-first order while preserving natural language generation.

The frontend may keep the current certificate fields. Field labels and placeholders can be improved, but this design does not require a full certificate database UI.

## Certificate Article Structure

For `articleType === "certificate"`, generated outlines and full articles should follow this order:

1. Title
   - Format around the certificate type, product line, and buyer value.
   - Example: `Demo Brand RoHS Certified Travel Fans - Safe, Compliant & Sustainable deployment site Solutions`.
2. Opening introduction
   - Introduce Demo Brand, deployment site expertise, and the certificate as a documented trust signal.
   - Avoid putting images or certificate galleries before the text introduction.
3. `What Does [Certification Type] Certification Mean?`
   - Explain the certification in practical buyer language.
   - Include standards or restricted substances only when supported by user input or company knowledge.
4. `Benefits of Choosing [Certification Type] Certified Products`
   - Cover user safety, project compliance, tender competitiveness, sustainability, and brand trust.
5. `Demo Brand [Certification Type] Certified [Product Line]`
   - Explain Demo Brand manufacturing, material control, testing, and quality process.
6. `Covered Product Models`
   - Show applicable models as a separate paragraph, list, or table.
   - The models must come only from `applicableModels` or verified company context.
7. `Verified [Certification Type] Compliance`
   - State that compliance is supported by documentation.
   - Include the confirmed scope statement.
8. `Certificate Statement`
   - Include a concise certificate statement based on `scopeStatement`.
   - Do not invent certificate number, issuing lab, date, expiry, or test standard.
9. `Certificate Image`
   - Place the selected certificate image here if the final HTML includes one.
   - Do not place certificate images at the beginning of the article.
10. `Who Benefits from Demo Brand [Certification Type] Certified Products?`
    - Include partners/importers, project contractors/developers, facility teams, and customization partners when relevant.
11. `Beyond Compliance`
    - Connect the certificate to Demo Brand sustainability, quality management, and durable deployment site products.
12. `Why Global Buyers Choose Demo Brand`
    - List factory-direct value, customization support, quality control, export experience, and after-sales support only when supported by company context.
13. Closing CTA
    - Invite buyers to request catalogs, quote, samples, project support, or certificate confirmation.
14. FAQ
    - Answer 3-5 procurement questions without expanding certificate scope.

## Safety Rules

- Never claim that all Demo Brand products hold a certification unless the confirmed scope says so.
- Never cross-apply a certificate from one model to another.
- ISO 9001 must be described as a company quality management system certification, not a product certification.
- Certificate image recognition is supporting context, not proof of scope.
- If the certificate is not manually confirmed, draft creation remains blocked.
- If a fact is missing, add a warning or write around it.

## Backend Changes

Update `_blog_ai_certificate_prompt_rules()` in `backend/main.py` so the model receives the exact certificate explainer structure above.

For `/blog-ai/outline`, certificate outlines should explicitly require:

- The fixed H2/H3 structure.
- A distinct covered-models section.
- Certificate image placement after the certificate statement.
- Missing/risky fact warnings.

For `/blog-ai/generate`, certificate generation should require:

- Gutenberg-friendly HTML using `h2`, `h3`, `p`, `ul`, `ol`, and optionally a simple `table`.
- No leading image blocks.
- Covered models as an explicit list or table.
- Warnings for missing certificate scope, file name, applicable models, or unsupported claims.

## Frontend Changes

The existing certificate form can stay in place. Small copy improvements are useful:

- `证书范围声明` placeholder should tell the user to paste the exact certificate scope.
- `适用型号` placeholder should show comma-separated models.
- The manual confirmation checkbox should mention certification type, covered products/models, and scope.

No new multi-step certificate database selector is required for this iteration.

## Testing

Add or update backend tests for:

1. `_blog_ai_base_prompt()` includes the approved certificate explainer outline.
2. Certificate prompt rules include `Covered Product Models`, `Certificate Statement`, and delayed certificate image placement.
3. Certificate draft creation still blocks when `confirmedByUser` is false.
4. Certificate draft HTML still strips leading image blocks.

Add or update frontend tests only if certificate field labels or placeholders change.

## Acceptance Criteria

1. Certificate Blog outline generation follows the certificate explainer structure.
2. Certificate full article generation keeps covered models visible as a separate section.
3. Certificate images are not inserted before the article introduction.
4. Generated content does not expand certification scope beyond confirmed facts.
5. Existing exhibition, project, and video Blog generation behavior remains unchanged.
6. Existing certificate manual-confirmation safety behavior remains unchanged.
