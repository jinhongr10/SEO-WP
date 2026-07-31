# Client Skill Pack Builder Design

Date: 2026-06-21

## Summary

Add a customer-facing Skill Pack workflow to the SEO and WordPress operations app. The app should let different operators create or select a customer workspace, upload customer-specific materials, organize those materials into company information, product information, and product keywords, then generate a reusable Gemini-ready Skill Pack. Published Skill Packs are reused by blog generation, product SEO, image SEO, page planning, SEO audit repairs, and related AI workflows.

This is not a Codex `SKILL.md` runtime feature. In the app, a "Skill Pack" is a structured prompt and knowledge package that the backend sends to Gemini with each AI task.

## Goals

- Make the product suitable for other people and teams, not just one local operator.
- Keep customer data isolated by customer workspace.
- Split uploaded customer material into three clear source types: company information, product information, and product keywords.
- Generate a structured Skill Pack from those source types with Gemini.
- Require human review before a generated Skill Pack is published and reused.
- Make the current customer and Skill Pack status visible from the command center.
- Reuse the published Skill Pack automatically across existing AI workspaces.

## Non-Goals

- Do not expose Codex plugin skills or local `SKILL.md` files to end users.
- Do not train or fine-tune a model.
- Do not automatically publish unreviewed AI-generated facts.
- Do not replace the existing built-in keyword category files in the first implementation.
- Do not build full role-based access control in the first pass unless the app already has the required authentication layer ready.

## User Model

The app should distinguish three concepts:

- Operator: the person using the software.
- Customer workspace: the company or site being served, such as `Demo Brand / example.com`.
- Skill Pack: the reviewed, reusable AI instruction package for that customer.

UI copy should avoid "my configuration" or "my customer." Use labels such as "current workspace," "service customer," "customer configuration," and "customer Skill Pack."

## Source Types

### Company Information

Company information tells Gemini who the customer is, what can be claimed, and what must not be invented.

Examples:

- Company profile
- Brand name and site URL
- Target customers and markets
- Factory, supply chain, customization, and service capabilities
- Certificates and compliance documents
- Brand voice and writing examples
- Forbidden or unverified claims

Output responsibility:

- Brand identity
- Trust boundaries
- Allowed selling points
- Claims that require source evidence
- Tone and writing constraints

### Product Information

Product information tells Gemini what the customer sells and what facts are available.

Examples:

- Product categories
- Product names and model numbers
- Materials, dimensions, colors, installation methods, and applications
- Catalogs, manuals, spec sheets, product images, and existing product pages
- Product-to-category mapping

Output responsibility:

- Product facts
- Product-page content grounding
- Image SEO context
- FAQ and buyer objection support
- Avoiding generic unsupported product copy

### Product Keywords

Product keywords tell Gemini which search language should be used and where.

Examples:

- Core keywords
- Long-tail keywords
- B2B intent keywords
- Scenario and market keywords
- Exclusion terms
- Priority levels
- Category or product mapping

Output responsibility:

- SEO title and H1 guidance
- Meta description language
- H2/H3 and body keyword use
- FAQ and internal-link opportunities
- Preventing keyword stuffing and consumer-intent drift

## Skill Pack Shape

A published customer Skill Pack should have this conceptual structure:

```json
{
  "clientName": "Demo Brand",
  "siteUrl": "https://example.com",
  "version": 1,
  "status": "published",
  "companySkill": {
    "summary": "Who the customer is and what they sell.",
    "brandVoice": "Writing tone and positioning.",
    "allowedClaims": ["Verified claims only."],
    "forbiddenClaims": ["Claims that cannot be used without evidence."]
  },
  "productSkill": {
    "categories": [],
    "models": [],
    "factRules": "Use product facts from uploaded sources before generic copy."
  },
  "keywordSkill": {
    "libraries": [],
    "priorityRules": "Use high-priority B2B keywords in title/H1, supporting keywords in body and FAQ.",
    "excludedTerms": []
  },
  "taskSkills": {
    "blog": "Blog generation rules.",
    "productPage": "Product page generation rules.",
    "imageSeo": "Image filename/title/alt/caption/description rules.",
    "pagePlanner": "Page planning and internal-link rules.",
    "seoAuditRepair": "Rules for repairing imported SEO issues."
  },
  "sourceFiles": []
}
```

The final stored format can be JSON in the backend plus editable text sections in the UI. The UI should present it as readable sections, not as raw JSON by default.

## Workflow

1. Operator creates or selects a customer workspace.
2. Operator uploads source files and tags each file as company information, product information, or product keywords.
3. The app extracts text from supported files.
4. Operator clicks "Generate Skill Pack."
5. Backend sends the grouped source material to Gemini with a strict extraction prompt.
6. Gemini returns a draft Skill Pack with source-aware sections.
7. Operator reviews, edits, and confirms the draft.
8. Operator publishes the Skill Pack.
9. Existing AI workflows automatically attach the published Skill Pack for the active customer workspace.

## Command Center UX

The first screen should remain the command center. It should show:

- Current operator, if login identity is available.
- Current customer workspace selector.
- Current site URL.
- Customer configuration status.
- Company information status.
- Product information status.
- Product keyword status.
- Published Skill Pack status and version.
- Primary action: "Build or update Skill Pack."

Environment status should be separate from customer configuration:

- Environment: server API, Docker/runtime mode, backend reachability.
- Customer configuration: WordPress, WooCommerce, Gemini/Vertex, company data, product data, keyword data, Skill Pack.

## Navigation

Add or reserve a left-navigation entry named `Skill 工厂` or `客户资料 / Skills`.

Recommended sections:

- Customer Workspaces
- Company Information
- Product Information
- Product Keywords
- Skill Pack Drafts
- Published Skill Packs

The left sidebar should be collapsible:

- Expanded: icon plus label.
- Collapsed: icon only.
- Hover or title shows the label.
- Top command bar continues to show current workspace and page title.

## Gemini Prompting Contract

Every AI generation call should compose context in this order:

1. Global task instruction.
2. Active customer Skill Pack.
3. Current task type rules.
4. Selected product or keyword context.
5. User request.

Example:

```text
You are generating SEO content for the active customer workspace.

Customer Skill Pack:
[published companySkill, productSkill, keywordSkill, taskSkills]

Current task:
Generate a product page section for a product sample.

Rules:
- Use verified company and product facts only.
- Use product keywords naturally.
- Do not invent certificates, dimensions, factory area, founding year, or compliance claims.
```

## Data And Backend Design

The current code already has customer profiles and knowledge sources. The first implementation should extend that model rather than replacing it.

Suggested data model additions:

- `sourceType`: already exists and should be normalized to `company`, `product`, or `keyword`.
- `skillPacks`: customer-scoped list of generated Skill Pack versions.
- `activeSkillPackId`: customer-scoped pointer to the published version used by AI tasks.
- `skillPack.status`: `draft`, `published`, or `archived`.
- `skillPack.version`: incremented on publish.

Suggested endpoints:

- `GET /client-profiles/{profile_id}/knowledge`
- `POST /client-profiles/{profile_id}/knowledge/import`
- `POST /client-profiles/{profile_id}/skill-packs/generate`
- `GET /client-profiles/{profile_id}/skill-packs`
- `PUT /client-profiles/{profile_id}/skill-packs/{pack_id}`
- `POST /client-profiles/{profile_id}/skill-packs/{pack_id}/publish`
- `GET /client-profiles/{profile_id}/skill-packs/active`

Existing `/skills/company-context` and `/skills/keywords/{category}` can continue to serve the current workflows while the Skill Pack system is introduced.

## Error Handling

- If no customer workspace is selected, block Skill Pack generation and ask the operator to create or select a workspace.
- If a source type is missing, allow a draft but mark the missing section clearly.
- If Gemini fails, keep uploaded source files and show a retry action.
- If generated claims are not supported by source material, mark them as "needs review" rather than publishing them.
- If no Skill Pack is published, existing AI workflows should show "customer Skill Pack not published" and continue only if the workflow supports a basic fallback.

## Testing And Verification

Initial verification should cover:

- Setup and command center copy says "customer workspace" or "service customer," not "my configuration."
- Source uploads can be tagged as company, product, or keyword.
- Skill Pack generation sends grouped source text to the backend service layer.
- Generated Skill Pack drafts are not used until published.
- Published Skill Pack context is included in blog, product SEO, image SEO, page planner, and SEO audit generation payloads.
- Switching customer workspace changes the active Skill Pack and knowledge context.
- Environment status and customer configuration status render as separate groups.

## Implementation Phases

### Phase 1: Customer-Aware Status And Source Types

- Update setup and command center copy to show service customer and site.
- Separate environment status from customer configuration status.
- Normalize source type labels to company information, product information, and product keywords.
- Add command center Skill Pack status card.

### Phase 2: Skill Pack Draft Generation

- Add backend draft generation endpoint.
- Build a strict Gemini extraction prompt for the three source types.
- Store draft Skill Packs per customer workspace.
- Add UI for draft review and editing.

### Phase 3: Publish And Reuse

- Add publish/archive actions.
- Store active published Skill Pack per customer workspace.
- Include published Skill Pack in existing Gemini calls.
- Show Skill Pack version and status in every AI workspace.

### Phase 4: Team And Permission Controls

- Add operator identity display where available.
- Add customer workspace access controls if the distribution model requires multiple operators in one installation.
- Add audit history for generated, edited, and published Skill Pack versions.

## Open Product Decision

The first implementation can use one installation with multiple customer workspaces. If the software will be hosted centrally for many companies, workspace permissions and tenant isolation need a separate security design before production launch.
