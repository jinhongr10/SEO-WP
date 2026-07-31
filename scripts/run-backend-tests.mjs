import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const isolatedBackendEnvironmentKeys = [
  'GOOGLE_GENAI_USE_VERTEXAI',
  'GOOGLE_CLOUD_PROJECT',
  'GOOGLE_PROJECT_ID',
  'GOOGLE_CLOUD_LOCATION',
  'GOOGLE_APPLICATION_CREDENTIALS',
  'GOOGLE_API_KEY',
  'GEMINI_API_KEY',
  'WP_BASE_URL',
  'WP_URL',
  'WP_USER',
  'WP_APP_PASSWORD',
  'WP_APP_PASS',
  'WC_CONSUMER_KEY',
  'WC_CONSUMER_SECRET',
  'SFTP_HOST',
  'SFTP_USER',
  'SFTP_PASSWORD',
  'REMOTE_WP_ROOT',
  'GSC_SITE_URL',
  'GSC_SERVICE_ACCOUNT_JSON',
  'SEOWPSYNC_DATA_DIR',
  'SEOWPSYNC_LOG_DIR',
  'SEOWPSYNC_CACHE_DIR',
  'SEO_WP_SYNC_NODE_CLI_PATH',
  'DB_PATH',
  'SETTINGS_FILE',
  'SEO_HEALTH_SUMMARY_FILE',
  'AUTH_FILE',
  'VAULT_KEY_FILE',
  'KNOWLEDGE_DIR',
  'KNOWLEDGE_INDEX_FILE',
  'CLIENT_PROFILES_FILE',
  'CLIENT_KNOWLEDGE_DIR',
  'SITE_DATA_DIR',
  'DAILY_SEO_SETTINGS_FILE',
  'KEYWORDS_FILE',
  'MEDIA_KEYWORDS_DIR',
  'PRODUCT_TEMPLATE_FILE',
  'CACHE_ORIGINAL_DIR',
  'CACHE_OPTIMIZED_DIR',
  'LINK_INDEX_DIR',
  'SITE_CACHE_DIR',
  'BACKUP_REMOTE_DIR',
  'LOG_DIR',
  'AI_REQUEST_THROTTLE_STATE_FILE',
  'AI_REQUEST_THROTTLE_LOCK_DIR',
];

export const buildBackendTestEnvironment = (baseEnvironment, temporaryRoot) => ({
  ...baseEnvironment,
  ...Object.fromEntries(isolatedBackendEnvironmentKeys.map(key => [key, ''])),
  HOME: temporaryRoot,
  USERPROFILE: temporaryRoot,
  APPDATA: path.join(temporaryRoot, 'appdata'),
  LOCALAPPDATA: path.join(temporaryRoot, 'local-appdata'),
  XDG_DATA_HOME: path.join(temporaryRoot, 'xdg-data'),
  XDG_CONFIG_HOME: path.join(temporaryRoot, 'xdg-config'),
  XDG_CACHE_HOME: path.join(temporaryRoot, 'xdg-cache'),
  XDG_STATE_HOME: path.join(temporaryRoot, 'xdg-state'),
  CLOUDSDK_CONFIG: path.join(temporaryRoot, 'gcloud'),
  SEO_WP_SYNC_DATA_DIR: path.join(temporaryRoot, 'data'),
  SEO_WP_SYNC_LOG_DIR: path.join(temporaryRoot, 'logs'),
  SEO_WP_SYNC_CACHE_DIR: path.join(temporaryRoot, 'cache'),
  SEO_WP_SYNC_LOAD_PROJECT_DOTENV: 'false',
  PYTHONUTF8: '1',
  PYTHONIOENCODING: 'utf-8',
});

export const backendPythonCandidates = (root, platform = process.platform) => platform === 'win32'
  ? [path.join(root, '.venv', 'Scripts', 'python.exe')]
  : [path.join(root, '.venv', 'bin', 'python')];

export const resolveBackendPython = (
  root = repositoryRoot,
  platform = process.platform,
  pathExists = existsSync,
) => {
  const executable = backendPythonCandidates(root, platform).find(pathExists);
  if (!executable) {
    throw new Error(`Backend virtualenv Python was not found for ${platform}. Create .venv before running backend tests.`);
  }
  return executable;
};

export const runIsolatedBackendTestProcess = (
  { executable, root, baseEnvironment = process.env },
  {
    makeTemporaryDirectory = () => mkdtempSync(path.join(tmpdir(), 'seo-wp-sync-backend-tests-')),
    makeDirectory = mkdirSync,
    removeDirectory = rmSync,
    spawn = spawnSync,
  } = {},
) => {
  let temporaryRoot;

  try {
    temporaryRoot = makeTemporaryDirectory();
    const environment = buildBackendTestEnvironment(baseEnvironment, temporaryRoot);
    for (const directory of [
      environment.SEO_WP_SYNC_DATA_DIR,
      environment.SEO_WP_SYNC_LOG_DIR,
      environment.SEO_WP_SYNC_CACHE_DIR,
    ]) {
      makeDirectory(directory, { recursive: true });
    }

    const result = spawn(executable, ['-m', 'unittest', 'discover', 'backend/tests'], {
      cwd: root,
      env: environment,
      stdio: 'inherit',
    });
    if (result.error) throw result.error;
    return Number.isInteger(result.status) ? result.status : 1;
  } finally {
    if (temporaryRoot) removeDirectory(temporaryRoot, { recursive: true, force: true });
  }
};

export const runBackendTests = ({ root = repositoryRoot, platform = process.platform } = {}) => {
  const executable = resolveBackendPython(root, platform);
  return runIsolatedBackendTestProcess({ executable, root });
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = runBackendTests();
}
