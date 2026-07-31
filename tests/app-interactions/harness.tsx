import React, { useEffect, useMemo, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { ConfigProvider, Button, Space } from '@arco-design/web-react';
import '@arco-design/web-react/dist/css/arco.css';
import '../../src/styles.css';
import '../../src/layout-guardrails.css';
import './harness.css';
import { SkillFactoryDashboard } from '../../components/SkillFactoryDashboard';
import { BlogFormatDashboard } from '../../components/BlogFormatDashboard';
import { SetupWizard } from '../../components/SetupWizard';
import { AppDialogHost } from '../../components/AppDialogHost';
import { defaultBulkBlogFormat, defaultBlogFrameworkStandard, defaultBlogFrameworks } from '../../services/clientProfileService';
import App from '../../App';

const theme = { cardBg: 'bg-white', cardBorder: 'border-slate-200', heading: 'text-slate-950', subText: 'text-slate-600', inputBg: 'bg-white', inputBorder: 'border-slate-200' };
const bulkBlogFormat = { ...defaultBulkBlogFormat(), status: 'configured' as const, version: 2 };
const blogFrameworkStandard = defaultBlogFrameworkStandard();
const activeProfile = {
  id: 'test-site', name: '测试站点', siteName: '测试站点', siteUrl: 'https://example.test', brandName: 'Test', active: true,
  settings: {}, secretRefs: {}, knowledgeSources: [], knowledgeArtifacts: [], rulePack: { version: 0, fieldRules: {}, taskContexts: {}, sourceArtifactIds: [], status: 'draft', updatedAt: '' },
  generationSessions: [], templatePack: {}, skillPacks: [], activeSkillPackId: '', styleKit: {}, blogFrameworks: defaultBlogFrameworks(), blogFrameworkStandard, bulkBlogFormat,
  faqs: [], internalLinkSettings: { enabled: true, intervalDays: 7, includeTypes: [], excludePatterns: [], lastRunAt: '', lastRunStatus: '', lastError: '' }, linkIndex: [], linkIndexItems: [],
} as any;

const Harness = () => {
  const appMode = useMemo(() => new URLSearchParams(window.location.search).get('app') === '1', []);
  const setupMode = useMemo(() => new URLSearchParams(window.location.search).get('setup') === '1', []);
  const [view, setView] = useState<'knowledge' | 'repair'>('knowledge');
  const [initialSection, setInitialSection] = useState<any>('company');
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const dark = params.get('theme') === 'dark';
    const scale = Math.max(1, Math.min(1.5, Number(params.get('scale') || 1)));
    document.documentElement.classList.toggle('dark', dark);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    document.documentElement.style.fontSize = `${16 * scale}px`;
    document.body.dataset.layoutReady = 'true';
  }, []);
  if (appMode) return <ConfigProvider><App /></ConfigProvider>;
  if (setupMode) return <ConfigProvider><SetupWizard
    settings={{ aiProvider: 'gemini', backendUrl: '/api', secretRefs: {} } as any}
    setupStatus={{ registered: true, setupComplete: false, siteCreated: true, checks: [] }}
    knowledgeSources={[]}
    seoProbe={null}
    loading={false}
    busy={false}
    siteBusy={false}
    backendReady
    backendStarting={false}
    backendRestarting={false}
    knowledgeBusy={false}
    seoBusy={false}
    notice=""
    error=""
    theme={{ ...theme, bg: 'bg-white', text: 'text-slate-900' }}
    onSave={async () => undefined}
    onCreateSite={async () => ({ id: 'test-site' } as any)}
    onRestartBackend={async () => undefined}
    onSkip={() => undefined}
    onContinue={() => undefined}
    onUploadKnowledge={async files => {
      const form = new FormData();
      files.forEach(file => form.append('files', file, file.name));
      await fetch('/api/knowledge/import', { method: 'POST', body: form });
    }}
    onProbeSeo={async () => undefined}
  /></ConfigProvider>;
  return <ConfigProvider><div className="interaction-harness">
    <div className="p-3"><Space><Button data-testid="show-knowledge" onClick={() => setView('knowledge')}>站点资料库</Button><Button data-testid="show-repair" onClick={() => setView('repair')}>批量修复</Button></Space></div>
    <main data-layout-root>{view === 'knowledge' ? <SkillFactoryDashboard theme={theme} backendUrl="/api" activeProfile={activeProfile} initialSection={initialSection} onRefreshProfiles={() => undefined} /> :
      <BlogFormatDashboard theme={theme} siteId="test-site" siteName="测试站点" bulkBlogFormat={bulkBlogFormat} onOpenFormatSettings={() => { setInitialSection('bulkBlogFormat'); setView('knowledge'); }} />}</main>
    <AppDialogHost />
  </div></ConfigProvider>;
};

ReactDOM.createRoot(document.getElementById('root')!).render(<Harness />);
