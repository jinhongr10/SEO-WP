export type SeoContentType = 'media' | 'product' | 'blog' | 'page';

export interface SeoMarketingProfile {
  brandName: string;
  siteDomain: string;
  titleBrandSuffix: string;
  titleMaxChars: number;
  productCategory: string;
  audience: string;
  buyerIntent: string;
  procurementModifiers: string[];
  industryTerms: string[];
  titleFormat: string;
}

export interface MarketingContextBlockOptions {
  scope?: SeoContentType;
  context?: Partial<SeoMarketingProfile> | null;
}

export interface SeoGenerationBriefOptions {
  contentType: SeoContentType;
  productName?: string;
  coreKeyword?: string;
  selectedFields?: string[];
  context?: Partial<SeoMarketingProfile> | null;
}

export interface EnforceSeoTitleOptions {
  productName?: string;
  fallbackProductType?: string;
  maxChars?: number;
  suffix?: string;
  context?: Partial<SeoMarketingProfile> | null;
}

export const DEFAULT_SEO_MARKETING_PROFILE: SeoMarketingProfile = {
  brandName: '',
  siteDomain: '',
  titleBrandSuffix: '',
  titleMaxChars: 60,
  productCategory: '',
  audience: '',
  buyerIntent: '',
  procurementModifiers: [],
  industryTerms: [],
  titleFormat: '[Product Identity]',
};

const DEFAULT_TITLE_FALLBACK = 'Product';

const normalizeText = (value: string) => value.replace(/\s+/g, ' ').trim();

const cleanStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const output: string[] = [];
  for (const item of value) {
    const text = normalizeText(String(item || ''));
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(text);
  }
  return output;
};

const cleanOptionalString = (value: unknown) => normalizeText(String(value ?? ''));

const normalizeTitleSuffix = (value: unknown) => {
  const text = cleanOptionalString(value);
  if (!text) return '';
  const label = text.replace(/^\s*[|:-]\s*/, '').trim();
  return label ? ` | ${label}` : '';
};

export const normalizeSeoMarketingProfile = (
  context?: Partial<SeoMarketingProfile> | null,
): SeoMarketingProfile => {
  const merged = {
    ...DEFAULT_SEO_MARKETING_PROFILE,
    ...(context || {}),
  };
  const brandName = cleanOptionalString(merged.brandName);
  const explicitSuffix = normalizeTitleSuffix(merged.titleBrandSuffix);
  const titleBrandSuffix = explicitSuffix || (brandName ? ` | ${brandName}` : '');
  const titleFormat = cleanOptionalString(merged.titleFormat)
    || (titleBrandSuffix ? `[Product Identity]${titleBrandSuffix}` : '[Product Identity]');
  const titleMaxChars = Number.isFinite(Number(merged.titleMaxChars))
    ? Math.max(20, Math.min(Number(merged.titleMaxChars), 1000))
    : DEFAULT_SEO_MARKETING_PROFILE.titleMaxChars;

  return {
    brandName,
    siteDomain: cleanOptionalString(merged.siteDomain),
    titleBrandSuffix,
    titleMaxChars,
    productCategory: cleanOptionalString(merged.productCategory) || DEFAULT_SEO_MARKETING_PROFILE.productCategory,
    audience: cleanOptionalString(merged.audience) || DEFAULT_SEO_MARKETING_PROFILE.audience,
    buyerIntent: cleanOptionalString(merged.buyerIntent) || DEFAULT_SEO_MARKETING_PROFILE.buyerIntent,
    procurementModifiers: cleanStringArray(merged.procurementModifiers).length
      ? cleanStringArray(merged.procurementModifiers)
      : DEFAULT_SEO_MARKETING_PROFILE.procurementModifiers,
    industryTerms: cleanStringArray(merged.industryTerms),
    titleFormat,
  };
};

const stripPromptLabels = (value: string) =>
  String(value || '')
    .split(/\r?\n/)
    .map(line => line.replace(/^(?:primary keyword guidance|primary keyword|main keyword(?: to target)?|additional context|keyword usage rules)\s*:\s*/i, '').trim())
    .filter(Boolean)
    .join(' ')
    .trim();

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const procurementTitleTermsRe = (context: SeoMarketingProfile) => {
  const terms = context.procurementModifiers
    .map(term => normalizeText(term))
    .filter(term => term.length >= 2);
  if (!terms.length) return null;
  return new RegExp(`\\b(?:${terms.map(escapeRegExp).join('|')})\\b`, 'gi');
};

const stripKnownBrandSuffix = (value: string, context: SeoMarketingProfile) => {
  let text = normalizeText(value);
  const suffixLabel = context.titleBrandSuffix.replace(/^\s*[|:-]\s*/, '').trim();
  for (const label of [suffixLabel, context.brandName].filter(Boolean)) {
    text = text
      .replace(new RegExp(`\\s*[|:-]\\s*${escapeRegExp(label)}\\s*$`, 'i'), '')
      .replace(new RegExp(`\\s+\\b${escapeRegExp(label)}\\b\\s*$`, 'i'), '')
      .trim();
  }
  return text;
};

const cleanTitleBase = (value: string, context: SeoMarketingProfile) => (
  stripKnownBrandSuffix(stripPromptLabels(value), context)
    .replace(/[|:;,()[\]{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
);

const removeProcurementTitleTerms = (value: string, context: SeoMarketingProfile) => (
  (() => {
    const pattern = procurementTitleTermsRe(context);
    const base = cleanTitleBase(value, context);
    return normalizeText(pattern ? base.replace(pattern, ' ') : base);
  })()
);

const fitTitleWithSuffix = (base: string, context: SeoMarketingProfile) => {
  const suffix = context.titleBrandSuffix;
  const maxChars = context.titleMaxChars;
  const cleaned = normalizeText(base).replace(/[|:;,\-\s]+$/g, '').trim() || DEFAULT_TITLE_FALLBACK;
  if (!suffix) {
    if (cleaned.length <= maxChars) return cleaned;
    return cleaned
      .slice(0, maxChars)
      .replace(/\s+\S*$/, '')
      .replace(/[|:;,\-\s]+$/g, '')
      .trim() || DEFAULT_TITLE_FALLBACK;
  }
  const full = `${cleaned}${suffix}`;
  if (full.length <= maxChars) return full;
  const maxBaseLength = Math.max(1, maxChars - suffix.length);
  const trimmed = cleaned
    .slice(0, maxBaseLength)
    .replace(/\s+\S*$/, '')
    .replace(/[|:;,\-\s]+$/g, '')
    .trim();
  return `${trimmed || DEFAULT_TITLE_FALLBACK}${suffix}`;
};

export const enforceSeoTitle = (
  rawTitle: string,
  options: EnforceSeoTitleOptions = {},
) => {
  const context = normalizeSeoMarketingProfile({
    ...(options.context || {}),
    titleBrandSuffix: options.suffix ?? options.context?.titleBrandSuffix,
    titleMaxChars: options.maxChars ?? options.context?.titleMaxChars,
  });
  const rawBase = cleanTitleBase(rawTitle, context);
  const procurementPattern = procurementTitleTermsRe(context);
  const rawHasProcurementTerms = Boolean(procurementPattern?.test(rawBase));

  const preferredSource = (
    options.productName
    || (rawHasProcurementTerms ? options.fallbackProductType : rawBase)
    || options.fallbackProductType
    || DEFAULT_TITLE_FALLBACK
  );
  const base = (
    removeProcurementTitleTerms(preferredSource, context)
    || removeProcurementTitleTerms(options.fallbackProductType || '', context)
    || DEFAULT_TITLE_FALLBACK
  );
  return fitTitleWithSuffix(base, context);
};

const buildMediaFieldContracts = (context: SeoMarketingProfile): Record<string, string> => ({
  filename: 'Lowercase, hyphen-separated SEO filename ending in .webp. Use the product identity, not internal prompt labels.',
  title: context.titleBrandSuffix
    ? `Use product identity only: ${context.titleFormat}. Keep configured title modifiers out.`
    : 'Use product identity only. Do not append a brand unless the active site profile provides one.',
  alt_text: 'Describe the visible image first, then include one natural product keyword or use-case phrase.',
  caption: 'Short display line. It may include use context if it reads naturally.',
  description: 'Search snippet with benefit, audience intent, and CTA direction. Configured title modifiers belong here when relevant.',
});

const buildProductFieldContracts = (context: SeoMarketingProfile): Record<string, string> => ({
  aioseo_title: context.titleBrandSuffix
    ? `Use one strong product-specific search phrase and end with ${context.titleBrandSuffix}. Avoid stacked configured title modifiers.`
    : 'Use one strong product-specific search phrase. Do not append a brand unless the active site profile provides one.',
  aioseo_description: 'Use the primary keyword, a concrete benefit/spec, use context, and soft CTA within 160 characters.',
  acf_seo_extra_info: 'Concise factual product-card support text. No CTA, no keyword stuffing.',
  short_description: "Valid WooCommerce HTML grounded in product facts and visible/reference material; structure comes only from the user's saved rule when present.",
  description: "Valid WooCommerce HTML grounded in product facts and visible/reference material; structure comes only from the user's saved rule when present.",
  tag_names: 'Reusable taxonomy terms: product type, material, installation, application, and audience intent when factual.',
});

const fieldContractLines = (contracts: Record<string, string>) => (
  Object.entries(contracts).map(([field, rule]) => `- ${field}: ${rule}`).join('\n')
);

export const buildMarketingContextBlock = ({
  scope = 'product',
  context,
}: MarketingContextBlockOptions = {}) => {
  const profile = normalizeSeoMarketingProfile(context);
  const fieldContracts = scope === 'media'
    ? buildMediaFieldContracts(profile)
    : buildProductFieldContracts(profile);
  const brandSite = [profile.brandName, profile.siteDomain ? `(${profile.siteDomain})` : '']
    .filter(Boolean)
    .join(' ')
    || '(no brand configured)';
  const productCategory = profile.productCategory || '(not configured; use uploaded/source data only)';
  const audience = profile.audience || '(not configured; infer only from source data)';
  const buyerIntent = profile.buyerIntent || '(not configured; infer only from source data)';
  const procurementModifiers = profile.procurementModifiers.length ? profile.procurementModifiers.join(', ') : '(none configured)';
  const industryTerms = profile.industryTerms.length ? profile.industryTerms.join(', ') : '(none configured; use uploaded/selected keyword context only)';
  return `
SEO MARKETING CONTEXT:
- Brand/site: ${brandSite}
  - Category: ${productCategory}
  - Audience: ${audience}
  - Audience intent: ${buyerIntent}
  - Title format: "${profile.titleFormat}" (max ${profile.titleMaxChars} chars)
  - Title modifiers: ${procurementModifiers}
  - Industry terms: ${industryTerms}
  - Field boundary: keep configured title modifiers out of title fields; route them to alt_text, caption, and description or meta/body copy only when the user data supports them.
Field contracts:
${fieldContractLines(fieldContracts)}
`.trim();
};

export const buildSeoGenerationBriefBlock = ({
  contentType,
  productName = '',
  coreKeyword = '',
  selectedFields = [],
  context,
}: SeoGenerationBriefOptions) => {
  const profile = normalizeSeoMarketingProfile(context);
  const fields = selectedFields.length ? selectedFields.join(', ') : '(all relevant SEO fields)';
  const titleModifierTerms = profile.procurementModifiers.length
    ? profile.procurementModifiers.join(', ')
    : '';
  return `
SEO GENERATION BRIEF:
- Content type: ${contentType}
- Product/source identity: ${productName.trim() || '(infer from source material)'}
- Core keyword: ${coreKeyword.trim() || '(choose the closest product-specific keyword)'}
- Selected fields: ${fields}
- Title field contract: use "${profile.titleFormat}" when a brand suffix is configured; otherwise use a concise product-specific title. Keep it under ${profile.titleMaxChars} characters.
  - Title modifier routing: ${titleModifierTerms ? `Move ${titleModifierTerms} terms out of title fields unless they are unavoidable in the exact product type. Use them in meta descriptions, captions, body copy, FAQ, and CTA context only when supported.` : 'No title modifiers are configured; do not invent market, channel, or company terms.'}
- Quality bar: match search intent, use customer language, avoid keyword stuffing, and keep unsupported claims out.
`.trim();
};
