import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { redactEvidenceTree } from '../redact-release-evidence.mjs';

test('release evidence redaction sanitizes text files without touching screenshots', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'release-evidence-redaction-'));
  try {
    const logPath = path.join(root, 'backend.log');
    const screenshotPath = path.join(root, 'failure.png');
    const screenshot = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    await writeFile(logPath, 'WINDOWS_CSC_LINK=certificate\n"password": "secret"\n', 'utf8');
    await writeFile(screenshotPath, screenshot);

    const files = await redactEvidenceTree(root);

    assert.deepEqual(files, ['backend.log']);
    assert.doesNotMatch(await readFile(logPath, 'utf8'), /certificate|secret/);
    assert.deepEqual(await readFile(screenshotPath), screenshot);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
