import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { WPSftpClient } from '../sftp.js';

const createClient = () => new WPSftpClient({
  host: 'example.com',
  port: 22,
  username: 'tester',
  hostKeySha256: 'abc123',
  remoteWpRoot: '/srv/www',
  uploadsRelative: 'wp-content/uploads',
});

describe('WPSftpClient remote path containment', () => {
  it('resolves normal WordPress upload paths below the configured root', () => {
    assert.equal(
      createClient().resolveRemotePath('/2026/07/product.webp'),
      '/srv/www/wp-content/uploads/2026/07/product.webp',
    );
  });

  it('rejects traversal and Windows separator traversal', () => {
    assert.throws(() => createClient().resolveRemotePath('../../etc/passwd'), /Unsafe upload path/);
    assert.throws(() => createClient().resolveRemotePath('2026\\..\\..\\secret'), /Unsafe upload path/);
  });
});
