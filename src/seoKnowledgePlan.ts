import type { ProductCategory } from './keywords.js';

export interface ProductKeywordPlanInput {
  productName?: string;
  categoryNames?: string;
  sourceText?: string;
  coreKeyword?: string;
  keywordContext?: string;
  category?: ProductCategory | null;
  maxSecondary?: number;
}

export interface ProductKeywordPlan {
  primaryKeyword: string;
  secondaryKeywords: string[];
  applicationKeywords: string[];
  specificationKeywords: string[];
  faqKeywords: string[];
  imageAltKeywords: string[];
  avoidKeywords: string[];
  buyerIntent: string;
}

const STOP_WORDS = new Set([
  'and', 'for', 'the', 'with', 'from', 'into', 'this', 'that', 'your', 'our',
]);

const BUYER_INTENT_TERMS: string[] = [];

const CONSUMER_OR_BLOG_ONLY_RE = /(?!)^/;
const UNSUPPORTED_CLAIM_TERMS = [
  'ada', 'antimicrobial', 'anti ligature', 'recessed', 'undercounter',
  'waterproof', 'fda', 'ce', 'rohs', 'fcc', 'iso',
];
const UNSUPPORTED_PRODUCT_ATTRIBUTE_TERMS: string[] = [];

const SPEC_PATTERNS: Array<[RegExp, string]> = [
  [/\b\d+(?:\.\d+)?\s?(?:ml|l|kg|pcs|mm|cm)\b/i, ''],
];

const FAQ_KEYWORDS: string[] = [];

const normalizeText = (value?: string) =>
  String(value ?? '').replace(/\s+/g, ' ').trim();

const keywordKey = (value: string) => value.toLowerCase().replace(/\s+/g, ' ').trim();

const addUnique = (target: string[], keyword: string) => {
  const cleaned = normalizeKeyword(keyword);
  if (!cleaned) return;
  const key = keywordKey(cleaned);
  if (target.some(existing => keywordKey(existing) === key)) return;
  target.push(cleaned);
};

const normalizeKeyword = (value: string) => {
  let cleaned = normalizeText(value)
    .replace(/^[-*•\s]+/, '')
    .replace(/^["'`]+|["'`,.]+$/g, '')
    .replace(/\s*\([^)]*\)\s*$/g, '')
    .trim();
  cleaned = cleaned.replace(/^[⭐\s]+/, '').trim();
  if (!/[a-z]/i.test(cleaned)) return '';
  if (/^(keywords?|keyword|关键词|月搜|竞争度|volume|competition)$/i.test(cleaned)) return '';
  if (/^-+$/.test(cleaned) || cleaned.includes('---')) return '';
  if (cleaned.length < 3 || cleaned.length > 90) return '';
  return cleaned;
};

const KEYWORD_LABEL_RE = /(?:seo|core|primary|secondary|application|target|product|long[-\s]?tail|keywords?|terms?|priority|关键词|关键字|核心词|核心|长尾词|长尾|应用词|场景词|优先词|重要词)/i;
const KEYWORD_SPLIT_RE = /\s*(?:[,，;；]|·|、|\s+\/\s+)\s*/;

const stripKeywordLineMarkup = (value: string) => (
  String(value || '')
    .replace(/^[#>\s]+/, '')
    .trim()
    .replace(/^\*{1,3}|\*{1,3}$/g, '')
    .replace(/\*\*/g, '')
    .trim()
);

const keywordLinePayload = (line: string) => {
  const cleaned = stripKeywordLineMarkup(line);
  if (!cleaned) return '';
  const labelMatch = cleaned.match(/^([^:：]{1,90})[:：]\s*(.+)$/);
  if (labelMatch && KEYWORD_LABEL_RE.test(labelMatch[1])) return labelMatch[2].trim();
  if (KEYWORD_SPLIT_RE.test(cleaned) && /[a-z][a-z0-9\s/-]{2,}/i.test(cleaned)) return cleaned;
  return '';
};

const addKeywordLineCandidates = (target: string[], payload: string) => {
  for (const part of payload.split(KEYWORD_SPLIT_RE)) {
    const candidate = part
      .replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '')
      .replace(/^`+|`+$/g, '')
      .trim();
    if (candidate) addUnique(target, candidate);
  }
};

export const extractKeywordCandidates = (keywordContext = '') => {
  const candidates: string[] = [];
  const text = String(keywordContext || '');

  for (const match of text.matchAll(/`([^`]+)`/g)) {
    for (const part of match[1].split(/[·,，;；]/)) addUnique(candidates, part);
  }

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith('|')) {
      const cells = line.split('|').map(cell => cell.trim()).filter(Boolean);
      if (cells.length) addUnique(candidates, cells[0]);
      continue;
    }
    if (/^[-*•]\s+/.test(line)) {
      addUnique(candidates, line.replace(/^[-*•]\s+/, '').split(/\s+-\s+|\s+→\s+|\s+\(/)[0]);
      const payload = keywordLinePayload(line.replace(/^[-*•]\s+/, ''));
      if (payload) addKeywordLineCandidates(candidates, payload);
      continue;
    }
    const payload = keywordLinePayload(line);
    if (payload) {
      addKeywordLineCandidates(candidates, payload);
    }
  }

  return candidates;
};

const keywordTokens = (keyword: string) =>
  keyword
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(token => token.length > 2 && !STOP_WORDS.has(token));

const hasUnsupportedClaim = (keyword: string, source: string) => {
  const key = keyword.toLowerCase();
  return [...UNSUPPORTED_CLAIM_TERMS, ...UNSUPPORTED_PRODUCT_ATTRIBUTE_TERMS]
    .some(term => key.includes(term) && !source.includes(term));
};

const isAvoidKeyword = (keyword: string, source: string) =>
  hasUnsupportedClaim(keyword, source);

const scoreKeyword = (keyword: string, source: string, coreKeyword: string) => {
  const normalized = keywordKey(keyword);
  if (!normalized) return -999;
  if (coreKeyword && normalized === keywordKey(coreKeyword)) return 1000;
  if (isAvoidKeyword(keyword, source)) return -500;

  let score = 0;
  if (source.includes(normalized)) score += 40;
  for (const token of keywordTokens(keyword)) {
    if (source.includes(token)) score += 4;
  }
  const tokenCount = keywordTokens(keyword).length;
  score += tokenCount * 3;
  if (tokenCount <= 2 && !BUYER_INTENT_TERMS.some(term => normalized.includes(term))) score -= 12;
  for (const term of BUYER_INTENT_TERMS) {
    if (normalized.includes(term)) score += 8;
    if (source.includes(term) && normalized.includes(term)) score += 8;
  }
  return score;
};

const collectSpecs = (source: string) => {
  const specs: string[] = [];
  for (const [pattern, label] of SPEC_PATTERNS) {
    const match = source.match(pattern);
    if (!match) continue;
    addUnique(specs, label || match[0].replace(/\s+/g, ''));
  }
  return specs;
};

const collectApplications = (source: string, category?: ProductCategory | null) => {
  const output: string[] = [];
  const scenes = category?.scenes?.length
    ? category.scenes
    : [];
  for (const scene of scenes) {
    if (source.includes(scene.toLowerCase()) || output.length < 4) addUnique(output, scene);
  }
  return output.slice(0, 6);
};

export function buildProductKeywordPlan(input: ProductKeywordPlanInput): ProductKeywordPlan {
  const maxSecondary = input.maxSecondary ?? 8;
  const source = [
    input.productName,
    input.categoryNames,
    input.sourceText,
    input.coreKeyword,
  ].map(normalizeText).join(' ').toLowerCase();

  const candidates: string[] = [];
  if (input.coreKeyword) addUnique(candidates, input.coreKeyword);
  const contextKeywords = extractKeywordCandidates(input.keywordContext);
  const contextKeywordKeys = new Set(contextKeywords.map(keywordKey));
  for (const keyword of contextKeywords) addUnique(candidates, keyword);
  for (const keyword of input.category?.primaryKeywords ?? []) addUnique(candidates, keyword);
  for (const keyword of input.category?.secondaryKeywords ?? []) addUnique(candidates, keyword);
  for (const keyword of input.category?.keywords ?? []) addUnique(candidates, keyword);

  const avoidKeywords = candidates
    .filter(keyword => isAvoidKeyword(keyword, source))
    .sort((a, b) => Number(CONSUMER_OR_BLOG_ONLY_RE.test(b)) - Number(CONSUMER_OR_BLOG_ONLY_RE.test(a)))
    .slice(0, 8);

  const ranked = candidates
    .filter(keyword => !isAvoidKeyword(keyword, source))
    .sort((a, b) => {
      const score = (keyword: string) => (
        scoreKeyword(keyword, source, input.coreKeyword || '')
        + (contextKeywordKeys.has(keywordKey(keyword)) ? 25 : 0)
      );
      return score(b) - score(a);
    });

  const primaryKeyword = ranked[0] || normalizeKeyword(input.coreKeyword || '') || '';
  const secondaryKeywords = ranked
    .filter(keyword => keywordKey(keyword) !== keywordKey(primaryKeyword))
    .slice(0, maxSecondary);
  const specificationKeywords = collectSpecs(source);
  const applicationKeywords = collectApplications(source, input.category);
  const imageAltKeywords = [primaryKeyword, ...specificationKeywords, ...(input.category?.keywords ?? [])]
    .filter(Boolean)
    .reduce<string[]>((acc, keyword) => {
      addUnique(acc, keyword);
      return acc;
    }, [])
    .slice(0, 8);

  return {
    primaryKeyword,
    secondaryKeywords,
    applicationKeywords,
    specificationKeywords,
    faqKeywords: FAQ_KEYWORDS,
    imageAltKeywords,
    avoidKeywords,
    buyerIntent: 'Match the audience and next action defined by the active site context and current task.',
  };
}

const listLine = (label: string, values: string[]) =>
  values.length ? `${label}: ${values.join(', ')}` : `${label}: (none detected)`;

export function formatProductKeywordPlanBlock(plan: ProductKeywordPlan): string {
  if (!plan.primaryKeyword && !plan.secondaryKeywords.length) return '';
  return `
PRODUCT KEYWORD PLAN (derived from selected knowledge base; follow this before using the raw keyword database):
- Primary keyword: ${plan.primaryKeyword || '(choose the closest product-specific keyword)'}
- ${listLine('Secondary keywords', plan.secondaryKeywords)}
- ${listLine('Application keywords', plan.applicationKeywords)}
- ${listLine('Specification keywords', plan.specificationKeywords)}
- ${listLine('FAQ keywords', plan.faqKeywords)}
- ${listLine('Image alt strategy', plan.imageAltKeywords)}
- ${listLine('Avoid on product page unless factual', plan.avoidKeywords)}
- Audience intent: ${plan.buyerIntent}
Field usage:
- SEO title/meta: primary keyword + relevant entity + evidence-supported audience intent.
- Product description: primary keyword once early, then 2-4 secondary/spec/application keywords naturally.
- FAQ: answer only questions supported by uploaded knowledge, product facts, or selected keyword context.
- Image SEO: describe the visible object first, then include the primary keyword or a close variant.
`.trim();
}

export function buildProductKeywordPlanBlock(input: ProductKeywordPlanInput): string {
  return formatProductKeywordPlanBlock(buildProductKeywordPlan(input));
}
