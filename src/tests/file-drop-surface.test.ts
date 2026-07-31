import assert from 'node:assert/strict';
import test from 'node:test';
import { selectAcceptedDropFiles } from '../../components/ui/FileDropSurface';

test('file drop surface filters files by extension, MIME type, and wildcard MIME type', () => {
  const files = [
    new File(['markdown'], 'company.MD', { type: '' }),
    new File(['sheet'], 'products.xlsx', { type: 'application/octet-stream' }),
    new File(['image'], 'reference.webp', { type: 'image/webp' }),
    new File(['archive'], 'sources.zip', { type: 'application/zip' }),
  ];

  assert.deepEqual(
    selectAcceptedDropFiles(files, '.md,.xlsx,image/*', true).map(file => file.name),
    ['company.MD', 'products.xlsx', 'reference.webp'],
  );
});

test('file drop surface keeps only the first accepted file in single-file mode', () => {
  const files = [
    new File(['first'], 'slug.md', { type: 'text/markdown' }),
    new File(['second'], 'tags.txt', { type: 'text/plain' }),
  ];

  assert.deepEqual(
    selectAcceptedDropFiles(files, '.md,.txt', false).map(file => file.name),
    ['slug.md'],
  );
});

test('file drop surface accepts all files when no accept rule is provided', () => {
  const files = [
    new File(['one'], 'one.bin'),
    new File(['two'], 'two.unknown'),
  ];

  assert.deepEqual(selectAcceptedDropFiles(files, undefined, true), files);
});
