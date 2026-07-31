export type MediaKeywordCandidate = {
  keyword: string;
  volume?: number;
  intent?: string;
  cpc?: number;
  competition?: string;
  category?: string;
  relevanceScore?: number;
  suggestedPhrase?: string;
};

export type MediaKeywordSelectionInput = {
  coreKeyword: string;
  selectedCategory?: string;
  sourceText?: string;
  keywords: MediaKeywordCandidate[];
  limit?: number;
};

export type MediaSeoKeywordOutput = {
  filename: string;
  title: string;
  alt_text: string;
  caption: string;
  description: string;
};

export type MediaKeywordUsage = {
  coreKeyword: string;
  candidateKeywords: string[];
  usedKeywords: string[];
  warnings: string[];
  validationStatus: 'passed' | 'core-only' | 'inferred';
};

const MEDIA_KEYWORD_STOP_WORDS = new Set([
  'and', 'for', 'from', 'image', 'images', 'photo', 'photos', 'product', 'products',
  'the', 'this', 'with',
]);

export const normalizeMediaKeywordPhrase = (value: unknown): string => (
  String(value ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
);

const keywordTokens = (value: unknown) => (
  normalizeMediaKeywordPhrase(value)
    .split(' ')
    .filter(token => token.length > 1 && !MEDIA_KEYWORD_STOP_WORDS.has(token))
);

const sharedTokenCount = (left: string[], right: string[]) => {
  const rightSet = new Set(right);
  return left.reduce((count, token) => count + (rightSet.has(token) ? 1 : 0), 0);
};

export const selectMediaKeywordCandidates = ({
  coreKeyword,
  selectedCategory = '',
  sourceText = '',
  keywords,
  limit = 12,
}: MediaKeywordSelectionInput): MediaKeywordCandidate[] => {
  const normalizedCore = normalizeMediaKeywordPhrase(coreKeyword);
  const normalizedCategory = normalizeMediaKeywordPhrase(selectedCategory).replace(/\s+/g, '-');
  const coreTokens = keywordTokens(coreKeyword);
  const sourceTokens = keywordTokens(sourceText);
  const seen = new Set<string>();
  const ranked: Array<{ item: MediaKeywordCandidate; score: number; index: number }> = [];

  keywords.forEach((item, index) => {
    const keyword = String(item?.keyword ?? '').replace(/\s+/g, ' ').trim();
    const normalizedKeyword = normalizeMediaKeywordPhrase(keyword);
    if (!normalizedKeyword || normalizedKeyword === normalizedCore || seen.has(normalizedKeyword)) return;
    seen.add(normalizedKeyword);

    const normalizedItemCategory = normalizeMediaKeywordPhrase(item.category).replace(/\s+/g, '-');
    const categoryMatch = Boolean(normalizedCategory && normalizedItemCategory === normalizedCategory);
    const containsCore = Boolean(normalizedCore && normalizedKeyword.includes(normalizedCore));
    const itemTokens = keywordTokens(keyword);
    const coreOverlap = sharedTokenCount(itemTokens, coreTokens);
    const sourceOverlap = sharedTokenCount(itemTokens, sourceTokens);
    if (!categoryMatch && !containsCore && coreOverlap === 0 && sourceOverlap === 0) return;

    const relevance = Number.isFinite(Number(item.relevanceScore)) ? Number(item.relevanceScore) : 0;
    const volume = Number.isFinite(Number(item.volume)) ? Math.max(0, Number(item.volume)) : 0;
    const score = (
      (categoryMatch ? 1000 : 0)
      + (containsCore ? 500 : 0)
      + coreOverlap * 50
      + sourceOverlap * 20
      + relevance
      + Math.min(20, Math.log10(volume + 1) * 5)
    );
    ranked.push({ item: { ...item, keyword }, score, index });
  });

  const cappedLimit = Math.max(1, Math.min(50, Math.trunc(limit || 12)));
  return ranked
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, cappedLimit)
    .map(entry => entry.item);
};

const includesNormalizedPhrase = (text: unknown, phrase: unknown) => {
  const normalizedText = normalizeMediaKeywordPhrase(text);
  const normalizedPhrase = normalizeMediaKeywordPhrase(phrase);
  return Boolean(normalizedPhrase && normalizedText.includes(normalizedPhrase));
};

export const validateMediaKeywordUsage = ({
  coreKeyword,
  candidates,
  output,
}: {
  coreKeyword: string;
  candidates: MediaKeywordCandidate[];
  output: MediaSeoKeywordOutput;
}): MediaKeywordUsage => {
  const cleanCoreKeyword = String(coreKeyword || '').replace(/\s+/g, ' ').trim();
  const fieldLimits: Array<[keyof MediaSeoKeywordOutput, number]> = [
    ['filename', 125],
    ['title', 60],
    ['alt_text', 125],
    ['caption', 120],
    ['description', 160],
  ];
  for (const [field, limit] of fieldLimits) {
    const value = String(output[field] || '').trim();
    if (!value || value.length > limit) {
      throw new Error(`Generated ${field} failed the required length limit (${limit})`);
    }
  }
  const supportingFields = [output.alt_text, output.caption, output.description]
    .map(normalizeMediaKeywordPhrase);
  if (new Set(supportingFields).size === 1) {
    throw new Error('Generated SEO supporting fields are overly repetitive');
  }
  if (cleanCoreKeyword && (
    !includesNormalizedPhrase(output.filename, cleanCoreKeyword)
    || !includesNormalizedPhrase(output.title, cleanCoreKeyword)
  )) {
    throw new Error('Generated filename and title must include the core keyword');
  }

  const candidateKeywords = Array.from(new Map(
    candidates
      .map(item => String(item.keyword || '').replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .map(keyword => [normalizeMediaKeywordPhrase(keyword), keyword] as const),
  ).values());
  const supportingText = [output.alt_text, output.caption, output.description].join(' ');
  const usedKeywords = candidateKeywords.filter(keyword => includesNormalizedPhrase(supportingText, keyword));

  if (candidateKeywords.length > 0 && usedKeywords.length === 0) {
    throw new Error('Generated SEO did not use a supporting keyword from the uploaded table');
  }
  if (usedKeywords.length > 3) {
    throw new Error('Generated SEO used more than three supporting keywords');
  }

  return {
    coreKeyword: cleanCoreKeyword,
    candidateKeywords,
    usedKeywords,
    warnings: candidateKeywords.length > 0 ? [] : (cleanCoreKeyword ? ['词表无匹配词'] : []),
    validationStatus: candidateKeywords.length > 0 ? 'passed' : (cleanCoreKeyword ? 'core-only' : 'inferred'),
  };
};

export const generateValidatedMediaSeo = async ({
  coreKeyword,
  candidates,
  generate,
  maxAttempts = 2,
}: {
  coreKeyword: string;
  candidates: MediaKeywordCandidate[];
  generate: (context: {
    attempt: number;
    validationFeedback: string;
  }) => Promise<MediaSeoKeywordOutput>;
  maxAttempts?: number;
}): Promise<{ output: MediaSeoKeywordOutput; keywordUsage: MediaKeywordUsage }> => {
  const attempts = Math.max(1, Math.min(2, Math.trunc(maxAttempts || 2)));
  let validationFeedback = '';

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const output = await generate({ attempt, validationFeedback });
    try {
      const keywordUsage = validateMediaKeywordUsage({ coreKeyword, candidates, output });
      return { output, keywordUsage };
    } catch (error) {
      validationFeedback = error instanceof Error ? error.message : String(error);
      if (attempt === attempts) {
        throw new Error(`Media SEO validation failed after ${attempts} attempts: ${validationFeedback}`);
      }
    }
  }

  throw new Error(`Media SEO validation failed after ${attempts} attempts`);
};

const normalizeMediaSeoFilename = (value: unknown) => {
  const withoutExtension = String(value || '').replace(/\.[a-z0-9]+$/i, '');
  const stem = normalizeMediaKeywordPhrase(withoutExtension).replace(/\s+/g, '-') || 'image';
  return `${stem}.webp`;
};

export const reserveUniqueMediaSeoFilename = (
  proposedFilename: string,
  mediaId: number,
  usedFilenames: Set<string>,
  sourceHint = '',
) => {
  const normalized = normalizeMediaSeoFilename(proposedFilename);
  const normalizedKey = normalized.toLowerCase();
  if (!usedFilenames.has(normalizedKey)) {
    usedFilenames.add(normalizedKey);
    return normalized;
  }

  const stem = normalized.replace(/\.webp$/i, '');
  const stemTokens = new Set(stem.split('-'));
  const hintTokens = normalizeMediaKeywordPhrase(sourceHint).split(' ').filter(token => (
    token.length > 1 && !stemTokens.has(token) && !MEDIA_KEYWORD_STOP_WORDS.has(token)
  ));
  const detailTerms = new Set(['front', 'rear', 'back', 'side', 'top', 'detail', 'closeup', 'angle', 'scene', 'installed', 'indoor', 'outdoor']);
  const prioritizedHints = hintTokens.filter(token => /\d/.test(token) || detailTerms.has(token));
  const selectedHints = [...prioritizedHints, ...hintTokens]
    .filter((token, index, all) => all.indexOf(token) === index)
    .slice(0, 2);
  if (selectedHints.length) {
    const detailed = `${stem}-${selectedHints.join('-')}.webp`;
    if (!usedFilenames.has(detailed.toLowerCase())) {
      usedFilenames.add(detailed.toLowerCase());
      return detailed;
    }
  }
  let suffix = String(Math.max(1, Math.trunc(Number(mediaId) || 0)));
  let unique = `${stem}-${suffix}.webp`;
  let counter = 2;
  while (usedFilenames.has(unique.toLowerCase())) {
    suffix = `${Math.max(1, Math.trunc(Number(mediaId) || 0))}-${counter}`;
    unique = `${stem}-${suffix}.webp`;
    counter += 1;
  }
  usedFilenames.add(unique.toLowerCase());
  return unique;
};
