import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const settings = {
  googleApiKey: '',
  aiProvider: 'gemini' as const,
  googleCloudProject: '',
  googleCloudLocation: 'global',
  googleApplicationCredentials: '',
  wpUrl: '',
  wpUser: '',
  wpAppPass: '',
  cloudflareBypassHeaderName: '',
  cloudflareBypassHeaderValue: '',
  wcConsumerKey: '',
  wcConsumerSecret: '',
  sftpHost: '',
  sftpPort: 22,
  sftpUser: '',
  sftpPass: '',
  remoteWpRoot: '',
  useProxy: true,
  backendUrl: '/api',
  gscSiteUrl: '',
  gscServiceAccountJson: '',
  productAutoScanEnabled: false,
  productAutoScanStaleDays: 7,
  productAutoScanCheckMinutes: 60,
  seoHealthAutoScanEnabled: true,
  seoHealthAutoScanTime: '18:00',
  seoHealthAutoScanTimezone: 'Asia/Shanghai',
  seoHealthAutoScanLastRunAt: '',
  seoHealthAutoScanLastRunStatus: '',
  seoHealthAutoScanLastError: '',
  secretRefs: {},
};

const theme = {
  bg: 'bg-white',
  text: 'text-slate-900',
  subText: 'text-slate-500',
  heading: 'text-slate-950',
  cardBg: 'bg-white',
  cardBorder: 'border-slate-200',
  inputBg: 'bg-white',
  inputBorder: 'border-slate-300',
};

const baseProps = {
  settings,
  knowledgeSources: [],
  seoProbe: null,
  loading: false,
  busy: false,
  siteBusy: false,
  backendReady: true,
  backendStarting: false,
  backendRestarting: false,
  knowledgeBusy: false,
  seoBusy: false,
  notice: '',
  error: '',
  theme,
  onSave: async () => {},
  onCreateSite: async () => ({ id: 'new-site', siteName: 'New Site' }),
  onRestartBackend: async () => {},
  onSkip: () => {},
  onContinue: () => {},
  onUploadKnowledge: async () => {},
  onProbeSeo: async () => {},
};

test('setup wizard starts with site creation and a clear direct-entry choice', async () => {
  const { SetupWizard } = await import('../../components/SetupWizard.tsx');

  const html = renderToStaticMarkup(React.createElement(SetupWizard, {
    ...baseProps,
    setupStatus: {
      registered: true,
      setupComplete: false,
      siteCreated: false,
      checks: [
        { key: 'ai', ok: false, label: 'AI', detail: '需要填写 Gemini API Key。' },
        { key: 'wordpress', ok: false, label: 'WordPress', detail: '需要填写 WordPress URL、用户名和应用密码。' },
      ],
    },
  }));

  assert.match(html, /data-testid="setup-wizard"/);
  assert.match(html, /data-testid="setup-site-step"/);
  assert.match(html, /第 1 步：创建站点/);
  assert.match(html, /data-testid="setup-site-name"/);
  assert.match(html, /data-testid="setup-site-url"/);
  assert.match(html, /data-testid="setup-create-site"/);
  assert.match(html, /直接进入工作台/);
  assert.match(html, /以后可在“设置 → 站点管理”创建/);
  assert.doesNotMatch(html, /data-testid="setup-wp-url"/);
});

test('setup wizard treats initial desktop backend boot as automatic startup, not a manual restart failure', async () => {
  const { SetupWizard } = await import('../../components/SetupWizard.tsx');
  const html = renderToStaticMarkup(React.createElement(SetupWizard, {
    ...baseProps,
    backendReady: false,
    backendStarting: true,
    setupStatus: {
      registered: true,
      setupComplete: false,
      siteCreated: false,
      checks: [],
    },
  }));

  assert.match(html, /后端正在自动启动/);
  assert.match(html, /正在准备创建功能/);
  assert.doesNotMatch(html, /data-testid="setup-restart-backend"/);
  assert.doesNotMatch(html, />后端未连接</);
});

test('setup wizard shows optional connections after a site exists', async () => {
  const { SetupWizard } = await import('../../components/SetupWizard.tsx');
  const html = renderToStaticMarkup(React.createElement(SetupWizard, {
    ...baseProps,
    setupStatus: {
      registered: true,
      setupComplete: false,
      siteCreated: true,
      checks: [
        { key: 'ai', ok: false, label: 'AI', detail: '需要填写 Gemini API Key。' },
        { key: 'wordpress', ok: false, label: 'WordPress', detail: '需要填写 WordPress URL。' },
      ],
    },
  }));

  assert.match(html, /data-testid="setup-connections-step"/);
  assert.match(html, /第 2 步：可选连接/);
  assert.match(html, /data-testid="setup-wp-url"/);
  assert.match(html, /WooCommerce REST API/);
  assert.match(html, /保存连接并进入工作台/);
  assert.match(html, /暂不配置，进入工作台/);
});

test('setup wizard knowledge upload keeps text and action from crowding', () => {
  const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
  const rule = (selector: string) => {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const matches = Array.from(css.matchAll(new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\n\\}`, 'g')));
    assert.ok(matches.length, `Missing CSS rule for ${selector}`);
    return matches.map(match => match[1]).join('\n');
  };

  assert.match(rule('.setup-knowledge-upload-button.arco-btn'), /grid-template-areas:\s*"icon text"\s*"icon cta"/);
  assert.match(rule('.setup-knowledge-upload-title'), /white-space:\s*normal/);
  assert.match(rule('.setup-knowledge-upload-meta'), /white-space:\s*normal/);
  assert.doesNotMatch(rule('.setup-knowledge-upload-title'), /text-overflow:\s*ellipsis/);
  assert.doesNotMatch(rule('.setup-knowledge-upload-meta'), /text-overflow:\s*ellipsis/);
});

test('setup and settings reuse the design-system site creation form', () => {
  const setupSource = readFileSync(new URL('../../components/SetupWizard.tsx', import.meta.url), 'utf8');
  const appSource = readFileSync(new URL('../../App.tsx', import.meta.url), 'utf8');
  const formSource = readFileSync(new URL('../../components/SiteCreationForm.tsx', import.meta.url), 'utf8');

  assert.match(setupSource, /<SiteCreationForm/);
  assert.match(appSource, /<SiteCreationForm/);
  for (const sharedComponent of ['Panel', 'Field', 'OverflowText', 'ActionGroup', 'StatusPill']) {
    assert.match(formSource, new RegExp(`\\b${sharedComponent}\\b`));
  }
  assert.match(formSource, /backendReady/);
  assert.match(formSource, /onRestartBackend/);
  assert.doesNotMatch(setupSource, /data-testid="setup-create-site"[\s\S]{0,220}<\/ArcoButton>/);
  assert.doesNotMatch(appSource, /data-testid="settings-create-site-button"[\s\S]{0,220}<\/ArcoButton>/);
});
