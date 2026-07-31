import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { access, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const pluginRoot = new URL('../../wordpress-plugins/demo-brand-blog-layout/', import.meta.url);
const rootZip = new URL('../../demo-brand-blog-layout.zip', import.meta.url);
const pluginZip = new URL('../../wordpress-plugins/demo-brand-blog-layout.zip', import.meta.url);
const lenscraftPluginRoot = new URL('../../wordpress-plugins/lenscraft-image-compressor/', import.meta.url);
const lenscraftPluginZip = new URL('../../wordpress-plugins/lenscraft-image-compressor.zip', import.meta.url);

const sourceFiles = [
  'demo-brand-blog-layout.php',
  'assets/blog-layout.css',
  'assets/editor-blog-layout.css',
];

const pluginFixtureUrls = [
  new URL('demo-brand-blog-layout.php', pluginRoot),
  new URL('assets/blog-layout.css', pluginRoot),
  new URL('assets/editor-blog-layout.css', pluginRoot),
  rootZip,
  pluginZip,
  new URL('lenscraft-image-compressor.php', lenscraftPluginRoot),
  new URL('assets/admin.css', lenscraftPluginRoot),
  new URL('assets/admin.js', lenscraftPluginRoot),
  lenscraftPluginZip,
];

const pluginsAvailable = (
  await Promise.all(pluginFixtureUrls.map(async url => {
    try {
      await access(fileURLToPath(url));
      return true;
    } catch {
      return false;
    }
  }))
).every(Boolean);

const pluginTest = (
  name: string,
  fn: () => void | Promise<void>,
) => test(name, { skip: pluginsAvailable ? false : 'WordPress plugin fixtures are not included in this desktop workspace.' }, fn as any);

const listZipEntries = async (zipUrl: URL) => {
  const { stdout } = await execFileAsync('unzip', ['-Z1', fileURLToPath(zipUrl)]);
  return stdout.trim().split('\n').filter(Boolean);
};

const readZipEntry = async (zipUrl: URL, entry: string) => {
  const { stdout } = await execFileAsync('unzip', ['-p', fileURLToPath(zipUrl), entry], {
    encoding: 'buffer',
    maxBuffer: 1024 * 1024,
  });
  return Buffer.from(stdout);
};

const assertBalancedBraces = (css: string, filename: string) => {
  let depth = 0;
  for (const char of css) {
    if (char === '{') depth += 1;
    if (char === '}') depth -= 1;
    assert.ok(depth >= 0, `${filename} closes more braces than it opens`);
  }
  assert.equal(depth, 0, `${filename} has unbalanced braces`);
};

pluginTest('WordPress blog layout plugin has the required hooks and assets', async () => {
  const php = await readFile(new URL('demo-brand-blog-layout.php', pluginRoot), 'utf8');

  assert.match(php, /Plugin Name:\s*Demo Brand Blog Layout/);
  assert.match(php, /if \(!defined\('ABSPATH'\)\)/);
  assert.match(php, /add_action\('wp_enqueue_scripts', 'demo-brand_blog_layout_enqueue_frontend', 20\)/);
  assert.match(php, /add_action\('enqueue_block_editor_assets', 'demo-brand_blog_layout_enqueue_editor', 20\)/);
  assert.match(php, /assets\/blog-layout\.css/);
  assert.match(php, /assets\/editor-blog-layout\.css/);
});

pluginTest('WordPress blog layout stylesheets have balanced CSS blocks', async () => {
  for (const filename of ['assets/blog-layout.css', 'assets/editor-blog-layout.css']) {
    const css = await readFile(new URL(filename, pluginRoot), 'utf8');
    assertBalancedBraces(css, filename);
    assert.match(css, /\.blog-related-card/);
    assert.match(css, /\.wp-block-aioseo-faq/);
  }
});

pluginTest('WordPress plugin zip artifacts contain one clean top-level plugin directory', async () => {
  for (const zipUrl of [rootZip, pluginZip]) {
    const entries = await listZipEntries(zipUrl);
    const files = entries.filter(entry => !entry.endsWith('/'));

    assert.deepEqual(
      files.sort(),
      sourceFiles.map(file => `demo-brand-blog-layout/${file}`).sort(),
      `${zipUrl.pathname} should contain only the installable plugin folder`,
    );

    for (const sourceFile of sourceFiles) {
      const source = await readFile(new URL(sourceFile, pluginRoot));
      const zipped = await readZipEntry(zipUrl, `demo-brand-blog-layout/${sourceFile}`);
      assert.deepEqual(zipped, source, `${sourceFile} in ${zipUrl.pathname} should match the source plugin`);
    }
  }
});

pluginTest('LensCraft image compressor plugin exposes media admin page and ajax actions', async () => {
  const php = await readFile(new URL('lenscraft-image-compressor.php', lenscraftPluginRoot), 'utf8');

  assert.match(php, /Plugin Name:\s*LensCraft Image Compressor/);
  assert.match(php, /Version:\s*1\.1\.1/);
  assert.match(php, /private const VERSION = '1\.1\.1'/);
  assert.match(php, /if \(!defined\('ABSPATH'\)\)/);
  assert.match(php, /add_media_page\(/);
  assert.match(php, /lenscraft-compressor/);
  assert.match(php, /wp_ajax_lcic_compress_media/);
  assert.match(php, /wp_ajax_lcic_batch_compress/);
  assert.match(php, /wp_ajax_lcic_refresh_stats/);
  assert.match(php, /wp_ajax_lcic_rollback_media/);
  assert.match(php, /wp_ajax_lcic_compare_media/);
  assert.match(php, /assets\/admin\.css/);
  assert.match(php, /assets\/admin\.js/);
});

pluginTest('LensCraft image compressor sorts by computed file sizes without filtering on size meta', async () => {
  const php = await readFile(new URL('lenscraft-image-compressor.php', lenscraftPluginRoot), 'utf8');

  assert.match(php, /main_size_bytes/);
  assert.match(php, /sub_sizes_total_bytes/);
  assert.match(php, /usort\(\$rows/);
  assert.match(php, /case 'largest'/);
  assert.match(php, /case 'smallest'/);
  assert.doesNotMatch(php, /meta_key['"]?\s*=>\s*['"][^'"]*size/i);
});

pluginTest('LensCraft image compressor assets and zip artifact are installable', async () => {
  const css = await readFile(new URL('assets/admin.css', lenscraftPluginRoot), 'utf8');
  const js = await readFile(new URL('assets/admin.js', lenscraftPluginRoot), 'utf8');
  const php = await readFile(new URL('lenscraft-image-compressor.php', lenscraftPluginRoot), 'utf8');
  assertBalancedBraces(css, 'assets/admin.css');
  assert.match(css, /\.lcic-wrap/);
  assert.match(css, /\.lcic-compare-modal/);
  assert.match(css, /\.lcic-table\s*\{[^}]*table-layout:\s*auto/s);
  assert.match(css, /\.lcic-file-cell div\s*\{[^}]*min-width:\s*0/s);
  assert.match(css, /\.lcic-file-cell strong\s*\{[^}]*text-overflow:\s*ellipsis/s);
  assert.doesNotMatch(php, /widefat fixed striped lcic-table/);
  assert.match(js, /lcicCompressMedia/);
  assert.match(js, /lcicBatchCompress/);
  assert.match(js, /lcicRollbackMedia/);
  assert.match(js, /lcicCompareMedia/);

  const entries = await listZipEntries(lenscraftPluginZip);
  const files = entries.filter(entry => !entry.endsWith('/')).sort();
  assert.deepEqual(files, [
    'lenscraft-image-compressor/assets/admin.css',
    'lenscraft-image-compressor/assets/admin.js',
    'lenscraft-image-compressor/lenscraft-image-compressor.php',
  ].sort());
});

pluginTest('LensCraft image compressor creates backups for rollback and compare previews', async () => {
  const php = await readFile(new URL('lenscraft-image-compressor.php', lenscraftPluginRoot), 'utf8');

  assert.match(php, /lenscraft-backups/);
  assert.match(php, /create_backup_manifest/);
  assert.match(php, /restore_backup_manifest/);
  assert.match(php, /get_backup_manifest/);
  assert.match(php, /manifest\.json/);
  assert.match(php, /lcic-has-backup/);
  assert.match(php, /lcic-rollback-one/);
  assert.match(php, /lcic-compare-one/);
});

pluginTest('LensCraft image compressor lets admins cancel an in-progress batch after the current item', async () => {
  const php = await readFile(new URL('lenscraft-image-compressor.php', lenscraftPluginRoot), 'utf8');
  const css = await readFile(new URL('assets/admin.css', lenscraftPluginRoot), 'utf8');
  const js = await readFile(new URL('assets/admin.js', lenscraftPluginRoot), 'utf8');

  assert.match(php, /id="lcic-cancel-batch"/);
  assert.match(css, /\.lcic-cancel-button/);
  assert.match(js, /batchCancelled/);
  assert.match(js, /window\.lcicCancelBatch/);
  assert.match(js, /Batch cancelled after current request/);
  assert.match(js, /limit:\s*1/);
});

pluginTest('LensCraft image compressor keeps batch progress visible with counts until refresh', async () => {
  const php = await readFile(new URL('lenscraft-image-compressor.php', lenscraftPluginRoot), 'utf8');
  const css = await readFile(new URL('assets/admin.css', lenscraftPluginRoot), 'utf8');
  const js = await readFile(new URL('assets/admin.js', lenscraftPluginRoot), 'utf8');

  assert.match(php, /id="lcic-progress-shell"/);
  assert.match(php, /id="lcic-progress-fill"/);
  assert.match(css, /\.lcic-progress-shell\s*\{[^}]*position:\s*sticky/s);
  assert.match(css, /\.lcic-progress-bar/);
  assert.match(js, /const updateBatchProgress/);
  assert.match(js, /aria-valuenow/);
  assert.match(js, /markRowsProcessed/);
  assert.match(js, /Click Refresh to update the list/);
});

pluginTest('LensCraft image compressor separates selected-image actions from all-image actions', async () => {
  const php = await readFile(new URL('lenscraft-image-compressor.php', lenscraftPluginRoot), 'utf8');
  const js = await readFile(new URL('assets/admin.js', lenscraftPluginRoot), 'utf8');

  assert.match(php, /data-scope="selected"[^>]*>\s*<\?php echo esc_html__\('Compress Selected'/);
  assert.match(php, /data-scope="pending"[^>]*>\s*<\?php echo esc_html__\('Compress All Pending'/);
  assert.match(php, /data-scope="selected"[^>]*data-convert="1"[^>]*>\s*<\?php echo esc_html__\('Convert Selected to WebP'/);
  assert.match(js, /batchScope/);
  assert.match(js, /Select one or more images first/);
  assert.match(js, /batchScope === 'selected'/);
  assert.match(js, /batchScope === 'all' \? 'all' : 'pending'/);
});

pluginTest('LensCraft image compressor forces WebP replacement when WebP conversion is requested', async () => {
  const php = await readFile(new URL('lenscraft-image-compressor.php', lenscraftPluginRoot), 'utf8');
  const js = await readFile(new URL('assets/admin.js', lenscraftPluginRoot), 'utf8');

  assert.match(php, /Version:\s*1\.1\.1/);
  assert.match(php, /private const VERSION = '1\.1\.1'/);
  assert.match(php, /if \(\$convert_webp && !function_exists\('imagewebp'\)\)/);
  assert.match(php, /if \(\$after <= 0 \|\| \(\!\$converted && \$after >= \$before\)\)/);
  assert.doesNotMatch(php, /if \(\$after <= 0 \|\| \$after >= \$before\)/);
  assert.match(php, /\$processed_rows = \[\]/);
  assert.match(php, /'rows' => \$processed_rows/);
  assert.match(js, /const updateRowsFromResponse/);
  assert.match(js, /updateRowsFromResponse\(data\.rows \|\| \{\}\)/);
});
