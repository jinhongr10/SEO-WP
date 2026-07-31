import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyGeneratedProductField,
  createProductDraft,
  updateProductDraft,
} from '../productDrafts.ts';

const product = (id: number, overrides: Record<string, string> = {}) => ({
  id,
  name: `Product ${id}`,
  short_description: `short ${id}`,
  description: `description ${id}`,
  acf_seo_extra_info: `acf ${id}`,
  aioseo_title: `title ${id}`,
  aioseo_description: `meta ${id}`,
  catalog_text: `catalog ${id}`,
  short_ref_images: `short-images-${id}`,
  full_ref_images: `full-images-${id}`,
  slug: `product-${id}`,
  tag_names: `tag-${id}`,
  ...overrides,
});

test('generated field result is stored on the originating product draft only', () => {
  const productOne = product(1);
  const productTwo = product(2);
  const drafts = {
    2: updateProductDraft(createProductDraft(productTwo), {
      short_description: 'manual edit on product 2',
    }),
  };

  const next = applyGeneratedProductField(drafts, productOne, 'description', 'generated description for product 1');

  assert.equal(next[1].description, 'generated description for product 1');
  assert.equal(next[1].short_description, 'short 1');
  assert.equal(next[2].short_description, 'manual edit on product 2');
  assert.equal(next[2].description, 'description 2');
});

test('updating one product draft preserves other product drafts', () => {
  const drafts = {
    1: createProductDraft(product(1)),
    2: createProductDraft(product(2)),
  };

  const next = {
    ...drafts,
    2: updateProductDraft(drafts[2], { aioseo_title: 'edited title 2' }),
  };

  assert.equal(next[1].aioseo_title, 'title 1');
  assert.equal(next[2].aioseo_title, 'edited title 2');
});
