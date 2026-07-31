export type BlogWorkspaceMode = 'blog' | 'blogAi' | 'blogFormat';
export type MediaWorkspaceMode = 'image' | 'mediaOps';

export type AppViewMode = 'commandCenter' | 'skillFactory' | 'brandStarter' | 'seoAudit' | 'mediaWorkspace' | 'blogWorkspace' | 'pagePlanner' | 'productSeo';

export const BLOG_WORKSPACE_TABS: Array<{ mode: BlogWorkspaceMode; label: string; shortLabel: string }> = [
  { mode: 'blog', label: '博客写作', shortLabel: '博客写作' },
  { mode: 'blogAi', label: '展会/证书/项目博客', shortLabel: '展会博客' },
  { mode: 'blogFormat', label: '批量修复博客格式', shortLabel: '博客格式' },
];

export const MEDIA_WORKSPACE_TABS: Array<{ mode: MediaWorkspaceMode; label: string; shortLabel: string }> = [
  { mode: 'image', label: '图片处理', shortLabel: '图片处理' },
  { mode: 'mediaOps', label: '媒体库SEO压缩', shortLabel: '媒体SEO' },
];

export const APP_MODE_TABS: Array<{ mode: AppViewMode; label: string; shortLabel: string }> = [
  { mode: 'commandCenter', label: '中控台', shortLabel: '中控台' },
  { mode: 'skillFactory', label: '站点资料库', shortLabel: '站点资料' },
  { mode: 'brandStarter', label: '品牌启动器', shortLabel: '品牌启动器' },
  { mode: 'seoAudit', label: 'SEO 审计', shortLabel: 'SEO 审计' },
  { mode: 'mediaWorkspace', label: '图片与媒体SEO', shortLabel: '图片与媒体SEO' },
  { mode: 'blogWorkspace', label: '博客撰写与修改', shortLabel: '博客撰写与修改' },
  { mode: 'pagePlanner', label: '页面计划', shortLabel: '页面计划' },
  { mode: 'productSeo', label: 'WooCommerce', shortLabel: 'WooCommerce' },
];
