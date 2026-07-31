import fs from 'node:fs';
import path from 'node:path';
import { posix as posixPath } from 'node:path';
import SftpClient from 'ssh2-sftp-client';

export interface SftpConfig {
  host: string;
  port: number;
  username: string;
  password?: string;
  privateKeyPath?: string;
  hostKeySha256?: string;
  remoteWpRoot: string;
  uploadsRelative: string;
}

export class WPSftpClient {
  private client = new SftpClient();
  private connected = false;

  constructor(private readonly config: SftpConfig) {}

  async connect() {
    if (this.connected) return;
    const payload: {
      host: string;
      port: number;
      username: string;
      password?: string;
      privateKey?: Buffer;
      hostHash?: string;
      hostVerifier?: (hashedKey: string) => boolean;
    } = {
      host: this.config.host,
      port: this.config.port,
      username: this.config.username,
    };

    if (this.config.privateKeyPath) {
      payload.privateKey = fs.readFileSync(path.resolve(this.config.privateKeyPath));
    } else {
      payload.password = this.config.password;
    }

    const expectedHostKey = String(this.config.hostKeySha256 || '')
      .trim()
      .replace(/^SHA256:/i, '')
      .replace(/:/g, '')
      .toLowerCase();
    if (!expectedHostKey) {
      throw new Error('SFTP host key fingerprint is required (SFTP_HOST_KEY_SHA256).');
    }
    payload.hostHash = 'sha256';
    payload.hostVerifier = hashedKey => (
      String(hashedKey || '').replace(/^SHA256:/i, '').replace(/:/g, '').toLowerCase() === expectedHostKey
    );

    await this.client.connect(payload);
    this.connected = true;
  }

  async disconnect() {
    if (!this.connected) return;
    await this.client.end();
    this.connected = false;
  }

  resolveRemotePath(relativeUploadPath: string): string {
    const raw = String(relativeUploadPath || '').replaceAll('\\', '/');
    if (!raw || raw.includes('\0') || raw.split('/').some(segment => segment === '..')) {
      throw new Error(`Unsafe upload path: ${relativeUploadPath}`);
    }
    const cleaned = posixPath.normalize(`/${raw}`).slice(1);
    if (!cleaned || cleaned === '..' || cleaned.startsWith('../') || cleaned.includes('/../')) {
      throw new Error(`Unsafe upload path: ${relativeUploadPath}`);
    }
    const root = posixPath.normalize(this.config.remoteWpRoot.replace(/\/+$/, ''));
    const uploads = this.config.uploadsRelative.replace(/^\/+|\/+$/g, '');
    const base = posixPath.join(root, uploads);
    const candidate = posixPath.join(base, cleaned);
    if (!(candidate === base || candidate.startsWith(`${base}/`))) {
      throw new Error(`Upload path escaped the configured uploads root: ${relativeUploadPath}`);
    }
    return candidate;
  }

  async downloadRemoteFile(remotePath: string, localPath: string): Promise<number> {
    const fullLocalPath = path.resolve(localPath);
    fs.mkdirSync(path.dirname(fullLocalPath), { recursive: true });
    await this.client.fastGet(remotePath, fullLocalPath);
    return fs.statSync(fullLocalPath).size;
  }

  async uploadLocalFile(localPath: string, remotePath: string): Promise<void> {
    await this.client.fastPut(path.resolve(localPath), remotePath);
  }

  async stat(remotePath: string) {
    return this.client.stat(remotePath);
  }

  async ensureReadable(remotePath: string): Promise<void> {
    const stats = await this.client.stat(remotePath);
    if (!stats || stats.isDirectory) {
      throw new Error(`Remote file is not readable: ${remotePath}`);
    }
  }
}
