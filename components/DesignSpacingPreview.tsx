import React from 'react';
import { Badge, Button, Panel, PanelContent, PanelDescription, PanelHeader, PanelTitle, StatusPill, TabsList, TabButton } from './ui';
import { IconCheck, IconDocumentText, IconPhoto, IconSparkles, IconTable } from './Icons';
import { SiteProfile, defaultSiteStyleKit } from '../services/clientProfileService';

type DesignSpacingPreviewProps = {
  activeProfile?: SiteProfile | null;
};

const previewModules = [
  { label: '博客正文', tone: 'Article', detail: '标题、段落、内链和 FAQ 使用品牌字体与正文节奏。' },
  { label: '页面计划', tone: 'Elementor', detail: 'Hero、信息卡片、可选 CTA 区块使用同一套品牌角色。' },
  { label: 'WooCommerce', tone: 'Product SEO', detail: '按钮、字段 chip 和审核状态保持统一尺寸与颜色。' },
];

export const DesignSpacingPreview: React.FC<DesignSpacingPreviewProps> = ({ activeProfile }) => {
  const styleKit = activeProfile?.styleKit || defaultSiteStyleKit();
  const brandName = activeProfile?.brandName || activeProfile?.siteName || activeProfile?.name || '默认站点';
  const headingFont = `${styleKit.typography.headingFont}, "Noto Sans SC", ui-sans-serif, system-ui, sans-serif`;
  const bodyFont = `${styleKit.typography.bodyFont}, "Noto Sans SC", ui-sans-serif, system-ui, sans-serif`;

  return (
    <div className="design-preview brand-audit">
      <div className="brand-audit__header">
        <div>
          <p className="design-preview__eyebrow">Brand QA Preview</p>
          <h1 className="design-preview__title">品牌样式验收台</h1>
          <p className="design-preview__subtitle">
            这里展示已保存品牌规范如何影响博客、页面计划、WooCommerce CTA 和按钮状态。它不是开发者间距 demo，而是上线前的视觉检查台。
          </p>
        </div>
        <div className="design-preview__toolbar-actions">
          <Button variant="outline" size="sm"><IconDocumentText className="size-4" /> 导出截图说明</Button>
          <Button variant="primary" size="sm"><IconCheck className="size-4" /> 标记验收</Button>
        </div>
      </div>

      <div className="brand-audit__workspace">
        <main className="brand-audit__canvas" style={{
          background: styleKit.roles.pageBg,
          color: styleKit.roles.text,
          fontFamily: bodyFont,
        }}>
          <div className="brand-audit__nav" style={{ background: styleKit.roles.cardBg }}>
            <strong style={{ fontFamily: headingFont }}>{brandName}</strong>
            <span>Products</span>
            <span>Resources</span>
            <Button style={{ background: styleKit.roles.primaryButtonBg, color: styleKit.roles.primaryButtonText, borderRadius: styleKit.buttons.radius }}>
              Learn More
            </Button>
          </div>

          <section className="brand-audit__hero" style={{ background: styleKit.roles.sectionBg }}>
            <div>
              <span style={{ color: styleKit.roles.link }}>Saved brand material</span>
              <h2 style={{ fontFamily: headingFont, fontSize: styleKit.typography.desktop.h1, fontWeight: styleKit.typography.headingWeight }}>
                Product Detail Page
              </h2>
              <p style={{ color: styleKit.roles.mutedText, lineHeight: styleKit.typography.desktop.lineHeight }}>
                This preview combines content blocks a visitor will actually see: product proof, comparison cards, internal links, FAQ, and CTA.
              </p>
            </div>
            <div className="brand-audit__proof" style={{ background: styleKit.roles.cardBg }}>
              <IconPhoto className="size-5" />
              <strong>Product proof card</strong>
              <p style={{ color: styleKit.roles.mutedText }}>Image crop, caption, field labels, and primary CTA inherit the same tokens.</p>
            </div>
          </section>

          <section className="brand-audit__module-grid">
            {previewModules.map(module => (
              <article key={module.label} style={{ background: styleKit.roles.cardBg }}>
                <Badge tone="ai">{module.tone}</Badge>
                <h3 style={{ fontFamily: headingFont, fontSize: styleKit.typography.desktop.h3 }}>{module.label}</h3>
                <p style={{ color: styleKit.roles.mutedText }}>{module.detail}</p>
                <a href="#" style={{ color: styleKit.roles.internalLink }}>查看内链示例</a>
              </article>
            ))}
          </section>

          <section className="brand-audit__cta" style={{ background: styleKit.roles.ctaBg }}>
            <div>
              <h2 style={{ fontFamily: headingFont, fontSize: styleKit.typography.desktop.h2 }}>CTA Preview</h2>
              <p style={{ color: styleKit.roles.mutedText }}>按钮和辅助文字要在浅色、深色和品牌背景上都能读清楚。</p>
            </div>
            <Button variant="primary" style={{ background: styleKit.roles.primaryButtonBg, color: styleKit.roles.primaryButtonText }}>
              <IconSparkles className="size-4" /> Generate selected fields
            </Button>
          </section>
        </main>

        <aside className="brand-audit__side">
          <Panel>
            <PanelHeader>
              <div>
                <PanelTitle>验收摘要</PanelTitle>
                <PanelDescription>{brandName} 当前保存的品牌规范</PanelDescription>
              </div>
              <StatusPill tone="success">Ready</StatusPill>
            </PanelHeader>
            <PanelContent>
              <div className="brand-audit__tokens">
                <div><span>Heading</span><strong>{styleKit.typography.headingFont}</strong></div>
                <div><span>Body</span><strong>{styleKit.typography.bodyFont}</strong></div>
                <div><span>Button</span><strong>{styleKit.buttons.height}px</strong></div>
              </div>
              <div className="brand-audit__swatches">
                {Object.entries(styleKit.colors).slice(0, 6).map(([key, color]) => (
                  <span key={key} title={`${key}: ${color}`} style={{ background: color }} />
                ))}
              </div>
            </PanelContent>
          </Panel>

          <Panel>
            <PanelHeader>
              <div>
                <PanelTitle>模块检查</PanelTitle>
                <PanelDescription>用同一套 token 检查高频业务界面。</PanelDescription>
              </div>
              <IconTable className="size-4 text-[var(--system-muted)]" />
            </PanelHeader>
            <PanelContent>
              <TabsList>
                <TabButton selected>页面</TabButton>
                <TabButton>博客</TabButton>
                <TabButton>产品</TabButton>
              </TabsList>
              <ol className="brand-audit__checklist">
                <li><span>1</span> 标题和正文不是同一种视觉重量。</li>
                <li><span>2</span> CTA、内链、状态标签颜色有明确分工。</li>
                <li><span>3</span> 移动端预览不靠缩小桌面卡片糊弄。</li>
              </ol>
            </PanelContent>
          </Panel>
        </aside>
      </div>
    </div>
  );
};

export default DesignSpacingPreview;
