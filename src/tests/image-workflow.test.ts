import assert from 'node:assert/strict';
import test from 'node:test';

import { ProcessingStatus, WorkImage } from '../../types.ts';
import {
  applyBatchKeywordToImages,
  getImageProcessQueue,
  getImageTaskSummary,
  getImageUploadQueue,
  isImageTaskRunning,
} from '../imageWorkflow.ts';

const image = (id: string, status: ProcessingStatus = ProcessingStatus.IDLE): WorkImage => ({
  id,
  file: {} as File,
  previewUrl: `blob:${id}`,
  targetWidth: 1200,
  quality: 0.75,
  mainKeyword: '',
  extraDesc: '',
  status,
});

test('image processing can queue selected idle images in thumbnail order', () => {
  const images = [
    image('first', ProcessingStatus.IDLE),
    image('second', ProcessingStatus.PROCESSING),
    image('third', ProcessingStatus.IDLE),
  ];

  const queue = getImageProcessQueue(images, {
    activeId: 'first',
    selectedIds: ['third', 'first'],
  });

  assert.deepEqual(queue.map(item => item.id), ['first', 'third']);
});

test('image processing falls back to active image when there is no selection', () => {
  const images = [
    image('first', ProcessingStatus.IDLE),
    image('second', ProcessingStatus.IDLE),
    image('third', ProcessingStatus.ERROR),
  ];

  const queue = getImageProcessQueue(images, {
    activeId: 'second',
    selectedIds: [],
  });

  assert.deepEqual(queue.map(item => item.id), ['second']);
});

test('a background image task does not block controls for the selected idle image', () => {
  const images = [
    image('first', ProcessingStatus.PROCESSING),
    image('second', ProcessingStatus.IDLE),
  ];

  const summary = getImageTaskSummary(images, 'second', []);

  assert.equal(isImageTaskRunning(images[0].status), true);
  assert.equal(summary.runningCount, 1);
  assert.equal(summary.activeBusy, false);
  assert.equal(summary.activeBusyText, '');
});

test('the active image cannot be queued twice while it is already running', () => {
  const images = [
    image('first', ProcessingStatus.PROCESSING),
    image('second', ProcessingStatus.IDLE),
  ];

  const queue = getImageProcessQueue(images, {
    activeId: 'first',
    selectedIds: [],
  });

  assert.deepEqual(queue, []);
});

test('batch keyword fills only selected empty keywords by default', () => {
  const images = [
    { ...image('first'), mainKeyword: '' },
    { ...image('second'), mainKeyword: 'existing keyword' },
    { ...image('third'), mainKeyword: '' },
  ];

  const updated = applyBatchKeywordToImages(images, ['first', 'second'], 'product sample', {
    overwriteExisting: false,
  });

  assert.equal(updated.find(item => item.id === 'first')?.mainKeyword, 'product sample');
  assert.equal(updated.find(item => item.id === 'second')?.mainKeyword, 'existing keyword');
  assert.equal(updated.find(item => item.id === 'third')?.mainKeyword, '');
});

test('batch keyword can overwrite selected keywords when explicitly requested', () => {
  const images = [
    { ...image('first'), mainKeyword: 'old keyword' },
    { ...image('second'), mainKeyword: 'keep me' },
  ];

  const updated = applyBatchKeywordToImages(images, ['first'], 'enterprise product sample', {
    overwriteExisting: true,
  });

  assert.equal(updated.find(item => item.id === 'first')?.mainKeyword, 'enterprise product sample');
  assert.equal(updated.find(item => item.id === 'second')?.mainKeyword, 'keep me');
});

test('upload queue includes selected completed images with blobs and seo data', () => {
  const ready = {
    ...image('ready', ProcessingStatus.COMPLETED),
    processedBlob: new Blob(['ready']),
    seoData: {
      filename: 'ready.webp',
      title: 'Ready',
      alt: 'Ready',
      caption: 'Ready',
      description: 'Ready',
    },
  };
  const missingBlob = {
    ...image('missing-blob', ProcessingStatus.COMPLETED),
    seoData: ready.seoData,
  };

  const queue = getImageUploadQueue([missingBlob, ready], ['ready', 'missing-blob']);

  assert.deepEqual(queue.map(item => item.id), ['ready']);
});

test('task summary can count multiple uploading images', () => {
  const images = [
    image('first', ProcessingStatus.COMPLETED),
    image('second', ProcessingStatus.COMPLETED),
    image('third', ProcessingStatus.IDLE),
  ];

  const summary = getImageTaskSummary(images, 'second', new Set(['first', 'second']));

  assert.equal(summary.runningCount, 2);
  assert.equal(summary.activeBusy, true);
  assert.equal(summary.activeBusyText, '正在上传到WordPress...');
});
