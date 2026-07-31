import React, { useEffect, useMemo, useState } from 'react';
import { formatUserFacingError } from '../services/errorLogService';
import {
  Alert as ArcoAlert,
  Button as ArcoButton,
  Collapse as ArcoCollapse,
  Input as ArcoInput,
  Tag as ArcoTag,
} from '@arco-design/web-react';
import {
  BlogFormatStandard,
  BlogFormatStandardChange,
  BlogFormatToken,
  BlogFormatTokenKey,
  defaultBlogFormatStandard,
  reviseBlogFormatStandard,
  saveBlogFormatStandard,
  scanBlogFormatStandard,
} from '../services/clientProfileService';
import { IconCheck, IconRefresh, IconSparkles } from './Icons';
import { ActionGroup, OverflowText, Toolbar } from './ui';

type Theme = {
  cardBg: string;
  cardBorder: string;
  heading: string;
  subText: string;
  inputBg: string;
  inputBorder: string;
};

type ConversationItem = { role: 'user' | 'assistant'; content: string };

interface BlogFormatStandardWorkbenchProps {
  profileId: string;
  backendUrl?: string;
  initialStandard?: BlogFormatStandard;
  theme: Theme;
  onSaved?: (standard: BlogFormatStandard) => Promise<void> | void;
}

const TOKEN_LABELS: Partial<Record<BlogFormatTokenKey, string>> = {
  contentMaxWidth: '正文宽度',
  bodyFontFamily: '正文字体',
  headingFontFamily: '标题字体',
  bodyFontSizeDesktop: '正文桌面字号',
  bodyFontSizeMobile: '正文移动字号',
  bodyLineHeight: '正文行高',
  h2FontSizeDesktop: 'H2 桌面字号',
  h3FontSizeDesktop: 'H3 桌面字号',
  paragraphSpacing: '段落间距',
  linkColor: '链接颜色',
  tableHeaderBg: '表头背景',
  tableHeaderText: '表头文字',
  tableBorderColor: '表格边框',
  tableCellPadding: '表格内边距',
  imageRadius: '图片圆角',
  ctaBg: 'CTA 背景',
  ctaText: 'CTA 文字',
};

const safeCssText = (value: unknown, fallback: string) => {
  const clean = String(value ?? '').replace(/[;{}<>]/g, '').trim();
  return clean || fallback;
};

const numericToken = (standard: BlogFormatStandard, key: BlogFormatTokenKey, fallback: number) => {
  const value = Number(standard.tokens[key]?.value);
  return Number.isFinite(value) ? value : fallback;
};

const buildStandardPreviewDoc = (standard: BlogFormatStandard, showChangeMarkers: boolean) => {
  const token = standard.tokens;
  const bodyFont = safeCssText(token.bodyFontFamily?.value, 'Arial, sans-serif');
  const headingFont = safeCssText(token.headingFontFamily?.value, bodyFont);
  const textColor = safeCssText(token.textColor?.value, '#334155');
  const linkColor = safeCssText(token.linkColor?.value, '#1476d8');
  const tableHeaderBg = safeCssText(token.tableHeaderBg?.value, '#12344d');
  const tableHeaderText = safeCssText(token.tableHeaderText?.value, '#ffffff');
  const tableBorder = safeCssText(token.tableBorderColor?.value, '#dbe5ec');
  const ctaBg = safeCssText(token.ctaBg?.value, '#e8f3ff');
  const ctaText = safeCssText(token.ctaText?.value, '#172033');
  const marker = showChangeMarkers ? 'outline:2px solid #93c5fd;outline-offset:4px;' : '';
  return `<!doctype html><html><head><meta charset="utf-8"/><style>
    *{box-sizing:border-box}body{margin:0;padding:28px;background:#fff;color:${textColor};font-family:${bodyFont};font-size:${numericToken(standard, 'bodyFontSizeDesktop', 17)}px;line-height:${numericToken(standard, 'bodyLineHeight', 1.72)}}
    article{max-width:${numericToken(standard, 'contentMaxWidth', 820)}px;margin:0 auto}h1,h2,h3{font-family:${headingFont};color:${textColor}}
    h1{font-size:36px;line-height:1.2;margin:0 0 18px}h2{font-size:${numericToken(standard, 'h2FontSizeDesktop', 32)}px;line-height:1.25;margin:38px 0 14px;${marker}}
    h3{font-size:${numericToken(standard, 'h3FontSizeDesktop', 23)}px;line-height:1.35;margin:28px 0 10px}p{margin:0 0 ${numericToken(standard, 'paragraphSpacing', 18)}px}a{color:${linkColor}}
    .lead{font-size:1.05em;color:#526071}.quick{border-left:4px solid ${linkColor};background:#f8fafc;padding:16px 18px;margin:22px 0;${marker}}
    table{width:100%;border-collapse:collapse;margin:24px 0;font-size:.92em}th{background:${tableHeaderBg};color:${tableHeaderText};text-align:left}th,td{border:1px solid ${tableBorder};padding:${numericToken(standard, 'tableCellPadding', 14)}px}
    .cta{background:${ctaBg};color:${ctaText};border-radius:10px;padding:20px;margin-top:32px;${marker}}.cta strong{display:block;margin-bottom:8px}
    img{max-width:100%;border-radius:${numericToken(standard, 'imageRadius', 8)}px}
  </style></head><body><article>
    <h1>A Practical Guide to Planning a Community Workshop</h1>
    <p class="lead">This preview uses the active site's Blog format draft. It is not written to WordPress until a repair preview is confirmed.</p>
    <div class="quick"><strong>Quick answer</strong><p>Start with the application, installation method, refill workflow, and maintenance requirements before comparing models.</p></div>
    <h2>What readers should consider first</h2>
    <p>Clear headings, readable body copy, useful tables, and specific calls to action make a long article easier to scan and edit.</p>
    <h3>Project-fit checklist</h3>
    <table><thead><tr><th>Reader question</th><th>What to verify</th></tr></thead><tbody><tr><td>Audience</td><td>Experience level, goals, and accessibility needs</td></tr><tr><td>Format</td><td>Session length, materials, and venue constraints</td></tr></tbody></table>
    <div class="cta"><strong>Need help choosing a suitable model?</strong><span>Share the project context and quantity for a focused recommendation.</span></div>
  </article></body></html>`;
};

export const BlogFormatStandardWorkbench: React.FC<BlogFormatStandardWorkbenchProps> = ({
  profileId,
  backendUrl = '/api',
  initialStandard,
  theme,
  onSaved,
}) => {
  const [original, setOriginal] = useState<BlogFormatStandard>(initialStandard || defaultBlogFormatStandard());
  const [draft, setDraft] = useState<BlogFormatStandard>(initialStandard || defaultBlogFormatStandard());
  const [diagnosis, setDiagnosis] = useState<string[]>([]);
  const [changes, setChanges] = useState<BlogFormatStandardChange[]>([]);
  const [conversation, setConversation] = useState<ConversationItem[]>([]);
  const [message, setMessage] = useState('');
  const [previewMode, setPreviewMode] = useState<'original' | 'draft'>('draft');
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const tokenValues = Object.values(draft.tokens) as BlogFormatToken[];
  const managedCount = tokenValues.filter(item => item.mode === 'managed').length;
  const inheritedCount = tokenValues.length - managedCount;
  const previewDoc = useMemo(
    () => buildStandardPreviewDoc(previewMode === 'original' ? original : draft, previewMode === 'draft' && changes.length > 0),
    [changes.length, draft, original, previewMode],
  );

  const runScan = async (refresh: boolean) => {
    if (!profileId) return;
    setBusy(refresh ? 'refresh' : 'scan');
    setError('');
    try {
      const result = await scanBlogFormatStandard(profileId, refresh, backendUrl);
      setOriginal(result.standard);
      setDraft(result.standard);
      setDiagnosis(result.diagnosis);
      setChanges([]);
      setConversation([]);
      setNotice(result.warnings[0] || '已读取当前网站与保存的博客格式；现在可以直接告诉 AI 怎样调整。');
    } catch (err: any) {
      setError(formatUserFacingError(err, '博客标准化'));
    } finally {
      setBusy('');
    }
  };

  useEffect(() => {
    void runScan(false);
  }, [profileId]);

  const submitFeedback = async () => {
    const cleanMessage = message.trim();
    if (!cleanMessage || !profileId) return;
    setBusy('assistant');
    setError('');
    try {
      const result = await reviseBlogFormatStandard(profileId, cleanMessage, draft, conversation, backendUrl);
      setDraft(result.standard);
      setChanges(prev => [...prev, ...result.changes]);
      setConversation(prev => [...prev, { role: 'user', content: cleanMessage }, { role: 'assistant', content: result.reply }]);
      setMessage('');
      setPreviewMode('draft');
      setNotice(result.reply);
    } catch (err: any) {
      setError(formatUserFacingError(err, '博客标准化'));
    } finally {
      setBusy('');
    }
  };

  const saveStandard = async () => {
    if (!profileId) return;
    setBusy('save');
    setError('');
    try {
      const saved = await saveBlogFormatStandard(profileId, draft, backendUrl);
      setDraft(saved);
      setOriginal(saved);
      setChanges([]);
      setNotice(`博客格式标准 v${saved.version} 已保存；历史文章尚未修改。`);
      await onSaved?.(saved);
    } catch (err: any) {
      setError(formatUserFacingError(err, '博客标准化'));
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="blog-format-standard-workbench min-w-0 space-y-4" data-testid="blog-format-standard-workbench">
      <Toolbar
        start={(
          <div className="min-w-0">
            <h3 className={`flex min-w-0 items-center gap-2 text-base font-bold ${theme.heading}`}><IconSparkles className="size-4 shrink-0" /> AI 格式工作台</h3>
            <OverflowText mode="wrap" className={`mt-1 text-xs ${theme.subText}`}>读取现有博客格式，用自然语言调整草稿；保存标准不会自动修改历史文章。</OverflowText>
          </div>
        )}
        actions={(
          <ActionGroup minItemWidth={132}>
            <ArcoButton icon={<IconRefresh />} loading={busy === 'refresh'} onClick={() => void runScan(true)}>重新读取网站格式</ArcoButton>
            <ArcoButton type="primary" icon={<IconCheck />} loading={busy === 'save'} disabled={Boolean(busy) || draft.status !== 'draft'} onClick={() => void saveStandard()}>保存为博客标准</ArcoButton>
          </ActionGroup>
        )}
      />

      {(error || notice) && <ArcoAlert showIcon type={error ? 'error' : 'info'} content={error || notice} />}

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(300px,0.72fr)_minmax(0,1.28fr)]">
        <section className={`min-w-0 rounded-lg border p-4 ${theme.cardBorder} ${theme.cardBg}`}>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <ArcoTag color="arcoblue">继承 {inheritedCount}</ArcoTag>
            <ArcoTag color="green">AI 管理 {managedCount}</ArcoTag>
            <ArcoTag>{draft.source.confidence || 'fallback'}</ArcoTag>
          </div>

          <div className="mt-4 min-w-0">
            <div className={`text-sm font-bold ${theme.heading}`}>当前格式诊断</div>
            <ul className={`mt-2 space-y-2 pl-5 text-sm leading-6 ${theme.subText}`}>
              {(diagnosis.length ? diagnosis : ['正在读取当前格式…']).map(item => <li key={item}>{item}</li>)}
            </ul>
          </div>

          <div className="mt-4 min-w-0 space-y-2" data-overflow-policy="y-scroll">
            {conversation.map((item, index) => (
              <div key={`${item.role}-${index}`} className={`min-w-0 rounded-lg p-3 text-sm leading-6 ${item.role === 'user' ? 'bg-blue-50 text-blue-950 dark:bg-blue-950/40 dark:text-blue-100' : 'bg-slate-50 text-slate-700 dark:bg-slate-800 dark:text-slate-200'}`}>
                <OverflowText mode="break-anywhere">{item.content}</OverflowText>
              </div>
            ))}
          </div>

          <div className="ui-prompt-stack mt-4 min-w-0">
            <ArcoInput.TextArea
              value={message}
              onChange={setMessage}
              autoSize={{ minRows: 3, maxRows: 6 }}
              placeholder="例如：正文大一点，标题不要太夸张，表格更简洁，整体更专业。"
              disabled={Boolean(busy)}
            />
            <ArcoButton long type="primary" icon={<IconSparkles />} loading={busy === 'assistant'} disabled={!message.trim() || Boolean(busy)} onClick={() => void submitFeedback()}>
              让 AI 调整格式草稿
            </ArcoButton>
          </div>
        </section>

        <section className={`min-w-0 rounded-lg border p-4 ${theme.cardBorder} ${theme.cardBg}`}>
          <Toolbar
            start={<div className={`min-w-0 text-sm font-bold ${theme.heading}`}>真实效果预览</div>}
            actions={(
              <ActionGroup minItemWidth={92}>
                <ArcoButton type={previewMode === 'original' ? 'primary' : 'secondary'} onClick={() => setPreviewMode('original')}>原格式</ArcoButton>
                <ArcoButton type={previewMode === 'draft' ? 'primary' : 'secondary'} onClick={() => setPreviewMode('draft')}>新格式</ArcoButton>
              </ActionGroup>
            )}
          />
          <iframe
            title={previewMode === 'original' ? '原格式预览' : '新格式预览'}
            srcDoc={previewDoc}
            sandbox=""
            className="mt-3 min-h-[460px] w-full rounded-lg border border-slate-200 bg-white"
            data-overflow-policy="y-scroll"
          />
          <div className="mt-3 min-w-0">
            <div className={`text-sm font-bold ${theme.heading}`}>改动清单</div>
            {changes.length ? (
              <div className="mt-2 grid min-w-0 gap-2 sm:grid-cols-2">
                {changes.map((change, index) => (
                  <div key={`${change.token}-${index}`} className={`min-w-0 rounded-md border p-3 text-xs ${theme.cardBorder}`}>
                    <OverflowText mode="wrap" className={`font-semibold ${theme.heading}`}>{change.label}</OverflowText>
                    <OverflowText mode="break-anywhere" className={`mt-1 ${theme.subText}`}>{String(change.before)} → {String(change.after)}</OverflowText>
                  </div>
                ))}
              </div>
            ) : <div className={`mt-2 text-xs ${theme.subText}`}>尚未修改；先告诉 AI 你对当前格式哪里不满意。</div>}
          </div>
        </section>
      </div>

      <ArcoCollapse bordered={false}>
        <ArcoCollapse.Item name="advanced" header="高级设置">
          <div className="grid min-w-0 gap-2 md:grid-cols-2 xl:grid-cols-3">
            {(Object.entries(draft.tokens) as Array<[BlogFormatTokenKey, BlogFormatStandard['tokens'][BlogFormatTokenKey]]>).map(([key, token]) => (
              <div key={key} className={`min-w-0 rounded-md border p-3 ${theme.cardBorder}`}>
                <div className="flex min-w-0 items-center justify-between gap-2">
                  <OverflowText mode="wrap" className={`text-xs font-semibold ${theme.heading}`}>{TOKEN_LABELS[key] || key}</OverflowText>
                  <ArcoTag color={token.mode === 'managed' ? 'green' : 'gray'}>{token.mode === 'managed' ? 'AI 管理' : '继承'}</ArcoTag>
                </div>
                <OverflowText mode="break-anywhere" className={`mt-2 text-xs ${theme.subText}`}>{String(token.value)}</OverflowText>
              </div>
            ))}
          </div>
        </ArcoCollapse.Item>
      </ArcoCollapse>
    </div>
  );
};

export default BlogFormatStandardWorkbench;
