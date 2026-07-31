export type ProductDraftFieldKey =
  | 'short_description'
  | 'description'
  | 'acf_seo_extra_info'
  | 'aioseo_title'
  | 'aioseo_description'
  | 'tag_names'
  | 'slug';

export interface ProductDraftSource {
  id: number;
  short_description?: string;
  description?: string;
  acf_seo_extra_info?: string;
  aioseo_title?: string;
  aioseo_description?: string;
  catalog_text?: string;
  short_ref_images?: string;
  full_ref_images?: string;
  slug?: string;
  tag_names?: string;
}

export interface ProductEditDraft {
  short_description: string;
  description: string;
  acf_seo_extra_info: string;
  aioseo_title: string;
  aioseo_description: string;
  catalog_text: string;
  short_ref_images: string;
  full_ref_images: string;
  slug: string;
  tag_names: string;
}

export type ProductDraftMap = Record<number, ProductEditDraft>;

export const createProductDraft = (product: ProductDraftSource): ProductEditDraft => ({
  short_description: product.short_description || '',
  description: product.description || '',
  acf_seo_extra_info: product.acf_seo_extra_info || '',
  aioseo_title: product.aioseo_title || '',
  aioseo_description: product.aioseo_description || '',
  catalog_text: product.catalog_text || '',
  short_ref_images: product.short_ref_images || '',
  full_ref_images: product.full_ref_images || '',
  slug: product.slug || '',
  tag_names: product.tag_names || '',
});

export const updateProductDraft = (
  draft: ProductEditDraft,
  updates: Partial<ProductEditDraft>,
): ProductEditDraft => ({
  ...draft,
  ...updates,
});

export const applyGeneratedProductField = <T extends ProductDraftSource>(
  drafts: ProductDraftMap,
  product: T,
  field: ProductDraftFieldKey,
  value: string,
): ProductDraftMap => {
  const existing = drafts[product.id] || createProductDraft(product);
  return {
    ...drafts,
    [product.id]: {
      ...existing,
      [field]: value,
    },
  };
};
