import React, { useEffect, useMemo, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { ConfigProvider, Modal as ArcoModal, Space as ArcoSpace, Table as ArcoTable, Tag as ArcoTag } from '@arco-design/web-react';
import '@arco-design/web-react/dist/css/arco.css';
import '../../src/styles.css';
import '../../src/layout-guardrails.css';
import './harness.css';
import {
  ActionGroup,
  Badge,
  Button,
  OverflowText,
  Panel,
  PanelContent,
  PanelDescription,
  PanelHeader,
  PanelHeaderActions,
  PanelTitle,
  StatusPill,
  Table,
  TableShell,
  TabButton,
  TabsList,
  Toolbar,
} from '../../components/ui';

const longChinese = '这是一个用于验证桌面工作台布局的超长中文标题，需要在组件内部自然换行并确保右侧全部操作仍然清晰可见和可以点击';
const longToken = 'commercialWordPressMediaOptimizationKeywordWithoutAnyNaturalBreakPoint1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const longUrl = `https://example.com/wp-content/uploads/2026/07/${longToken}/${longToken}.webp?source=${longToken}`;
const tabLabels = ['站点综合诊断与修复', '媒体库批量生成与同步', 'WooCommerce 产品字段审核', '博客格式批量修复', '页面计划与施工简报', '自动化任务历史记录'];

const MediaPreviewStressHarness = () => (
  <ArcoModal
    visible
    footer={null}
    maskClosable={false}
    className="media-preview-modal"
    data-testid="media-preview-modal"
    data-layout-root
    title={(
      <div className="media-preview-modal__title" data-testid="media-preview-title">
        <OverflowText
          strategy="break-anywhere"
          className="block text-lg font-bold leading-tight"
          data-testid="media-preview-filename"
        >
          {`详情页产品规格展示-${longToken}-${longToken}.jpg`}
        </OverflowText>
        <ArcoSpace size={8} wrap className="media-preview-modal__meta">
          <span>ID: 7632</span>
          <span>image/jpeg</span>
          <ArcoTag color="purple">产品详情页展示素材</ArcoTag>
        </ArcoSpace>
      </div>
    )}
    style={{ width: 'min(880px, calc(100vw - 32px))' }}
    bodyStyle={{ padding: 0 }}
  >
    <div className="media-preview-modal__body" data-overflow-policy="y-scroll">
      <div className="p-2" data-overflow-policy="clip-media">
        <div className="mx-auto h-[50vh] max-w-full rounded-lg bg-slate-200 dark:bg-slate-700" />
      </div>
      <div className="grid grid-cols-1 gap-6 border-t p-4 md:grid-cols-2">
        <div>
          <h4 className="mb-2 text-sm font-medium">原始元数据</h4>
          <OverflowText strategy="break-anywhere">{longToken.repeat(3)}</OverflowText>
        </div>
      </div>
    </div>
  </ArcoModal>
);

const mediaStressItem = {
  id: 7627,
  filename: `media-${longToken}-${longToken}.jpg`,
  generatedFilename: `${longToken}-${longToken}.webp`,
};

const MediaOpsExpandedStressHarness = () => {
  const [expanded, setExpanded] = useState(true);

  return (
  <div
    data-layout-root
    data-testid="media-ops-layout-stress"
    style={{ display: 'flex', width: '100vw', minHeight: '100vh', background: 'var(--system-page)' }}
  >
    <aside
      data-testid="media-ops-expanded-sidebar"
      style={{ width: 256, minWidth: 256, padding: 16, borderRight: '1px solid var(--system-border)', background: 'var(--system-surface)' }}
    >
      <strong>独立站 AI</strong>
      <p>图片与媒体 SEO</p>
    </aside>
    <main style={{ minWidth: 0, flex: 1, padding: 24 }}>
      <TableShell className="media-ops-table-shell rounded-none border-0" data-testid="media-ops-table-shell">
        <ArcoTable
          className="media-ops-table"
          rowKey="id"
          data={[mediaStressItem]}
          pagination={false}
          tableLayoutFixed
          expandedRowKeys={expanded ? [mediaStressItem.id] : []}
          expandProps={{ width: 0, icon: () => null }}
          columns={[
            {
              title: '预览',
              dataIndex: 'preview',
              width: 88,
              render: () => <div data-overflow-policy="clip-media" style={{ width: 56, height: 56, borderRadius: 6, background: 'var(--system-surface-strong)' }} />,
            },
            {
              title: '媒体信息',
              dataIndex: 'filename',
              render: (_value, item) => (
                <div className="media-ops-media-cell">
                  <OverflowText strategy="truncate" title={item.filename}>{item.filename}</OverflowText>
                  <OverflowText strategy="truncate" title={item.generatedFilename}>{item.generatedFilename}</OverflowText>
                  <span>image/jpeg · 112.7 KB · 2026/7/14 14:30</span>
                </div>
              ),
            },
            {
              title: '问题 / 状态',
              dataIndex: 'status',
              width: 208,
              render: () => <div className="media-ops-status-cell"><StatusPill tone="warning">Alt 文本为空并等待人工审核</StatusPill></div>,
            },
            {
              title: '',
              dataIndex: 'action',
              width: 72,
              render: () => <Button size="sm" onClick={() => setExpanded(value => !value)}>{expanded ? '收起' : '详情'}</Button>,
            },
          ]}
          expandedRowRender={() => (
            <div className="media-ops-expanded-row" data-testid="media-ops-expanded-row">
              <div className="media-ops-keyword-row">
                <strong>核心关键词</strong>
                <div className="media-ops-keyword-input">{longToken}</div>
              </div>
              <div className="media-ops-field-grid" data-testid="media-ops-field-grid">
                {['文件名', '标题', 'ALT 文本', '图片说明', '描述'].map(label => (
                  <section className="media-ops-field-card" key={label}>
                    <div className="media-ops-field-card-header">
                      <div className="min-w-0"><strong>{label}</strong><span>122 / 160</span></div>
                      <ActionGroup><Button size="sm">保存</Button><Button size="sm" variant="primary">AI生成</Button></ActionGroup>
                    </div>
                    <OverflowText strategy="break-anywhere">{longToken.repeat(3)}</OverflowText>
                  </section>
                ))}
              </div>
              <div className="media-ops-expanded-footer">
                <a href="https://example.test/media.jpg">打开原图</a>
                <Button data-testid="media-ops-review-action" variant="primary">到审核面板编辑/同步</Button>
              </div>
            </div>
          )}
        />
      </TableShell>
    </main>
  </div>
  );
};

const LayoutStressHarness = () => {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const initialDark = params.get('theme') === 'dark';
  const scale = Math.max(1, Math.min(1.5, Number(params.get('scale') || 1)));
  const surface = params.get('surface');
  const [dark, setDark] = useState(initialDark);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    document.documentElement.style.fontSize = `${16 * scale}px`;
    document.body.dataset.layoutReady = 'true';
  }, [dark, scale]);

  if (surface === 'media-preview') return <MediaPreviewStressHarness />;
  if (surface === 'media-ops-expanded') return <MediaOpsExpandedStressHarness />;

  return (
    <main className="layout-stress-page" data-layout-root data-testid="layout-stress-root">
      <Toolbar
        start={(
          <div className="layout-stress-copy">
            <OverflowText strategy="wrap"><h1>{longChinese}</h1></OverflowText>
            <OverflowText strategy="break-anywhere">{longUrl}</OverflowText>
          </div>
        )}
        actions={(
          <ActionGroup minItemWidth={132}>
            <Button variant="primary">生成全部预览</Button>
            <Button variant="ai">使用 AI 重写</Button>
            <Button variant="neutral">加入生成队列</Button>
            <Button variant="outline">导出审核报告</Button>
            <Button variant="success">同步 WordPress</Button>
            <Button variant="danger">拒绝所选草稿</Button>
          </ActionGroup>
        )}
      />

      <Panel>
        <PanelHeader>
          <div className="layout-stress-copy">
            <PanelTitle>{longChinese}</PanelTitle>
            <PanelDescription>{longToken}</PanelDescription>
          </div>
          <PanelHeaderActions>
            <Button data-testid="theme-toggle" onClick={() => setDark(value => !value)}>切换明暗主题</Button>
            <Button variant="primary">保存并执行完整检查</Button>
          </PanelHeaderActions>
        </PanelHeader>
        <PanelContent>
          <div className="layout-stress-badges">
            <Badge tone="warning">需要人工审核的超长状态标签</Badge>
            <StatusPill tone="success">后台同步任务已经完成并等待发布确认</StatusPill>
            <StatusPill tone="danger">WordPress 返回了很长的错误状态消息</StatusPill>
          </div>
        </PanelContent>
      </Panel>

      <TabsList data-testid="layout-stress-tabs">
        {tabLabels.map((label, index) => <TabButton key={label} selected={index === 0}>{label}</TabButton>)}
      </TabsList>

      <div className="layout-stress-grid">
        <Panel>
          <PanelHeader><PanelTitle>长内容换行策略</PanelTitle></PanelHeader>
          <PanelContent className="layout-stress-copy">
            <OverflowText strategy="wrap">{longChinese.repeat(2)}</OverflowText>
            <OverflowText strategy="break-anywhere">{longToken.repeat(2)}</OverflowText>
            <OverflowText strategy="truncate" rows={2}>{longChinese.repeat(3)}</OverflowText>
          </PanelContent>
        </Panel>
        <Panel>
          <PanelHeader><PanelTitle>操作组拥挤策略</PanelTitle></PanelHeader>
          <PanelContent>
            <ActionGroup minItemWidth={148}>
              <Button>扫描媒体资源</Button>
              <Button>生成所选字段</Button>
              <Button>批准并同步上线</Button>
              <Button>查看完整任务历史</Button>
            </ActionGroup>
          </PanelContent>
        </Panel>
      </div>

      <TableShell minContentWidth={1180}>
        <Table className="layout-stress-table">
          <thead>
            <tr><th>状态</th><th>文件与 URL</th><th>错误详情</th><th>操作</th></tr>
          </thead>
          <tbody>
            <tr>
              <td><StatusPill tone="warning">生成完成等待人工审核</StatusPill></td>
              <td><OverflowText strategy="break-anywhere">{longUrl}</OverflowText></td>
              <td><OverflowText strategy="wrap">{longChinese}{longToken}</OverflowText></td>
              <td>
                <ActionGroup minItemWidth={88}>
                  <Button size="sm">查看详情</Button>
                  <Button size="sm" variant="success">批准同步</Button>
                </ActionGroup>
              </td>
            </tr>
          </tbody>
        </Table>
      </TableShell>
    </main>
  );
};

const root = document.getElementById('root');
if (!root) throw new Error('Missing layout harness root');
ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <ConfigProvider size="default">
      <LayoutStressHarness />
    </ConfigProvider>
  </React.StrictMode>,
);
