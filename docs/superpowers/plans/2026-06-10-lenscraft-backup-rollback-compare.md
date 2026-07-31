# LensCraft Backup Rollback Compare Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add pre-compression backups, per-image rollback, and before/after compare previews to the LensCraft Image Compressor WordPress plugin.

**Architecture:** Store backup copies under `wp-content/uploads/lenscraft-backups/{attachment-id}/` with a JSON manifest that maps each original file path to its backup file and URL. The admin table reads backup state from that manifest, exposes Rollback and Compare actions, and uses AJAX endpoints for restore and compare data.

**Tech Stack:** WordPress PHP plugin, admin-ajax, jQuery admin script, CSS, Node test runner for static plugin and zip verification.

---

### Task 1: Failing Tests

**Files:**
- Modify: `src/tests/wordpress-plugin.test.ts`

- [ ] Add assertions that the plugin registers `wp_ajax_lcic_rollback_media` and `wp_ajax_lcic_compare_media`.
- [ ] Add assertions for backup manifest helpers such as `create_backup_manifest`, `restore_backup_manifest`, `lenscraft-backups`, and `lcic-has-backup`.
- [ ] Add assertions that `assets/admin.js` exposes `lcicRollbackMedia` and `lcicCompareMedia`.
- [ ] Add assertions that `assets/admin.css` contains `.lcic-compare-modal`.
- [ ] Run `npm test -- src/tests/wordpress-plugin.test.ts` and verify the new tests fail before implementation.

### Task 2: Backup And Rollback PHP

**Files:**
- Modify: `wordpress-plugins/lenscraft-image-compressor/lenscraft-image-compressor.php`

- [ ] Add backup meta constants and a backup directory constant.
- [ ] Before compression, copy the main file and sub-size files into `uploads/lenscraft-backups/{attachment-id}/`.
- [ ] Write `manifest.json` with original paths, backup paths, original URLs, current URL, size metadata, and timestamp.
- [ ] Add `ajax_rollback_media` that copies manifest files back over the originals, updates attachment metadata file sizes, clears errors, and marks the item pending/restored.
- [ ] Show Rollback and Compare buttons when a backup exists.

### Task 3: Compare Preview UI

**Files:**
- Modify: `wordpress-plugins/lenscraft-image-compressor/assets/admin.js`
- Modify: `wordpress-plugins/lenscraft-image-compressor/assets/admin.css`

- [ ] Add `lcicCompareMedia` to fetch compare data and render a modal with before/after image previews and byte totals.
- [ ] Add `lcicRollbackMedia` with a confirmation prompt, AJAX call, progress output, and reload.
- [ ] Add modal overlay, preview grid, metadata rows, and close styles.

### Task 4: Package And Verify

**Files:**
- Modify: `wordpress-plugins/lenscraft-image-compressor.zip`

- [ ] Rebuild the zip from `wordpress-plugins/lenscraft-image-compressor/`.
- [ ] Run `npm test -- src/tests/wordpress-plugin.test.ts` and verify all tests pass.
- [ ] Note that PHP runtime lint cannot run unless the local machine has `php`.
