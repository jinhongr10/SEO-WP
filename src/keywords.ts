export interface ProductCategory {
  slug: string;
  displayName: string;
  filenamePatterns: string[];
  keywords: string[];
  /** High-priority keywords for title/H1. */
  primaryKeywords: string[];
  /** Important keywords for H2/body/blog. */
  secondaryKeywords: string[];
  /** Core selling-point modifiers for this category. */
  sellingPoints: string[];
  /** Scene descriptors supplied by the user's uploaded/custom category. */
  scenes: string[];
}

export const DEFAULT_CATEGORIES: ProductCategory[] = [];

const normalizeText = (value: string) => value.replace(/\s+/g, ' ').trim();

/**
 * Build a keyword context block for AI prompts, with priority annotations.
 * The app ships no built-in company or industry vocabulary; this only formats
 * categories provided by the active site, uploaded keyword files, or user data.
 */
export function buildKeywordContext(category: ProductCategory): string {
  const primary = category.primaryKeywords.slice(0, 15).join(', ');
  const secondary = category.secondaryKeywords.slice(0, 10).join(', ');
  const scenes = category.scenes.join(', ');
  const sellingPoints = category.sellingPoints.join(', ');

  return `
SEO Keyword Reference for "${category.displayName}":
  Priority keywords (use in title/H1 when relevant): ${primary || '(none provided)'}
  Important keywords (use in description/body when relevant): ${secondary || '(none provided)'}
  Target scenes: ${scenes || '(none provided)'}
  Core selling points: ${sellingPoints || '(none provided)'}
  Target audience: use the active site's uploaded company knowledge, settings, and keyword source.
  Tone: professional, factual, and grounded in the selected site context`.trim();
}

export function detectCategory(
  filename: string,
  relativePath: string,
  categories: ProductCategory[],
): ProductCategory | null {
  const combined = `${relativePath}/${filename}`.toLowerCase();

  const candidates = categories.flatMap(cat =>
    cat.filenamePatterns.map(p => ({ pattern: normalizeText(p).toLowerCase(), category: cat })),
  ).filter(item => item.pattern)
    .sort((a, b) => b.pattern.length - a.pattern.length);

  for (const { pattern, category } of candidates) {
    if (combined.includes(pattern)) {
      return category;
    }
  }
  return null;
}
