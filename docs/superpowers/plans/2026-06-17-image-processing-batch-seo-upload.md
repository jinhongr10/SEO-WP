# Image Processing Batch SEO Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Optimize the `图片处理` workflow so users can select multiple local images, apply one shared core keyword when appropriate, batch-generate SEO metadata, review results, and batch-upload completed images to WordPress.

**Architecture:** Keep the existing browser-side image compression and existing `/ai/image-seo` plus `/wp/upload` APIs. Upgrade the frontend from active-image-only actions to selected-image queue actions with small helper functions in `src/imageWorkflow.ts`, per-image task locks, limited concurrency, and a batch action bar that mirrors the safer `媒体SEO` review/upload flow.

**Tech Stack:** React 19, TypeScript, Vite, Node test runner, existing `generateSEO`, `processImageToWebP`, and `uploadToWordPress` services.

---

## Screenshot Feedback Summary

1. `图片处理` already accepts multiple images, but processing is still active-image-only. This creates the feeling of "multi-task support" without real batch throughput.
2. Users need to select several images that share one core keyword, fill that keyword once, then generate SEO for all selected images.
3. Users also need to handle images with different keywords one by one without losing per-image keyword control.
4. Uploading in `图片处理` is serial and blocked by `uploadingImageId`; users must wait for image 1 to finish uploading before image 2 can upload.
5. `媒体SEO` already has the better mental model: generate/review first, select multiple approved items, then upload/sync in one action. `图片处理` should borrow that pattern without forcing local images into the media-library workflow.

## File Structure

- Modify: `types.ts`
  - Add small optional UI fields only if needed for batch accounting, such as `queuedAt`, `completedAt`, or `lastAction`.
  - Prefer keeping selection state in `App.tsx` instead of storing `selected` on `WorkImage`.
- Modify: `src/imageWorkflow.ts`
  - Own pure queue helpers: selected image resolution, batch keyword application, ready-to-upload filtering, task summary counts, and concurrency-safe queue selection.
- Test: `src/tests/image-workflow.test.ts`
  - Cover selected batch queues, active image fallback, upload readiness, and task summary counts.
- Modify: `App.tsx`
  - Replace single-upload state with multi-upload state.
  - Add selected image IDs, batch keyword input, batch processing, batch SEO regeneration, and batch upload handlers.
  - Render thumbnail checkboxes and a batch action bar in the `图片处理` view.
- Reuse: `services/geminiService.ts`
  - Continue using `generateSEO`; no API contract change.
- Reuse: `services/wpService.ts`
  - Continue using `uploadToWordPress`; no API contract change.
- Verify: `src/tests/app-tabs.test.ts` if static UI text coverage is needed after adding visible controls.

---

### Task 1: Queue Helper Tests

**Files:**
- Modify: `src/imageWorkflow.ts`
- Test: `src/tests/image-workflow.test.ts`

- [ ] **Step 1: Write failing tests for selected-image processing**

Add tests asserting these behaviors:

```ts
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
  ];

  const queue = getImageProcessQueue(images, {
    activeId: 'second',
    selectedIds: [],
  });

  assert.deepEqual(queue.map(item => item.id), ['second']);
});
```

- [ ] **Step 2: Write failing tests for batch keyword application**

Add tests asserting:

```ts
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
```

- [ ] **Step 3: Write failing tests for upload readiness**

Add tests asserting:

```ts
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
```

- [ ] **Step 4: Run tests and confirm failure**

Run: `node --import tsx --test src/tests/image-workflow.test.ts`

Expected: FAIL because `getImageProcessQueue` still accepts `(images, activeId)` and the new helpers do not exist.

- [ ] **Step 5: Implement pure helpers**

Implement these exports in `src/imageWorkflow.ts`:

```ts
export type ImageQueueOptions = {
  activeId: string | null;
  selectedIds?: string[];
};

export type BatchKeywordOptions = {
  overwriteExisting?: boolean;
};

export const getImageProcessQueue = (
  images: WorkImage[],
  options: ImageQueueOptions,
): WorkImage[] => {
  const selected = new Set(options.selectedIds || []);
  const candidates = selected.size
    ? images.filter(img => selected.has(img.id))
    : images.filter(img => img.id === options.activeId);

  return candidates.filter(img => !isImageTaskRunning(img.status));
};

export const applyBatchKeywordToImages = (
  images: WorkImage[],
  selectedIds: string[],
  keyword: string,
  options: BatchKeywordOptions = {},
): WorkImage[] => {
  const selected = new Set(selectedIds);
  const normalized = keyword.trim();
  if (!normalized || selected.size === 0) return images;

  return images.map(img => {
    if (!selected.has(img.id)) return img;
    if (!options.overwriteExisting && img.mainKeyword.trim()) return img;
    return { ...img, mainKeyword: normalized };
  });
};

export const getImageUploadQueue = (
  images: WorkImage[],
  selectedIds: string[],
): WorkImage[] => {
  const selected = new Set(selectedIds);
  return images.filter(img => (
    selected.has(img.id)
    && !isImageTaskRunning(img.status)
    && Boolean(img.processedBlob)
    && Boolean(img.seoData)
    && !img.wpData
  ));
};
```

- [ ] **Step 6: Update existing tests for new signature**

Change existing `getImageProcessQueue(images, 'second')` calls to:

```ts
getImageProcessQueue(images, { activeId: 'second', selectedIds: [] })
```

- [ ] **Step 7: Run tests and confirm pass**

Run: `node --import tsx --test src/tests/image-workflow.test.ts`

Expected: PASS.

---

### Task 2: Batch State And Processing Flow

**Files:**
- Modify: `App.tsx`
- Modify: `src/imageWorkflow.ts`
- Test: `src/tests/image-workflow.test.ts`

- [ ] **Step 1: Add selected image and multi-upload state**

In `App.tsx`, replace:

```ts
const [uploadingImageId, setUploadingImageId] = useState<string | null>(null);
```

with:

```ts
const [selectedImageIds, setSelectedImageIds] = useState<string[]>([]);
const [batchImageKeyword, setBatchImageKeyword] = useState('');
const [uploadingImageIds, setUploadingImageIds] = useState<Set<string>>(new Set());
const uploadTaskIdsRef = React.useRef<Set<string>>(new Set());
```

- [ ] **Step 2: Keep selection valid when images are deleted**

After image deletion and file additions, ensure `selectedImageIds` only contains IDs that still exist:

```ts
useEffect(() => {
  setSelectedImageIds(prev => prev.filter(id => images.some(img => img.id === id)));
}, [images]);
```

- [ ] **Step 3: Add a small async concurrency runner**

Add a helper near the image workflow handlers:

```ts
const runWithLimit = async <T,>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
) => {
  const queue = [...items];
  const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length > 0) {
      const item = queue.shift();
      if (!item) continue;
      await worker(item);
    }
  });
  await Promise.all(workers);
};
```

Use `limit = 2` for SEO generation and upload. This improves throughput without hammering Vertex/Gemini or WordPress.

- [ ] **Step 4: Convert `processQueue` to process selected images**

Update `processQueue` so it calls:

```ts
const queue = getImageProcessQueue(images, {
  activeId,
  selectedIds: selectedImageIds,
});
```

Then run each queued image through the existing compression and SEO generation body. Preserve `imageTaskIdsRef` so the same image cannot be queued twice.

- [ ] **Step 5: Add batch SEO regeneration**

Create `regenerateSelectedSeo`:

```ts
const regenerateSelectedSeo = async () => {
  const queue = images.filter(img => (
    selectedImageIds.includes(img.id)
    && img.processedBlob
    && !isImageTaskRunning(img.status)
  ));
  if (!queue.length) {
    setImageNotice('请选择已处理完成的图片，再批量重写 SEO。');
    return;
  }
  await runWithLimit(queue, 2, async (img) => {
    await regenerateSeoForImage(img);
  });
};
```

Extract the existing `regenerateActiveSeo` body into reusable `regenerateSeoForImage(imageToRegenerate: WorkImage)` and keep the active-image button calling that helper.

- [ ] **Step 6: Run targeted tests**

Run: `node --import tsx --test src/tests/image-workflow.test.ts`

Expected: PASS.

---

### Task 3: Batch Upload Flow

**Files:**
- Modify: `App.tsx`
- Test: `src/tests/image-workflow.test.ts`

- [ ] **Step 1: Replace single upload guard**

Change upload guards from:

```ts
if (isImageTaskRunning(imageToUpload.status) || uploadingImageId) return;
```

to per-image checks:

```ts
if (isImageTaskRunning(imageToUpload.status) || uploadingImageIds.has(imageToUpload.id)) return;
```

- [ ] **Step 2: Add per-image upload helper**

Extract the current `handleManualWPUpload` body into:

```ts
const uploadSingleImageToWp = async (imageToUpload: WorkImage) => {
  if (!imageToUpload.processedBlob) return;
  if (uploadTaskIdsRef.current.has(imageToUpload.id)) return;

  uploadTaskIdsRef.current.add(imageToUpload.id);
  setUploadingImageIds(prev => new Set(prev).add(imageToUpload.id));
  updateImage(imageToUpload.id, { status: ProcessingStatus.UPLOADING });

  try {
    const seoData = imageToUpload.seoData || fallbackSEO(imageToUpload);
    const wpData = await uploadToWordPress('', '', '', imageToUpload.processedBlob, seoData, true, resolvedBackendUrl);
    updateImage(imageToUpload.id, { wpData, status: ProcessingStatus.COMPLETED });
  } catch (error: any) {
    updateImage(imageToUpload.id, { status: ProcessingStatus.ERROR, errorMessage: error.message });
    throw error;
  } finally {
    uploadTaskIdsRef.current.delete(imageToUpload.id);
    setUploadingImageIds(prev => {
      const next = new Set(prev);
      next.delete(imageToUpload.id);
      return next;
    });
  }
};
```

- [ ] **Step 3: Keep the active upload button working**

Make `handleManualWPUpload` call:

```ts
if (activeImage) {
  await uploadSingleImageToWp(activeImage);
  setImageNotice('已上传到 WordPress。');
}
```

- [ ] **Step 4: Add selected batch upload**

Create `handleBatchWPUpload`:

```ts
const handleBatchWPUpload = async () => {
  const queue = getImageUploadQueue(images, selectedImageIds);
  if (!queue.length) {
    setImageNotice('请选择已处理且已生成 SEO 信息的图片，再批量上传。');
    return;
  }

  let success = 0;
  let failed = 0;
  await runWithLimit(queue, 2, async (img) => {
    try {
      await uploadSingleImageToWp(img);
      success += 1;
    } catch {
      failed += 1;
    }
  });

  setImageNotice(`批量上传完成：成功 ${success} 张，失败 ${failed} 张。`);
};
```

- [ ] **Step 5: Update task summary to count multiple uploads**

Change `getImageTaskSummary` to accept `uploadingImageIds: string[]` or `Set<string>` instead of one ID, then count all uploading images.

- [ ] **Step 6: Run targeted tests**

Run: `node --import tsx --test src/tests/image-workflow.test.ts`

Expected: PASS.

---

### Task 4: Batch UI In `图片处理`

**Files:**
- Modify: `App.tsx`
- Optional Test: `src/tests/app-tabs.test.ts`

- [ ] **Step 1: Add thumbnail selection checkboxes**

In the thumbnail map, add a checkbox overlay that toggles `selectedImageIds` without changing active image:

```tsx
<button
  type="button"
  onClick={(event) => {
    event.stopPropagation();
    setSelectedImageIds(prev => (
      prev.includes(img.id)
        ? prev.filter(id => id !== img.id)
        : [...prev, img.id]
    ));
  }}
  className="absolute left-1 top-1 z-10 flex h-5 w-5 items-center justify-center rounded border border-white/80 bg-black/40 text-white"
  aria-label={selectedImageIds.includes(img.id) ? '取消选择图片' : '选择图片'}
>
  {selectedImageIds.includes(img.id) ? <IconCheck className="h-3 w-3" /> : null}
</button>
```

- [ ] **Step 2: Add a compact batch action bar above `处理配置`**

Render only when `images.length > 1`:

```tsx
<div className={`rounded-2xl shadow-sm border ${theme.cardBorder} ${theme.cardBg} p-4 space-y-3`}>
  <div className="flex items-center justify-between gap-3">
    <div className={`text-sm font-bold ${theme.heading}`}>批量处理</div>
    <div className={`text-xs ${theme.subText}`}>已选 {selectedImageIds.length} / {images.length}</div>
  </div>
  <div className="flex flex-wrap gap-2">
    <button onClick={() => setSelectedImageIds(images.map(img => img.id))}>全选</button>
    <button onClick={() => setSelectedImageIds([])}>清空</button>
  </div>
  <input
    value={batchImageKeyword}
    onChange={event => setBatchImageKeyword(event.target.value)}
    placeholder="批量核心关键词，例如 product sample"
  />
  <div className="grid grid-cols-2 gap-2">
    <button onClick={() => setImages(prev => applyBatchKeywordToImages(prev, selectedImageIds, batchImageKeyword, { overwriteExisting: false }))}>
      填充空关键词
    </button>
    <button onClick={() => {
      if (confirm('确定覆盖所选图片已有核心关键词？')) {
        setImages(prev => applyBatchKeywordToImages(prev, selectedImageIds, batchImageKeyword, { overwriteExisting: true }));
      }
    }}>
      覆盖所选关键词
    </button>
  </div>
  <div className="grid grid-cols-3 gap-2">
    <button onClick={processQueue}>处理选中</button>
    <button onClick={regenerateSelectedSeo}>重写所选 SEO</button>
    <button onClick={handleBatchWPUpload}>上传所选 WP</button>
  </div>
</div>
```

Style the buttons with the existing `theme` classes. Keep the copy short so it fits in the right-side settings panel.

- [ ] **Step 3: Update active button labels**

When `selectedImageIds.length > 1`, the main process button should read:

```ts
`处理选中 ${selectedImageIds.length} 张`
```

Otherwise keep `开始处理` / `重新处理`.

- [ ] **Step 4: Show completion counts**

Near the toast or batch action bar, show:

```ts
const selectedReadyToUploadCount = getImageUploadQueue(images, selectedImageIds).length;
```

Display `可上传 ${selectedReadyToUploadCount} 张` so users know when they can batch upload after reviewing SEO fields.

- [ ] **Step 5: Add optional static UI test**

If `src/tests/app-tabs.test.ts` already renders `App.tsx`, add assertions for:

```ts
assert.match(markup, /批量处理/);
assert.match(markup, /填充空关键词/);
assert.match(markup, /上传所选 WP/);
```

- [ ] **Step 6: Run frontend tests**

Run: `node --import tsx --test src/tests/image-workflow.test.ts src/tests/app-tabs.test.ts`

Expected: PASS. If `app-tabs` cannot render dynamic image state, keep only the workflow tests and verify UI manually in Task 5.

---

### Task 5: Manual QA And Build Verification

**Files:**
- Verify: `App.tsx`
- Verify: `src/imageWorkflow.ts`
- Verify: `src/tests/image-workflow.test.ts`

- [ ] **Step 1: Run targeted tests**

Run: `node --import tsx --test src/tests/image-workflow.test.ts`

Expected: PASS.

- [ ] **Step 2: Run full frontend test suite**

Run: `npm test`

Expected: PASS.

- [ ] **Step 3: Run production build**

Run: `npm run build`

Expected: PASS with Vite and TypeScript completing successfully.

- [ ] **Step 4: Start the app locally**

Run: `npm run dev`

Expected: Vite prints a local URL, usually `http://localhost:5173/`.

- [ ] **Step 5: QA same-keyword batch flow**

Manual scenario:

1. Upload 3 local images.
2. Select all 3 thumbnails.
3. Enter `product sample` in the batch keyword field.
4. Click `填充空关键词`.
5. Click `处理选中`.
6. Confirm the toast shows multiple running/completed task counts.
7. Review each image's `SEO 信息`.
8. Click `上传所选 WP`.
9. Confirm all successful images show `已上传至 WP`.

- [ ] **Step 6: QA mixed-keyword flow**

Manual scenario:

1. Upload 3 local images.
2. Select image 1 only and enter keyword A in the existing per-image `主关键词` field.
3. Select image 2 only and enter keyword B.
4. Select image 3 only and enter keyword C.
5. Select all 3 images and click `处理选中`.
6. Confirm generated SEO uses each image's own keyword, not the last active keyword.

- [ ] **Step 7: QA upload no-longer-blocks-next-image behavior**

Manual scenario:

1. Process 3 images.
2. Select all 3.
3. Click `上传所选 WP`.
4. Confirm images 2 and 3 can enter uploading/running state without waiting for image 1's UI action to fully finish.
5. If one upload fails, confirm the other uploads still finish and the notice reports success/failure counts.

---

## Implementation Notes

- Do not change backend APIs in the first pass. The current bottleneck is mostly frontend queue orchestration and single-value upload state.
- Do not overwrite per-image `mainKeyword` silently. Default batch keyword action should fill empty keywords only; destructive overwrite requires confirmation.
- Keep per-image editing after generation. The user feedback explicitly accepts the `媒体SEO` review model, so `图片处理` should preserve a review-before-upload step.
- Limit concurrency to 2 for SEO and upload. This gives visible speedup while reducing rate-limit and WordPress timeout risk.
- Keep failed images selected after a batch action so the user can retry them quickly.
- Clear `wpData` when an image is reprocessed or its SEO filename is changed, because the uploaded result no longer matches the local draft.

## Success Criteria

- A user can upload 3 images, select all 3, enter one core keyword once, and generate SEO for all selected images.
- A user can still assign different keywords to different images before running one selected-image batch.
- A user can review generated SEO for every image before uploading.
- A user can select multiple completed images and upload them to WordPress with one click.
- One failed image does not block the remaining selected images from processing or uploading.
- Existing single-image flow still works.
