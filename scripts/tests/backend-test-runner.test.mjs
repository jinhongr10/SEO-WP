import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import * as backendTestRunner from '../run-backend-tests.mjs';

const {
  backendPythonCandidates,
  resolveBackendPython,
} = backendTestRunner;

test('backend test runner selects the virtualenv Python for each desktop platform', () => {
  const root = path.join(process.cwd(), 'repo');
  assert.equal(backendPythonCandidates(root, 'win32')[0], path.join(root, '.venv', 'Scripts', 'python.exe'));
  assert.equal(backendPythonCandidates(root, 'darwin')[0], path.join(root, '.venv', 'bin', 'python'));
  assert.equal(
    resolveBackendPython(root, 'win32', candidate => candidate.endsWith('python.exe')),
    path.join(root, '.venv', 'Scripts', 'python.exe'),
  );
});

test('backend test runner builds an isolated environment without inherited service credentials', () => {
  assert.equal(typeof backendTestRunner.buildBackendTestEnvironment, 'function');

  const temporaryRoot = path.join(process.cwd(), 'backend-test-run-123');
  const environment = backendTestRunner.buildBackendTestEnvironment({
    APPDATA: 'C:\\Users\\Ada\\AppData\\Roaming',
    GEMINI_API_KEY: 'saved-gemini-key',
    WP_BASE_URL: 'https://wordpress.example',
    SETTINGS_FILE: 'C:\\Users\\Ada\\AppData\\Roaming\\SeoWpSync\\settings.json',
    CLIENT_PROFILES_FILE: 'C:\\Users\\Ada\\AppData\\Roaming\\SeoWpSync\\client_profiles.json',
    SITE_DATA_DIR: 'C:\\Users\\Ada\\AppData\\Roaming\\SeoWpSync\\sites',
    CLOUDSDK_CONFIG: 'C:\\Users\\Ada\\AppData\\Roaming\\gcloud',
    GOOGLE_APPLICATION_CREDENTIALS: 'C:\\Users\\Ada\\credentials.json',
    UNRELATED_SETTING: 'preserved',
  }, temporaryRoot);

  assert.equal(environment.SEO_WP_SYNC_DATA_DIR, path.join(temporaryRoot, 'data'));
  assert.equal(environment.SEO_WP_SYNC_LOG_DIR, path.join(temporaryRoot, 'logs'));
  assert.equal(environment.SEO_WP_SYNC_CACHE_DIR, path.join(temporaryRoot, 'cache'));
  assert.equal(environment.CLOUDSDK_CONFIG, path.join(temporaryRoot, 'gcloud'));
  assert.equal(environment.SEO_WP_SYNC_LOAD_PROJECT_DOTENV, 'false');
  assert.equal(environment.PYTHONUTF8, '1');
  assert.equal(environment.PYTHONIOENCODING, 'utf-8');
  assert.equal(environment.GEMINI_API_KEY, '');
  assert.equal(environment.WP_BASE_URL, '');
  assert.equal(environment.UNRELATED_SETTING, 'preserved');

  for (const key of [
    'GOOGLE_GENAI_USE_VERTEXAI',
    'GOOGLE_CLOUD_PROJECT',
    'GOOGLE_PROJECT_ID',
    'GOOGLE_CLOUD_LOCATION',
    'GOOGLE_APPLICATION_CREDENTIALS',
    'GOOGLE_API_KEY',
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
  ]) {
    assert.equal(environment[key], '', `${key} must be blanked for backend tests`);
  }
});

test('desktop backend forces UTF-8 output for Windows logs and diagnostics', () => {
  const source = readFileSync(new URL('../../desktop/main.cjs', import.meta.url), 'utf8');
  assert.match(source, /PYTHONUTF8:\s*'1'/);
  assert.match(source, /PYTHONIOENCODING:\s*'utf-8'/);
});

const runWithControlledDependencies = (overrides = {}) => {
  assert.equal(typeof backendTestRunner.runIsolatedBackendTestProcess, 'function');
  const calls = { directories: [], removed: [], spawns: [] };
  const temporaryRoot = path.join(process.cwd(), 'backend-runner-cleanup');
  const dependencies = {
    makeTemporaryDirectory: () => temporaryRoot,
    makeDirectory: directory => calls.directories.push(directory),
    removeDirectory: directory => calls.removed.push(directory),
    spawn: (...args) => {
      calls.spawns.push(args);
      return { status: 0 };
    },
    ...overrides,
  };
  const options = {
    executable: path.join(process.cwd(), 'fake-python'),
    root: path.join(process.cwd(), 'fake-root'),
    baseEnvironment: {},
  };
  return { calls, temporaryRoot, dependencies, options };
};

test('backend test runner removes its temporary root after normal and nonzero child exits', () => {
  for (const status of [0, 17]) {
    const { calls, temporaryRoot, dependencies, options } = runWithControlledDependencies();
    dependencies.spawn = (...args) => {
      calls.spawns.push(args);
      return { status };
    };

    assert.equal(backendTestRunner.runIsolatedBackendTestProcess(options, dependencies), status);
    assert.deepEqual(calls.directories, [
      path.join(temporaryRoot, 'data'),
      path.join(temporaryRoot, 'logs'),
      path.join(temporaryRoot, 'cache'),
    ]);
    assert.deepEqual(calls.removed, [temporaryRoot]);
    assert.equal(calls.spawns.length, 1);
  }
});

test('backend test runner removes its temporary root after spawn and setup failures', () => {
  for (const failure of [
    { spawn: () => ({ error: new Error('spawn failed') }), expected: /spawn failed/ },
    { makeDirectory: () => { throw new Error('setup failed'); }, expected: /setup failed/ },
  ]) {
    const { calls, temporaryRoot, dependencies, options } = runWithControlledDependencies(failure);
    assert.throws(
      () => backendTestRunner.runIsolatedBackendTestProcess(options, dependencies),
      failure.expected,
    );
    assert.deepEqual(calls.removed, [temporaryRoot]);
  }
});
