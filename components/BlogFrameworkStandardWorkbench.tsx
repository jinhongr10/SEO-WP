import React, { useEffect, useMemo, useState } from 'react';
import { formatUserFacingError } from '../services/errorLogService';
import {
  Alert as ArcoAlert,
  Button as ArcoButton,
  Collapse as ArcoCollapse,
  Input as ArcoInput,
  InputNumber as ArcoInputNumber,
  Switch as ArcoSwitch,
  Tag as ArcoTag,
} from '@arco-design/web-react';
import {
  BlogFramework,
  BlogFrameworkChange,
  BlogFrameworkOutlineBlock,
  BlogFrameworkStandard,
  defaultBlogFrameworkStandard,
  fetchBlogFrameworkStandard,
  reviseBlogFrameworkStandard,
  saveBlogFrameworkStandard,
} from '../services/clientProfileService';
import { IconCheck, IconRefresh, IconSparkles } from './Icons';
import { ActionGroup, OverflowText, TabButton, TabsList, Toolbar } from './ui';

type Theme = {
  cardBg: string;
  cardBorder: string;
  heading: string;
  subText: string;
  inputBg: string;
  inputBorder: string;
};

type ConversationItem = { role: 'user' | 'assistant'; content: string };
type FrameworkMap<T> = Record<string, T>;
type UndoEntry = {
  standard: BlogFrameworkStandard;
  conversation: ConversationItem[];
  changes: BlogFrameworkChange[];
};

interface BlogFrameworkStandardWorkbenchProps {
  profileId: string;
  backendUrl?: string;
  initialStandard?: BlogFrameworkStandard;
  theme: Theme;
  onSaved?: (standard: BlogFrameworkStandard) => Promise<void> | void;
  onDirtyChange?: (dirty: boolean) => void;
}

const cloneStandard = (standard: BlogFrameworkStandard): BlogFrameworkStandard => (
  JSON.parse(JSON.stringify(standard)) as BlogFrameworkStandard
);

const replaceFramework = (
  standard: BlogFrameworkStandard,
  frameworkId: string,
  nextFramework: BlogFramework,
): BlogFrameworkStandard => ({
  ...standard,
  frameworks: standard.frameworks.map(item => item.id === frameworkId ? nextFramework : item),
});

const splitRules = (value: string): string[] => value
  .split(/\n+/)
  .map(item => item.trim())
  .filter(Boolean);

const frameworkChanged = (changes: BlogFrameworkChange[], paths: string[]) => (
  changes.some(change => paths.some(path => change.path === path || change.path.startsWith(`${path}.`)))
);

const BlueprintCard: React.FC<{
  title: string;
  detail: React.ReactNode;
  changed?: boolean;
  tone?: 'normal' | 'warning' | 'danger';
}> = ({ title, detail, changed = false, tone = 'normal' }) => (
  <div
    className={`blog-framework-blueprint-card ${changed ? 'blog-framework-blueprint-card--changed' : ''} ${tone !== 'normal' ? `blog-framework-blueprint-card--${tone}` : ''}`}
  >
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <OverflowText strategy="wrap" className="min-w-0 font-semibold">{title}</OverflowText>
      {changed && <ArcoTag color="arcoblue">AI 已修改</ArcoTag>}
    </div>
    <div className="mt-1 min-w-0 text-xs leading-5 text-slate-600 dark:text-slate-300">{detail}</div>
  </div>
);

export const BlogFrameworkStandardWorkbench: React.FC<BlogFrameworkStandardWorkbenchProps> = ({
  profileId,
  backendUrl = '/api',
  initialStandard,
  theme,
  onSaved,
  onDirtyChange,
}) => {
  const initial = initialStandard || defaultBlogFrameworkStandard();
  const [saved, setSaved] = useState<BlogFrameworkStandard>(initial);
  const [draft, setDraft] = useState<BlogFrameworkStandard>(initial);
  const [presets, setPresets] = useState<BlogFramework[]>(defaultBlogFrameworkStandard().frameworks);
  const [activeFrameworkId, setActiveFrameworkId] = useState(initial.frameworks[0]?.id || 'standard');
  const [conversationByFramework, setConversationByFramework] = useState<FrameworkMap<ConversationItem[]>>({});
  const [changesByFramework, setChangesByFramework] = useState<FrameworkMap<BlogFrameworkChange[]>>({});
  const [undoByFramework, setUndoByFramework] = useState<FrameworkMap<UndoEntry[]>>({});
  const [previewMode, setPreviewMode] = useState<'saved' | 'draft'>('draft');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const dirty = useMemo(() => JSON.stringify(saved) !== JSON.stringify(draft), [draft, saved]);
  const conversation = conversationByFramework[activeFrameworkId] || [];
  const changes = changesByFramework[activeFrameworkId] || [];
  const previewStandard = previewMode === 'saved' ? saved : draft;
  const activeFramework = previewStandard.frameworks.find(item => item.id === activeFrameworkId)
    || previewStandard.frameworks[0];
  const draftFramework = draft.frameworks.find(item => item.id === activeFrameworkId) || draft.frameworks[0];

  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);

  useEffect(() => {
    if (!profileId) return;
    let active = true;
    setBusy('load');
    setError('');
    void fetchBlogFrameworkStandard(profileId, backendUrl)
      .then(result => {
        if (!active) return;
        setSaved(result.standard);
        setDraft(cloneStandard(result.standard));
        setPresets(result.presets);
        setActiveFrameworkId(result.standard.frameworks[0]?.id || 'standard');
        setConversationByFramework({});
        setChangesByFramework({});
        setUndoByFramework({});
        setNotice(result.standard.status === 'configured'
          ? `当前站点使用框架标准 v${result.standard.version}。`
          : '当前使用 5 类系统内置框架；AI 修改并保存后才会成为站点标准。');
      })
      .catch((err: unknown) => active && setError(formatUserFacingError(err, '博客框架')))
      .finally(() => active && setBusy(''));
    return () => { active = false; };
  }, [backendUrl, profileId]);

  const patchActiveFramework = (patch: Partial<BlogFramework>) => {
    if (!draftFramework) return;
    setDraft(current => replaceFramework(current, draftFramework.id, { ...draftFramework, ...patch }));
    setPreviewMode('draft');
  };

  const submitFeedback = async () => {
    const cleanMessage = message.trim();
    if (!profileId || !draftFramework || !cleanMessage) return;
    setBusy('assistant');
    setError('');
    setUndoByFramework(current => ({
      ...current,
      [draftFramework.id]: [
        ...(current[draftFramework.id] || []),
        { standard: cloneStandard(draft), conversation: [...conversation], changes: [...changes] },
      ],
    }));
    try {
      const result = await reviseBlogFrameworkStandard(
        profileId,
        draftFramework.id,
        cleanMessage,
        draft,
        conversation,
        backendUrl,
      );
      setDraft(result.standard);
      setConversationByFramework(current => ({
        ...current,
        [draftFramework.id]: [
          ...conversation,
          { role: 'user', content: cleanMessage },
          { role: 'assistant', content: result.clarification || result.reply },
        ],
      }));
      setChangesByFramework(current => ({ ...current, [draftFramework.id]: [...changes, ...result.changes] }));
      setMessage('');
      setPreviewMode('draft');
      setNotice(result.clarification || result.reply);
    } catch (err: any) {
      setError(formatUserFacingError(err, '博客框架'));
      setUndoByFramework(current => ({ ...current, [draftFramework.id]: (current[draftFramework.id] || []).slice(0, -1) }));
    } finally {
      setBusy('');
    }
  };

  const undoLastTurn = () => {
    if (!draftFramework) return;
    const stack = undoByFramework[draftFramework.id] || [];
    const previous = stack[stack.length - 1];
    if (!previous) return;
    setDraft(previous.standard);
    setConversationByFramework(current => ({ ...current, [draftFramework.id]: previous.conversation }));
    setChangesByFramework(current => ({ ...current, [draftFramework.id]: previous.changes }));
    setUndoByFramework(current => ({ ...current, [draftFramework.id]: stack.slice(0, -1) }));
    setPreviewMode('draft');
    setNotice('已撤销当前框架的上一轮 AI 修改。');
  };

  const restorePreset = () => {
    if (!draftFramework) return;
    const preset = presets.find(item => item.id === draftFramework.id)
      || presets.find(item => item.articleType === draftFramework.articleType);
    if (!preset) return;
    const restored = { ...JSON.parse(JSON.stringify(preset)), id: draftFramework.id } as BlogFramework;
    setDraft(current => replaceFramework(current, draftFramework.id, restored));
    setChangesByFramework(current => ({
      ...current,
      [draftFramework.id]: [{
        path: 'preset', label: '恢复内置默认', before: draftFramework, after: restored, reason: '用户恢复系统内置基线',
      }],
    }));
    setPreviewMode('draft');
    setNotice('已恢复为内置默认草稿；保存前不会影响 Blog AI。');
  };

  const addCustomFramework = () => {
    const base = presets[0] || defaultBlogFrameworkStandard().frameworks[0];
    const id = `custom-${Date.now()}`;
    const custom = { ...JSON.parse(JSON.stringify(base)), id, label: '自定义博客框架', articleType: 'custom' } as BlogFramework;
    setDraft(current => ({ ...current, frameworks: [...current.frameworks, custom] }));
    setActiveFrameworkId(id);
    setPreviewMode('draft');
  };

  const saveStandard = async () => {
    if (!profileId || !dirty) return;
    setBusy('save');
    setError('');
    try {
      const result = await saveBlogFrameworkStandard(profileId, draft, backendUrl);
      setSaved(result.standard);
      setDraft(cloneStandard(result.standard));
      setPresets(result.presets);
      setChangesByFramework({});
      setUndoByFramework({});
      setNotice(`博客撰写框架标准 v${result.standard.version} 已保存；新生成的文章会使用该版本。`);
      await onSaved?.(result.standard);
    } catch (err: any) {
      setError(formatUserFacingError(err, '博客框架'));
    } finally {
      setBusy('');
    }
  };

  const patchOutlineBlock = (index: number, patch: Partial<BlogFrameworkOutlineBlock>) => {
    if (!draftFramework) return;
    patchActiveFramework({
      outlineBlocks: draftFramework.outlineBlocks.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item),
    });
  };

  if (!activeFramework || !draftFramework) {
    return <ArcoAlert showIcon type="info" content="正在读取博客撰写框架…" />;
  }

  const openingBlock = activeFramework.outlineBlocks[0];
  const bodyBlocks = activeFramework.outlineBlocks.slice(1);

  return (
    <div className="blog-framework-workbench min-w-0 space-y-4" data-testid="blog-framework-standard-workbench">
      <Toolbar
        start={(
          <div className="min-w-0">
            <h3 className={`flex min-w-0 items-center gap-2 text-base font-bold ${theme.heading}`}>
              <IconSparkles className="size-4 shrink-0" /> 博客撰写框架 AI 工作台
            </h3>
            <OverflowText strategy="wrap" className={`mt-1 text-xs ${theme.subText}`}>
              框架是一篇文章的 AI 写作施工图。先看清每个位置会生成什么，再保存为站点长期标准。
            </OverflowText>
          </div>
        )}
        actions={(
          <ActionGroup minItemWidth={128}>
            <ArcoButton icon={<IconRefresh />} onClick={restorePreset} disabled={Boolean(busy)}>恢复内置默认</ArcoButton>
            <ArcoButton type="primary" icon={<IconCheck />} loading={busy === 'save'} disabled={!dirty || Boolean(busy)} onClick={() => void saveStandard()}>
              保存为站点框架标准
            </ArcoButton>
          </ActionGroup>
        )}
      />

      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <ArcoTag color={saved.status === 'configured' ? 'green' : 'gray'}>{saved.status === 'configured' ? `已生效 v${saved.version}` : '系统默认 v0'}</ArcoTag>
        <ArcoTag color={dirty ? 'orange' : 'blue'}>{dirty ? '草稿尚未影响 Blog AI' : '当前无未保存改动'}</ArcoTag>
        <OverflowText strategy="wrap" className={`text-xs ${theme.subText}`}>{saved.name}</OverflowText>
      </div>

      {(error || notice) && <ArcoAlert showIcon type={error ? 'error' : 'info'} content={error || notice} />}

      <div className="min-w-0">
        <div className={`mb-2 text-xs font-semibold ${theme.subText}`}>文章类型</div>
        <div className="blog-framework-workbench__tab-row">
          <TabsList className="blog-framework-workbench__tabs" data-overflow-policy="x-scroll">
            {draft.frameworks.map(framework => (
              <TabButton
                key={framework.id}
                selected={activeFrameworkId === framework.id}
                onClick={() => {
                  setActiveFrameworkId(framework.id);
                  setPreviewMode('draft');
                }}
              >
                {framework.label}
              </TabButton>
            ))}
          </TabsList>
          <ActionGroup className="blog-framework-workbench__tab-action">
            <ArcoButton type="dashed" onClick={addCustomFramework}>新增自定义框架</ArcoButton>
          </ActionGroup>
        </div>
      </div>

      <div className="blog-framework-workbench__content-grid">

        <section className={`flex min-w-0 flex-col rounded-lg border p-4 ${theme.cardBorder} ${theme.cardBg}`}>
          <div className="min-w-0">
            <div className={`text-sm font-bold ${theme.heading}`}>你希望 AI 怎样写这类文章？</div>
            <OverflowText strategy="wrap" className={`mt-1 text-xs leading-5 ${theme.subText}`}>
              当前只修改“{draftFramework.label}”。例如：开头不要空话，每条建议都说明资料依据。
            </OverflowText>
          </div>
          <div className="blog-framework-workbench__conversation mt-3 min-w-0 space-y-2" data-overflow-policy="y-scroll">
            {conversation.length ? conversation.map((item, index) => (
              <div key={`${item.role}-${index}`} className={`min-w-0 rounded-lg p-3 text-sm leading-6 ${item.role === 'user' ? 'bg-blue-50 text-blue-950 dark:bg-blue-950/40 dark:text-blue-100' : 'bg-slate-50 text-slate-700 dark:bg-slate-800 dark:text-slate-200'}`}>
                <OverflowText strategy="break-anywhere">{item.content}</OverflowText>
              </div>
            )) : (
              <div className={`rounded-lg bg-slate-50 p-3 text-xs leading-5 dark:bg-white/[0.04] ${theme.subText}`}>
                当前框架会按照右侧施工图生成文章。直接描述你希望增加、删减或收紧的规则。
              </div>
            )}
          </div>
          <div className="ui-prompt-stack mt-auto min-w-0 pt-3">
            <ArcoInput.TextArea
              value={message}
              onChange={setMessage}
              autoSize={{ minRows: 3, maxRows: 6 }}
              maxLength={1200}
              showWordLimit
              placeholder="例如：开头直接回答；有真实参数时增加型号对比表；FAQ 只能用已审核答案。"
              disabled={Boolean(busy)}
            />
            <ActionGroup minItemWidth={116}>
              <ArcoButton disabled={!(undoByFramework[draftFramework.id] || []).length || Boolean(busy)} onClick={undoLastTurn}>撤销本轮</ArcoButton>
              <ArcoButton type="primary" icon={<IconSparkles />} loading={busy === 'assistant'} disabled={!message.trim() || Boolean(busy)} onClick={() => void submitFeedback()}>
                让 AI 修改当前框架
              </ArcoButton>
            </ActionGroup>
          </div>
        </section>

        <section className={`min-w-0 rounded-lg border p-4 ${theme.cardBorder} ${theme.cardBg}`}>
          <Toolbar
            start={(
              <div className="min-w-0">
                <div className={`text-sm font-bold ${theme.heading}`}>AI 最终按这张施工图生成文章</div>
                <OverflowText strategy="wrap" className={`mt-1 text-xs ${theme.subText}`}>{activeFramework.label}</OverflowText>
              </div>
            )}
            actions={(
              <ActionGroup minItemWidth={92}>
                <ArcoButton type={previewMode === 'saved' ? 'primary' : 'secondary'} onClick={() => setPreviewMode('saved')}>已保存框架</ArcoButton>
                <ArcoButton type={previewMode === 'draft' ? 'primary' : 'secondary'} onClick={() => setPreviewMode('draft')}>AI 修改后</ArcoButton>
              </ActionGroup>
            )}
          />
          <div className="blog-framework-workbench__blueprint mt-3 min-w-0 space-y-2" data-overflow-policy="y-scroll">
            <BlueprintCard
              title="文章任务"
              changed={frameworkChanged(changes, ['contentGoal', 'funnelStage', 'defaultLanguage', 'targetAudience', 'wordCount'])}
              detail={`${activeFramework.contentGoal} · ${activeFramework.funnelStage} · ${activeFramework.defaultLanguage} · ${activeFramework.targetAudience} · 建议 ${activeFramework.wordCount.min}-${activeFramework.wordCount.max} 词`}
            />
            <BlueprintCard
              title="生成前必须提供"
              tone="warning"
              changed={frameworkChanged(changes, ['requiredInputs', 'evidenceRules'])}
              detail={<><div>{activeFramework.requiredInputs.join('、') || '主题与目标读者'}</div><div className="mt-1">{activeFramework.evidenceRules.join('；')}</div></>}
            />
            <BlueprintCard title="文章标题 H1" changed={frameworkChanged(changes, ['seoRules'])} detail={activeFramework.seoRules} />
            <BlueprintCard
              title="开头：直接回答"
              changed={frameworkChanged(changes, ['outlineBlocks', 'voiceRules'])}
              detail={openingBlock ? `${openingBlock.intent} ${openingBlock.contentRules}` : '先给出可执行结论，再说明适用场景和文章范围。'}
            />
            {bodyBlocks.map((block, index) => (
              <BlueprintCard
                key={`${block.heading}-${index}`}
                title={`H2/H3：${block.heading}${block.required ? ' · 必须' : ' · 条件生成'}`}
                changed={frameworkChanged(changes, ['outlineBlocks'])}
                detail={`${block.intent} ${block.contentRules}`}
              />
            ))}
            <BlueprintCard title="型号或方案对比表 · 有真实数据才生成" changed={frameworkChanged(changes, ['evidenceRules'])} detail="只比较可验证的同类参数；资料不足时跳过，不生成空表或推测值。" />
            <BlueprintCard title="步骤或检查清单" changed={frameworkChanged(changes, ['outlineBlocks'])} detail="在主题适合时，把判断标准转换为读者可执行的步骤。" />
            <BlueprintCard title="FAQ" changed={frameworkChanged(changes, ['faqRules'])} detail={activeFramework.faqRules} />
            <BlueprintCard title="图片与内链" changed={frameworkChanged(changes, ['mediaRules', 'internalLinkRules'])} detail={`${activeFramework.mediaRules} ${activeFramework.internalLinkRules}`} />
            <BlueprintCard title="结尾 CTA" changed={frameworkChanged(changes, ['ctaRules'])} detail={activeFramework.ctaRules} />
            <BlueprintCard title="语气与可读性" changed={frameworkChanged(changes, ['voiceRules'])} detail={activeFramework.voiceRules.join('；')} />
            <BlueprintCard title="发布前检查" tone="warning" changed={frameworkChanged(changes, ['preflightChecks'])} detail={activeFramework.preflightChecks.join('；')} />
            <BlueprintCard title="禁止编造" tone="danger" changed={frameworkChanged(changes, ['prohibitedClaims'])} detail={activeFramework.prohibitedClaims.join('；')} />
          </div>
          <div className="mt-3 min-w-0">
            <div className={`text-xs font-semibold ${theme.heading}`}>改动清单</div>
            <div className="mt-2 min-w-0 space-y-1">
              {changes.length ? changes.map((change, index) => (
                <div key={`${change.path}-${index}`} className={`min-w-0 rounded-md border p-2 text-xs ${theme.cardBorder}`}>
                  <OverflowText strategy="wrap"><strong>{change.label}</strong> · {change.reason || '根据反馈调整'}</OverflowText>
                </div>
              )) : <div className={`text-xs ${theme.subText}`}>当前框架没有 AI 草稿改动。</div>}
            </div>
          </div>
        </section>
      </div>

      <ArcoCollapse bordered={false}>
        <ArcoCollapse.Item name="framework-advanced" header="高级设置">
          <div className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-3">
            <label className="min-w-0 text-xs"><span className={`mb-1 block font-semibold ${theme.subText}`}>框架名称</span><ArcoInput value={draftFramework.label} onChange={label => patchActiveFramework({ label })} /></label>
            <label className="min-w-0 text-xs"><span className={`mb-1 block font-semibold ${theme.subText}`}>文章类型代码</span><ArcoInput value={draftFramework.articleType} readOnly /></label>
            <label className="min-w-0 text-xs"><span className={`mb-1 block font-semibold ${theme.subText}`}>默认语言</span><ArcoInput value={draftFramework.defaultLanguage} onChange={defaultLanguage => patchActiveFramework({ defaultLanguage })} /></label>
            <label className="min-w-0 text-xs"><span className={`mb-1 block font-semibold ${theme.subText}`}>漏斗阶段</span><ArcoInput value={draftFramework.funnelStage} onChange={funnelStage => patchActiveFramework({ funnelStage })} /></label>
            <label className="min-w-0 text-xs md:col-span-2"><span className={`mb-1 block font-semibold ${theme.subText}`}>文章目标</span><ArcoInput.TextArea value={draftFramework.contentGoal} autoSize onChange={contentGoal => patchActiveFramework({ contentGoal })} /></label>
            <label className="min-w-0 text-xs"><span className={`mb-1 block font-semibold ${theme.subText}`}>目标读者</span><ArcoInput.TextArea value={draftFramework.targetAudience} autoSize onChange={targetAudience => patchActiveFramework({ targetAudience })} /></label>
            <label className="min-w-0 text-xs"><span className={`mb-1 block font-semibold ${theme.subText}`}>最少字数</span><ArcoInputNumber min={300} max={5000} value={draftFramework.wordCount.min} onChange={min => patchActiveFramework({ wordCount: { ...draftFramework.wordCount, min: Number(min || 300) } })} /></label>
            <label className="min-w-0 text-xs"><span className={`mb-1 block font-semibold ${theme.subText}`}>最多字数</span><ArcoInputNumber min={draftFramework.wordCount.min} max={8000} value={draftFramework.wordCount.max} onChange={max => patchActiveFramework({ wordCount: { ...draftFramework.wordCount, max: Number(max || draftFramework.wordCount.min) } })} /></label>
            <label className="min-w-0 text-xs"><span className={`mb-1 block font-semibold ${theme.subText}`}>写前资料（每行一项）</span><ArcoInput.TextArea value={draftFramework.requiredInputs.join('\n')} autoSize={{ minRows: 3, maxRows: 8 }} onChange={value => patchActiveFramework({ requiredInputs: splitRules(value) })} /></label>
            {([
              ['voiceRules', '语气与可读性'],
              ['evidenceRules', '证据规则'],
              ['preflightChecks', '发布前检查'],
              ['prohibitedClaims', '禁止编造项'],
            ] as Array<[keyof Pick<BlogFramework, 'voiceRules' | 'evidenceRules' | 'preflightChecks' | 'prohibitedClaims'>, string]>).map(([key, label]) => (
              <label key={key} className="min-w-0 text-xs"><span className={`mb-1 block font-semibold ${theme.subText}`}>{label}（每行一项）</span><ArcoInput.TextArea value={draftFramework[key].join('\n')} autoSize={{ minRows: 3, maxRows: 8 }} onChange={value => patchActiveFramework({ [key]: splitRules(value) })} /></label>
            ))}
          </div>
          <div className="mt-4 min-w-0 space-y-3">
            <div className={`text-sm font-bold ${theme.heading}`}>文章结构区块</div>
            {draftFramework.outlineBlocks.map((block, index) => (
              <div key={`${draftFramework.id}-${index}`} className={`grid min-w-0 gap-2 rounded-lg border p-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_88px] ${theme.cardBorder}`}>
                <ArcoInput value={block.heading} placeholder="H2/H3 标题" onChange={heading => patchOutlineBlock(index, { heading })} />
                <ArcoInput value={block.intent} placeholder="区块意图" onChange={intent => patchOutlineBlock(index, { intent })} />
                <label className={`flex min-w-0 items-center gap-2 text-xs ${theme.subText}`}><ArcoSwitch checked={block.required} onChange={required => patchOutlineBlock(index, { required })} />必须</label>
                <ArcoInput.TextArea className="md:col-span-3" value={block.contentRules} autoSize={{ minRows: 2, maxRows: 5 }} placeholder="写作规则" onChange={contentRules => patchOutlineBlock(index, { contentRules })} />
              </div>
            ))}
          </div>
        </ArcoCollapse.Item>
      </ArcoCollapse>
    </div>
  );
};

export default BlogFrameworkStandardWorkbench;
