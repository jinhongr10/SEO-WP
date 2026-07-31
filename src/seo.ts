import { GoogleGenAI } from '@google/genai';
import fs from 'node:fs';
import path from 'node:path';
import { buildGoogleUserContent, createGoogleGenAIClient, hasGoogleGenAIConfig, withAiGenerateRetry } from './genai.js';
import { buildProductKeywordPlanBlock } from './seoKnowledgePlan.js';
import {
  buildMarketingContextBlock,
  buildSeoGenerationBriefBlock,
  enforceSeoTitle,
  normalizeSeoMarketingProfile,
  type SeoMarketingProfile,
} from './marketingContext.js';
import {
  generateValidatedMediaSeo,
  type MediaKeywordCandidate,
  type MediaKeywordUsage,
} from './mediaKeywordSelection.js';

export type LLMProvider = 'none' | 'openai' | 'gemini' | 'custom';

export interface SEOInput {
  filename: string;
  currentTitle: string;
  currentAlt: string;
  currentCaption: string;
  currentDescription: string;
  defaultKeywords: string[];
  postTitle?: string;
  /** Extra keyword/context guidance that should not be copied as a title. */
  additionalContext?: string;
  altMaxChars: number;
  imagePath?: string;
  /** Language code for multilingual SEO generation (e.g. 'en', 'zh', 'es') */
  language?: string;
  /** Sibling images from the same product/post for batch-aware context */
  siblingFilenames?: string[];
  /** 1-based index of this image among siblings (for series-aware alt text) */
  siblingIndex?: number;
  /** Pre-built keyword context block from keyword reference (priority-annotated) */
  keywordContext?: string;
  /** Required core keyword for validated AI media generation. */
  coreKeyword?: string;
  /** Per-image shortlist selected from the active site's uploaded keyword table. */
  keywordCandidates?: MediaKeywordCandidate[];
  /** Site/company-specific SEO context supplied by the active site profile or request. */
  marketingProfile?: Partial<SeoMarketingProfile>;
}

export interface SEOOutput {
  filename: string;
  alt_text: string;
  title: string;
  caption: string;
  description: string;
  /** Quality score 0-100 assigned by the scoring system */
  qualityScore?: number;
  keywordUsage?: MediaKeywordUsage;
}

export interface SEOGenerator {
  generate(input: SEOInput): Promise<SEOOutput>;
}

const normalizeText = (value: string) => value.replace(/\s+/g, ' ').trim();

const slugToWords = (name: string) =>
  name
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const normalizeSeoFilename = (value: string, fallback = 'image') => {
  const source = path.basename(String(value || '')).replace(/\.[^.]+$/, '') || fallback;
  const stem = source.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'image';
  return `${stem.slice(0, 120).replace(/-+$/g, '') || 'image'}.webp`;
};

const fallbackSeoFilename = (input: SEOInput) => (
  normalizeSeoFilename(input.defaultKeywords[0] || input.filename || 'image', input.filename || 'image')
);

const dedupeKeywords = (parts: string[]) => {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const part of parts.map(normalizeText)) {
    if (!part) continue;
    const lowered = part.toLowerCase();
    if (seen.has(lowered)) continue;
    seen.add(lowered);
    output.push(part);
  }
  return output;
};

const splitContextLines = (value?: string) =>
  String(value ?? '')
    .split(/\r?\n/)
    .map(normalizeText)
    .filter(Boolean);

const INTERNAL_CONTEXT_LABEL_RE = /^(batch core keyword|primary batch keyword|primary keyword guidance|keyword context)\s*:/i;
const GENERATED_ARTIFACT_HEADING_RE = /^=+\s*(target seo keywords?|end target seo keywords?|keyword strategy)\s*=+$/i;
const GENERATED_ARTIFACT_PREFIX_RE = /^(batch core keyword|primary batch keyword|primary keyword guidance|primary keyword|main keyword(?: to target)?|additional context|keyword usage rules)\s*:\s*/i;

const removeInternalContextLabels = (value?: string) =>
  splitContextLines(value).filter(line => !INTERNAL_CONTEXT_LABEL_RE.test(line));

export const sanitizeGeneratedSeoText = (value?: string) => {
  const lines = splitContextLines(value);
  const cleaned: string[] = [];
  for (const line of lines) {
    if (GENERATED_ARTIFACT_HEADING_RE.test(line)) continue;
    if (/^(secondary keywords|keyword usage rules)\s*:?\s*$/i.test(line)) continue;
    const stripped = line.replace(GENERATED_ARTIFACT_PREFIX_RE, '').trim();
    if (stripped) cleaned.push(stripped);
  }
  return cleaned.join('\n').trim();
};

const isGenericMediaName = (value: string) => {
  const normalized = normalizeText(value)
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[_-]+/g, ' ')
    .toLowerCase();

  return (
    !normalized ||
    /^\d+$/.test(normalized) ||
    /^(product|image|img|dsc|pic|photo|untitled)\s*\d{3,}$/.test(normalized) ||
    /^product\s*\d*$/.test(normalized)
  );
};

const pickFirstUseful = (parts: string[]) => parts.find(part => part && !isGenericMediaName(part));

const truncate = (value: string, max: number) => {
  const normalized = normalizeText(value);
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
};

const PRODUCT_INTENT_FILLER_RE = /\b(?:orders?|projects?|purchase|solution|solutions|needs?)\b/gi;
const MODEL_CODE_RE = /\b[A-Z]{1,5}\d?(?:[-_\s]?\d{1,5}[A-Z0-9]*)+\b/g;
const GENERIC_MODEL_PREFIX_RE = /^(?:IMG|DSC|PIC|PHOTO|IMAGE|PRODUCT)-?\d/i;
const DESCRIPTOR_STOP_WORDS = new Set([
  'jpg',
  'jpeg',
  'png',
  'webp',
  'scaled',
  'copy',
  'image',
  'photo',
  'pic',
  'main',
  'front',
  'side',
  'back',
  'detail',
  'details',
  'view',
  'views',
  'scene',
]);

const titleCase = (value: string) =>
  normalizeText(value.toLowerCase()).replace(/\b[a-z0-9]/g, char => char.toUpperCase());

const stripMediaTitleBrand = (value: string, context: SeoMarketingProfile) => {
  let text = normalizeText(value);
  const suffixLabel = context.titleBrandSuffix.replace(/^\s*[|:-]\s*/, '').trim();
  for (const label of [suffixLabel, context.brandName].filter(Boolean)) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    text = text
      .replace(new RegExp(`\\s*[|:-]\\s*${escaped}\\s*$`, 'i'), '')
      .replace(new RegExp(`\\s+\\b${escaped}\\b\\s*$`, 'i'), '')
      .trim();
  }
  return text;
};

const titleModifierTermsRe = (context: SeoMarketingProfile) => {
  const terms = context.procurementModifiers
    .map(term => normalizeText(term))
    .filter(term => term.length >= 2);
  if (!terms.length) return null;
  const escaped = terms.map(term => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  return new RegExp(`\\b(?:${escaped})\\b`, 'gi');
};

const cleanProductPhraseForMediaTitle = (value: string | undefined, context: SeoMarketingProfile) => {
  const titleModifierRe = titleModifierTermsRe(context);
  const cleaned = sanitizeGeneratedSeoText(value)
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/[|:;,()[\]{}]/g, ' ')
    .replace(PRODUCT_INTENT_FILLER_RE, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const cleanWithoutModifiers = titleModifierRe ? cleaned.replace(titleModifierRe, ' ') : cleaned;
  return stripMediaTitleBrand(cleanWithoutModifiers, context);
};

const inferMediaTitleProductType = (
  parts: string[],
  fallback = '',
  context: SeoMarketingProfile,
) => {
  const combined = cleanProductPhraseForMediaTitle(parts.join(' '), context).toLowerCase();
  const patterns = [
    ...context.industryTerms,
    fallback,
  ]
    .map(pattern => cleanProductPhraseForMediaTitle(pattern, context))
    .filter(pattern => pattern.length >= 4)
    .sort((a, b) => b.length - a.length);
  for (const pattern of patterns) {
    if (combined.includes(pattern.toLowerCase())) return titleCase(pattern);
  }
  const fallbackPhrase = cleanProductPhraseForMediaTitle(fallback, context);
  return fallbackPhrase ? titleCase(fallbackPhrase) : 'Product';
};

const normalizeModelCode = (value: string) =>
  value.replace(/[_\s]+/g, '-').replace(/-+/g, '-').toUpperCase();

const findModelCode = (parts: string[]) => {
  for (const source of parts) {
    const cleanSource = sanitizeGeneratedSeoText(source).replace(/\.[a-z0-9]+$/i, '');
    const matches = cleanSource.matchAll(MODEL_CODE_RE);
    for (const match of matches) {
      const model = normalizeModelCode(match[0]);
      if (!GENERIC_MODEL_PREFIX_RE.test(model)) {
        return {
          model,
          raw: match[0],
          source: cleanSource,
          index: match.index ?? cleanSource.indexOf(match[0]),
        };
      }
    }
  }
  return null;
};

const extractDescriptorAfterModel = (
  modelMatch: ReturnType<typeof findModelCode>,
  productType: string,
) => {
  if (!modelMatch) return '';
  const productWords = new Set(productType.toLowerCase().split(/\s+/).filter(Boolean));
  const rest = modelMatch.source
    .slice(modelMatch.index + modelMatch.raw.length)
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[_-]+/g, ' ');
  const tokens = rest.match(/[A-Za-z0-9]+/g) || [];
  const descriptor: string[] = [];
  for (const token of tokens) {
    const lower = token.toLowerCase();
    if (productWords.has(lower)) break;
    if (DESCRIPTOR_STOP_WORDS.has(lower)) continue;
    if (/^\d{4,}$/.test(token)) continue;
    descriptor.push(token);
    if (descriptor.length >= 3) break;
  }
  return titleCase(descriptor.join(' '));
};

const fitMediaTitle = (base: string, context: SeoMarketingProfile) => (
  enforceSeoTitle(base, { context, fallbackProductType: 'Product' })
);

const enforceMediaTitle = (rawTitle: string, input: SEOInput) => {
  const marketingProfile = normalizeSeoMarketingProfile(input.marketingProfile);
  const sourceParts = [
    input.currentTitle,
    input.currentAlt,
    input.currentCaption,
    input.currentDescription,
    input.filename,
    rawTitle,
    input.postTitle || '',
    ...input.defaultKeywords,
  ].filter(Boolean);
  const productType = inferMediaTitleProductType(sourceParts, input.defaultKeywords[0] || rawTitle, marketingProfile);
  const modelMatch = findModelCode(sourceParts);
  if (!modelMatch) {
    return fitMediaTitle(productType, marketingProfile);
  }

  const descriptor = extractDescriptorAfterModel(modelMatch, productType);
  const modelPrefix = normalizeText([modelMatch.model, descriptor].filter(Boolean).join(' '));
  const baseWithDescriptor = `${modelPrefix} ${productType}`;
  const fullTitle = fitMediaTitle(baseWithDescriptor, marketingProfile);
  if (fullTitle.length <= marketingProfile.titleMaxChars) return fullTitle;
  return fitMediaTitle(`${modelMatch.model} ${productType}`, marketingProfile);
};

// ---------------------------------------------------------------------------
// SEO Quality Scoring
// ---------------------------------------------------------------------------

export interface ScoreBreakdown {
  total: number;
  lengthScore: number;
  keywordScore: number;
  uniquenessScore: number;
  readabilityScore: number;
}

/**
 * Score SEO metadata quality on a 0-100 scale.
 * Checks keyword presence, field length, uniqueness across fields, and readability.
 */
export const scoreSeoOutput = (output: SEOOutput, keywords: string[]): ScoreBreakdown => {
  const fields = [output.title, output.alt_text, output.caption, output.description];
  const joined = fields.join(' ').toLowerCase();

  // 1) Length score (25 pts) – reward fields in ideal range
  const idealRanges: Array<[string, number, number]> = [
    [output.title, 20, 60],
    [output.alt_text, 30, 125],
    [output.caption, 20, 120],
    [output.description, 50, 160],
  ];
  let lengthScore = 0;
  for (const [text, min, max] of idealRanges) {
    const len = (text as string).length;
    if (len >= min && len <= max) lengthScore += 6.25;
    else if (len > 0) lengthScore += 3;
  }

  // 2) Keyword score (30 pts) – how many target keywords appear
  let keywordHits = 0;
  for (const kw of keywords.slice(0, 5)) {
    if (joined.includes(kw.toLowerCase())) keywordHits += 1;
  }
  const keywordScore = keywords.length ? Math.min(30, (keywordHits / Math.min(keywords.length, 5)) * 30) : 15;

  // 3) Uniqueness score (25 pts) – fields should not be identical to each other
  const unique = new Set(fields.map(f => f.trim().toLowerCase()));
  const uniquenessScore = Math.min(25, (unique.size / 4) * 25);

  // 4) Readability score (20 pts) – no excessive caps, no raw slugs
  let readabilityScore = 20;
  for (const f of fields) {
    if (/[A-Z]{10,}/.test(f)) readabilityScore -= 5;
    if (/[-_]{2,}/.test(f)) readabilityScore -= 5;
  }
  readabilityScore = Math.max(0, readabilityScore);

  return {
    total: Math.round(lengthScore + keywordScore + uniquenessScore + readabilityScore),
    lengthScore: Math.round(lengthScore),
    keywordScore: Math.round(keywordScore),
    uniquenessScore: Math.round(uniquenessScore),
    readabilityScore: Math.round(readabilityScore),
  };
};

// ---------------------------------------------------------------------------
// Language helpers
// ---------------------------------------------------------------------------

const LANGUAGE_PROMPTS: Record<string, string> = {
  en: 'Generate all text in English.',
  zh: 'Generate all text in Simplified Chinese (简体中文).',
  'zh-tw': 'Generate all text in Traditional Chinese (繁體中文).',
  es: 'Generate all text in Spanish (Español).',
  fr: 'Generate all text in French (Français).',
  de: 'Generate all text in German (Deutsch).',
  ja: 'Generate all text in Japanese (日本語).',
  ko: 'Generate all text in Korean (한국어).',
  pt: 'Generate all text in Portuguese (Português).',
  ar: 'Generate all text in Arabic (العربية).',
};

const getLanguageInstruction = (lang?: string): string => {
  if (!lang) return '';
  return LANGUAGE_PROMPTS[lang.toLowerCase()] ?? `Generate all text in the language with code: ${lang}.`;
};

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

class DeterministicSeoGenerator implements SEOGenerator {
  async generate(input: SEOInput): Promise<SEOOutput> {
    const filenamePhrase = slugToWords(input.filename);
    const cleanPostTitleLines = removeInternalContextLabels(input.postTitle);
    const imageSpecificSeeds = dedupeKeywords([
      input.currentTitle,
      input.currentAlt,
      input.currentCaption,
      input.currentDescription,
      ...cleanPostTitleLines,
      filenamePhrase,
    ]);
    const keywordSeeds = dedupeKeywords([
      input.defaultKeywords[0] ?? '',
      input.defaultKeywords[1] ?? '',
      ...input.defaultKeywords.slice(2, 4),
      '',
    ]);

    const primary = sanitizeGeneratedSeoText(
      pickFirstUseful(imageSpecificSeeds) || keywordSeeds[0] || 'Product image',
    );
    const secondary = sanitizeGeneratedSeoText(dedupeKeywords([...keywordSeeds, ...imageSpecificSeeds])
      .find(seed => seed.toLowerCase() !== primary.toLowerCase() && !INTERNAL_CONTEXT_LABEL_RE.test(seed))
      || 'product detail');

    // Add series context if this image is part of a sibling group
    const seriesSuffix = input.siblingIndex && input.siblingFilenames && input.siblingFilenames.length > 1
      ? ` (${input.siblingIndex} of ${input.siblingFilenames.length})`
      : '';

    const title = enforceMediaTitle(`${primary} - ${secondary}${seriesSuffix}`, input);
    const caption = truncate(`${primary}${seriesSuffix}.`, 120);
    const description = truncate(
      `${primary}${seriesSuffix} supports ${secondary} needs with product details for site visitors.`,
      160,
    );
    const altText = truncate(`${primary}, ${secondary}${seriesSuffix}`, input.altMaxChars);

    const result: SEOOutput = { filename: fallbackSeoFilename(input), alt_text: altText, title, caption, description };
    const score = scoreSeoOutput(result, input.defaultKeywords);
    result.qualityScore = score.total;
    return result;
  }
}

class GeminiSeoGenerator implements SEOGenerator {
  private genAI: GoogleGenAI;
  private scoreThreshold: number;
  private maxRetries: number;

  constructor(apiKey: string, scoreThreshold = 60, maxRetries = 2) {
    this.genAI = createGoogleGenAIClient(apiKey);
    this.scoreThreshold = scoreThreshold;
    this.maxRetries = maxRetries;
  }

  async generate(input: SEOInput): Promise<SEOOutput> {
    if (!input.imagePath || !fs.existsSync(input.imagePath)) {
      throw new Error(`Image file not found at ${input.imagePath}`);
    }

    const ext = path.extname(input.imagePath).toLowerCase().replace('.', '');
    const mimeType = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
    const imageData = fs.readFileSync(input.imagePath).toString("base64");

    const languageInstruction = getLanguageInstruction(input.language);

    const siblingContext = input.siblingFilenames && input.siblingFilenames.length > 1
      ? `\n      - This image is ${input.siblingIndex ?? '?'} of ${input.siblingFilenames.length} images for the same product/post.
      - Sibling filenames: ${input.siblingFilenames.join(', ')}
      - Generate alt text that is unique within the series (e.g. mention angle, detail, or variation).`
      : '';

    const additionalContext = input.additionalContext?.trim()
      ? `\n      Additional context (guidance only; do not copy labels into output):
      ${input.additionalContext.trim().replace(/\n/g, '\n      ')}`
      : '';

    // Build keyword context from category if available
    const keywordContextBlock = input.keywordContext || '';
    const productKeywordPlanBlock = buildProductKeywordPlanBlock({
      productName: input.postTitle || input.filename,
      sourceText: [
        input.filename,
        input.currentTitle,
        input.currentAlt,
        input.currentCaption,
        input.currentDescription,
        input.postTitle,
      ].filter(Boolean).join(' '),
      coreKeyword: input.defaultKeywords[0] || '',
      keywordContext: input.keywordContext,
    });
    const marketingProfile = normalizeSeoMarketingProfile(input.marketingProfile);
    const marketingContextBlock = buildMarketingContextBlock({ scope: 'media', context: marketingProfile });
    const seoGenerationBriefBlock = buildSeoGenerationBriefBlock({
      contentType: 'media',
      productName: input.currentTitle || input.postTitle || input.filename,
      coreKeyword: input.defaultKeywords[0] || '',
      selectedFields: ['filename', 'title', 'alt_text', 'caption', 'description'],
      context: marketingProfile,
    });

    const coreKeyword = String(input.coreKeyword || '').trim();
    const keywordCandidates = input.keywordCandidates || [];
    const keywordContractBlock = coreKeyword ? `
      MEDIA KEYWORD CONTRACT:
      - Core keyword (must appear naturally and exactly in filename and title): ${coreKeyword}
      - Supporting keyword shortlist (use 1-3 across alt_text, caption, and description when non-empty):
      ${JSON.stringify(keywordCandidates.map(item => ({
        keyword: item.keyword,
        volume: item.volume,
        intent: item.intent,
        category: item.category,
        relevanceScore: item.relevanceScore,
      })))}
      - Never invent a claim that a keyword was used. The application recalculates usage from the final text.
    ` : '';

    const prompt = `
      You are an SEO content specialist for the active website. Use only the provided site profile, selected keyword database, uploaded knowledge, and visible image evidence.
      Analyze this image and generate SEO metadata in JSON format.
      ${languageInstruction}

      Context:
      - Filename: ${input.filename}
      - Post Title: ${input.postTitle || 'N/A'}
      - Current Title: ${input.currentTitle}
      - Current Alt: ${input.currentAlt}
      - Current Caption: ${input.currentCaption}
      - Current Description: ${input.currentDescription}
      - Keywords: ${input.defaultKeywords.join(', ')}${siblingContext}
      ${additionalContext}
      ${keywordContextBlock ? `\n      ${keywordContextBlock}` : ''}
      ${productKeywordPlanBlock ? `\n      ${productKeywordPlanBlock}` : ''}
      ${marketingContextBlock ? `\n      ${marketingContextBlock}` : ''}
      ${seoGenerationBriefBlock ? `\n      ${seoGenerationBriefBlock}` : ''}
      ${keywordContractBlock}

      SEO Writing Guidelines:
      - Follow the active site's title format from SEO MARKETING CONTEXT. If no brand suffix is configured, do not append a brand.
      - If no model is available, use the clearest product/source identity from the image, filename, selected keyword database, or uploaded knowledge.
      - Keep generic market, channel, or company terms out of the title field unless they are explicitly provided by the active site profile or uploaded data
      - Use the accurate product type from user-provided priority keywords in the title field, but move configured title modifiers to alt_text, caption, and description only when supported
      - Use ⭐⭐ keywords naturally in description and caption
      - Match the audience and decision intent from the active site profile
      - Do NOT stuff keywords — integrate them naturally and fluently
      - Include relevant scene words only when they are present in the active site profile, uploaded knowledge, or visible image context
      - Do NOT include internal labels like "Batch Core Keyword" or "Primary keyword guidance" in any generated field

      Requirements:
      1. title: image title following the active site's title format (max ${marketingProfile.titleMaxChars} chars)
      2. alt_text: Detailed description for accessibility (max ${input.altMaxChars} chars)
      3. caption: Short caption for display (max 120 chars)
      4. description: SEO meta description with keyword + benefit + CTA intent (max 160 chars)
      5. filename: lowercase hyphen-separated .webp filename
      6. Strict JSON output: { "filename": "...", "title": "...", "alt_text": "...", "caption": "...", "description": "...", "keywords_used": ["..."] }
    `;

    const generateCandidate = async (validationFeedback = ''): Promise<SEOOutput> => {
        const retryInstruction = validationFeedback
          ? `\nVALIDATION FAILED: ${validationFeedback}\nRegenerate every field and correct this exact problem.`
          : '';
        const response = await withAiGenerateRetry(() => this.genAI.models.generateContent({
          model: process.env.GENAI_FLASH_MODEL || "gemini-2.5-flash",
          contents: buildGoogleUserContent([
              { inlineData: { data: imageData, mimeType } },
              { text: `${prompt}${retryInstruction}` }
            ]),
          config: { responseMimeType: "application/json" }
        }));

        const text = response.text;
        if (!text) throw new Error('Empty response from Gemini');

        let json: any;
        try {
          json = JSON.parse(text);
        } catch (e) {
          const cleanText = text.replace(/```json\n?|\n?```/g, '').trim();
          json = JSON.parse(cleanText);
        }

        const candidate: SEOOutput = {
          filename: normalizeSeoFilename(json.filename || json.title || '', fallbackSeoFilename(input)),
          title: enforceMediaTitle(sanitizeGeneratedSeoText(json.title || ''), input),
          alt_text: truncate(sanitizeGeneratedSeoText(json.alt_text || json.alt || ''), input.altMaxChars),
          caption: truncate(sanitizeGeneratedSeoText(json.caption || ''), 120),
          description: truncate(sanitizeGeneratedSeoText(json.description || ''), 160),
        };

        const score = scoreSeoOutput(candidate, input.defaultKeywords);
        candidate.qualityScore = score.total;
        return candidate;
    };

    if (!coreKeyword) {
      return generateCandidate();
    }

    const validated = await generateValidatedMediaSeo({
      coreKeyword,
      candidates: keywordCandidates,
      generate: ({ validationFeedback }) => generateCandidate(validationFeedback),
    });
    return {
      ...validated.output,
      qualityScore: scoreSeoOutput(validated.output, input.defaultKeywords).total,
      keywordUsage: validated.keywordUsage,
    };
  }
}

export const createSeoGenerator = (provider: LLMProvider, apiKey?: string): SEOGenerator => {
  if (provider === 'gemini' && hasGoogleGenAIConfig(apiKey)) {
    return new GeminiSeoGenerator(apiKey || '');
  }
  if (provider === 'none') {
    return new DeterministicSeoGenerator();
  }

  // Pluggable point for OpenAI/custom providers. For now we return deterministic
  // output to keep the tool runnable without external API dependencies.
  return new DeterministicSeoGenerator();
};
