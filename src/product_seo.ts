import { GoogleGenAI, Part } from '@google/genai';
import { LLMProvider, sanitizeGeneratedSeoText } from './seo.js';
import { buildGoogleUserContent, createGoogleGenAIClient, hasGoogleGenAIConfig, withAiGenerateRetry } from './genai.js';
import { buildProductKeywordPlanBlock } from './seoKnowledgePlan.js';
import {
    buildMarketingContextBlock,
    buildSeoGenerationBriefBlock,
    enforceSeoTitle,
    normalizeSeoMarketingProfile,
    type SeoMarketingProfile,
} from './marketingContext.js';

export interface ProductSeoInput {
    productId: number;
    productName: string;
    currentShortDescription: string;
    currentDescription: string;
    template: string; // The template the user uploaded
    language?: string;
    /** Pre-built keyword context block from keyword reference (priority-annotated) */
    keywordContext?: string;
    /** Product image URLs from WooCommerce (JSON array string or string[]) */
    imageUrls?: string | string[];
    /** WooCommerce category names (comma-separated) */
    categoryNames?: string;
    /** WooCommerce category slugs (pipe-delimited, e.g. "|category-a|category-b|") */
    categorySlugs?: string;
    /** Site/company-specific SEO context supplied by the active site profile or request. */
    marketingProfile?: Partial<SeoMarketingProfile>;
}

export interface ProductSeoOutput {
    short_description: string;
    description: string;
    acf_seo_extra_info: string;
    aioseo_title: string;
    aioseo_description: string;
}

const cleanText = (value: string) => value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

const truncate = (value: string, max: number) => {
    if (value.length <= max) return value;
    return value.slice(0, max).trim();
};

const ensureHtml = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return '';
    return /<[^>]+>/.test(trimmed) ? trimmed : `<p>${trimmed}</p>`;
};

const parseJsonSafe = (raw: string) => {
    try {
        return JSON.parse(raw);
    } catch {
        const cleaned = raw.replace(/```json\n?|\n?```/g, '').trim();
        return JSON.parse(cleaned);
    }
};

export const normalizeProductSeoOutput = (input: ProductSeoInput, raw: any): ProductSeoOutput => {
    const shortDescription = sanitizeGeneratedSeoText(String(raw?.short_description || '').trim()) || input.currentShortDescription.trim();
    const description = sanitizeGeneratedSeoText(String(raw?.description || '').trim()) || input.currentDescription.trim();
    const sourceText = cleanText(`${shortDescription} ${description}`.trim());

    const fallbackAcf = sourceText || input.productName;
    const fallbackTitle = input.productName.trim() || truncate(sourceText, 60) || 'Product';
    const fallbackMeta = sourceText || `${input.productName} is designed for reliable daily use and easy maintenance.`;

    const marketingProfile = normalizeSeoMarketingProfile(input.marketingProfile);
    const normalizedTitle = enforceSeoTitle(
        sanitizeGeneratedSeoText(String(raw?.aioseo_title || '').trim()) || fallbackTitle,
        {
            context: marketingProfile,
            productName: input.productName,
            fallbackProductType: fallbackTitle,
        },
    );

    return {
        short_description: shortDescription,
        description,
        acf_seo_extra_info: ensureHtml(sanitizeGeneratedSeoText(String(raw?.acf_seo_extra_info || '').trim()) || fallbackAcf),
        aioseo_title: normalizedTitle,
        aioseo_description: truncate(sanitizeGeneratedSeoText(String(raw?.aioseo_description || '').trim()) || fallbackMeta, 160),
    };
};

export const fetchProductSeoImageParts = async (urls: string[], maxImages = 3): Promise<Part[]> => {
    const selectedUrls = urls.slice(0, maxImages);
    const parts: Part[] = [];
    const errors: string[] = [];
    for (const url of selectedUrls) {
        try {
            const response = await fetch(url);
            if (!response.ok) {
                errors.push(`${url}: ${response.status} ${response.statusText}`.trim());
                continue;
            }
            const contentType = response.headers.get('content-type') || 'image/jpeg';
            const mimeType = contentType.split(';')[0].trim();
            if (!mimeType.startsWith('image/')) {
                errors.push(`${url}: unsupported content type ${mimeType || 'unknown'}`);
                continue;
            }
            const buffer = await response.arrayBuffer();
            const data = Buffer.from(buffer).toString('base64');
            parts.push({ inlineData: { data, mimeType } });
        } catch (error) {
            errors.push(`${url}: ${(error as Error)?.message || String(error)}`);
        }
    }
    if (selectedUrls.length > 0 && parts.length === 0) {
        throw new Error(`Unable to load product reference images: ${errors.join('; ') || 'all downloads failed'}`);
    }
    return parts;
};

export class GeminiProductSeoGenerator {
    private genAI: GoogleGenAI;

    constructor(apiKey: string) {
        this.genAI = createGoogleGenAIClient(apiKey);
    }

    /**
     * Parse image URLs from input — accepts JSON array string or string[].
     */
    private parseImageUrls(raw?: string | string[]): string[] {
        if (!raw) return [];
        if (Array.isArray(raw)) return raw.filter(Boolean);
        try {
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
        } catch {
            return raw.split(',').map(u => u.trim()).filter(Boolean);
        }
    }

    async generate(input: ProductSeoInput): Promise<ProductSeoOutput> {
        const langInstructions = input.language ? `Please generate the content in ${input.language}.` : '';
        const contextShort = input.currentShortDescription?.trim() || '(empty)';
        const contextFull = input.currentDescription?.trim() || '(empty)';

        const keywordBlock = input.keywordContext || '';
        const productKeywordPlanBlock = buildProductKeywordPlanBlock({
            productName: input.productName,
            categoryNames: input.categoryNames,
            sourceText: `${contextShort} ${contextFull} ${input.template}`,
            keywordContext: input.keywordContext,
        });
        const marketingProfile = normalizeSeoMarketingProfile(input.marketingProfile);
        const marketingContextBlock = buildMarketingContextBlock({ scope: 'product', context: marketingProfile });
        const seoGenerationBriefBlock = buildSeoGenerationBriefBlock({
            contentType: 'product',
            productName: input.productName,
            coreKeyword: input.productName,
            selectedFields: ['short_description', 'description', 'acf_seo_extra_info', 'aioseo_title', 'aioseo_description'],
            context: marketingProfile,
        });
        const categoryInfo = input.categoryNames?.trim()
            ? `\n      Product Categories: ${input.categoryNames}`
            : '';

        const promptText = `
      You are an expert SEO copywriter for the active website. Use only the active site profile, uploaded company knowledge, selected keyword database, product facts, and reference images.
      Generate WooCommerce product descriptions and SEO metadata based on the product details, images, and template.
      ${langInstructions}

      Product Name: ${input.productName}${categoryInfo}
      Existing WooCommerce Short Description (must be used as context):
      """
      ${contextShort}
      """
      Existing WooCommerce Full Description (must be used as context):
      """
      ${contextFull}
      """
      ${keywordBlock ? `\n      ${keywordBlock}` : ''}
      ${productKeywordPlanBlock ? `\n      ${productKeywordPlanBlock}` : ''}
      ${marketingContextBlock ? `\n      ${marketingContextBlock}` : ''}
      ${seoGenerationBriefBlock ? `\n      ${seoGenerationBriefBlock}` : ''}

      User Template / Instructions:
      ${input.template}

      SEO Writing Guidelines:
      - LOOK AT THE PRODUCT IMAGES to understand the product's appearance, material, features, and installation style
      - Use image details (color, material, mounting style, sensor type, etc.) to write more accurate and specific SEO content
      - Use ⭐⭐⭐ priority keywords in aioseo_title (pick the most relevant one based on the actual product shown)
      - Use ⭐⭐ keywords naturally in aioseo_description and body text
      - Match the product category to choose the right keywords from the selected keyword database and uploaded knowledge
      - Match the target audience and decision intent from the active site profile
      - Title format follows the active site's SEO MARKETING CONTEXT. If no brand suffix is configured, do not append a brand.
      - Do not stack generic market, channel, or company terms in aioseo_title unless they are part of the user-provided profile, keyword database, or product facts
      - Meta description: include 1-2 core keywords + benefit statement + usage intent (max 160 chars)
      - Do NOT stuff keywords — integrate naturally and fluently

      Requirements:
      1. Use BOTH existing descriptions AND product images as the factual source.
      2. short_description: return valid WooCommerce HTML following only the user's template when one is provided; otherwise choose a suitable structure from the factual source material.
      3. description: return valid WooCommerce HTML following only the user's template when one is provided; otherwise choose a suitable structure from the factual source material.
      4. acf_seo_extra_info: must be derived from short_description + description and NOT be empty (HTML: paragraph + bullet points).
      5. aioseo_title: SEO title with product identity + product type, following active site title format (max ${marketingProfile.titleMaxChars} chars).
      6. aioseo_description: SEO meta with benefit statement + usage intent (max 160 chars).
      7. Keep content consistent with product facts and what is visible in images. Do not invent unsupported specs.

      Output ONLY valid JSON matching this schema:
      {
        "short_description": "...",
        "description": "...",
        "acf_seo_extra_info": "...",
        "aioseo_title": "...",
        "aioseo_description": "..."
      }
    `;

        // Build multimodal content: images + text prompt
        const imageUrls = this.parseImageUrls(input.imageUrls);
        const imageParts = imageUrls.length > 0 ? await fetchProductSeoImageParts(imageUrls) : [];

        const parts: Part[] = [
            ...imageParts,
            { text: promptText },
        ];

        const response = await withAiGenerateRetry(() => this.genAI.models.generateContent({
            model: process.env.GENAI_FLASH_MODEL || "gemini-2.5-flash",
            contents: buildGoogleUserContent(parts),
            config: { responseMimeType: "application/json" }
        }));

        const text = response.text;
        if (!text) throw new Error('Empty response from Gemini');

        const json = parseJsonSafe(text);
        return normalizeProductSeoOutput(input, json);
    }
}

export const createProductSeoGenerator = (provider: LLMProvider, apiKey?: string) => {
    if (provider === 'gemini' && hasGoogleGenAIConfig(apiKey)) {
        return new GeminiProductSeoGenerator(apiKey || '');
    }
    throw new Error(`Product SEO generation requires Gemini API key or Vertex AI configuration. Requested provider: ${provider}`);
};
