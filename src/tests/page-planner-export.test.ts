import assert from 'node:assert/strict';
import test from 'node:test';

test('Elementor brief export counts draft SEO copy instead of construction notes', async () => {
  const plannerModule = await import('../../components/PagePlannerDashboard.tsx');
  const buildElementorBriefHtml = plannerModule.buildElementorBriefHtml as (plan: any) => string;

  const html = buildElementorBriefHtml({
    id: 'plan-1',
    pageTitle: 'Product Samples',
    seoTitle: 'Product Samples - Bulk Supply',
    metaDescription: 'Compare Demo Brand product samples for bulk deployment site projects, with durable compact options and B2B support.',
    slug: 'product-samples',
    primaryKeyword: 'product sample',
    secondaryKeywords: ['bulk product sample'],
    pageType: 'product_category',
    pageTypeLabel: '产品类目页',
    searchIntent: 'B2B buyers comparing bulk product options.',
    priority: 'high',
    relatedProducts: [],
    relatedCategories: [],
    outline: {
      heroTitle: 'Product Samples',
      heroHeadingLevel: 'H1',
      heroSubtitle: 'Source durable product samples for deployment site projects.',
      heroImageBrief: 'Use a deployment site product image.',
      heroImageAlt: 'product sample for deployment site',
      heroCtaText: 'Request Quote',
      heroCtaLink: 'https://example.com/contact/',
      sections: [
        {
          heading: 'Built for Busy Facilities',
          headingLevel: 'H2',
          elementorWidget: 'Heading + Text Editor + Image',
          elementorLayout: 'Two-column section',
          sectionPurpose: 'Explain durability.',
          writingBrief: 'Mention commercial lifecycle value.',
          suggestedCopy: 'Short commercial product copy.',
          imageBrief: 'Use a product close-up.',
          imageAlt: 'durable product sample',
          details: 'Fallback section details should not inflate draft copy count.',
          assets: ['product photos'],
          subheadings: [
            {
              heading: 'Durable materials',
              headingLevel: 'H3',
              writingBrief: 'Construction-only note should not count as draft copy.',
            },
          ],
          internalLinkAnchors: [],
        },
      ],
      faqs: ['Do you support volume orders?'],
      cta: 'Contact Demo Brand for a product sample quote.',
    },
    internalLinks: [
      {
        type: 'planned_page',
        title: 'Automatic Product Samples',
        url: '/automatic-product-samples/',
        anchorText: 'automatic product samples',
        reason: 'Construction note should not count as draft copy.',
      },
    ],
    notes: 'Execution notes should not inflate draft copy count.',
  });

  assert.match(html, /SEO 草稿字数：<\/strong> 31 词/);
  assert.match(html, /Meta 描述：<\/strong> Compare Demo Brand product samples/);
  assert.doesNotMatch(html, /Guide Word Count:<\/strong>/);
  assert.match(html, /1000\+ 词扩写备注/);
});

test('Elementor brief export does not invent FAQ or CTA content for an empty plan', async () => {
  const plannerModule = await import('../../components/PagePlannerDashboard.tsx');
  const buildElementorBriefHtml = plannerModule.buildElementorBriefHtml as (plan: any) => string;

  const html = buildElementorBriefHtml({
    id: 'neutral-plan',
    pageTitle: 'Demo Topic',
    seoTitle: 'Demo Topic',
    metaDescription: '',
    slug: 'demo-topic',
    primaryKeyword: 'demo topic',
    secondaryKeywords: [],
    pageType: 'guide',
    pageTypeLabel: '指南页',
    searchIntent: 'Learn about the supplied topic.',
    priority: 'medium',
    relatedProducts: [],
    relatedCategories: [],
    outline: {
      heroTitle: 'Demo Topic',
      heroHeadingLevel: 'H1',
      heroSubtitle: '',
      heroImageBrief: '',
      heroImageAlt: '',
      heroCtaText: '',
      heroCtaLink: '',
      sections: [],
      faqs: [],
      cta: '',
    },
    internalLinks: [],
    notes: '',
  });

  assert.doesNotMatch(html, /最终 CTA 区块/);
  assert.doesNotMatch(html, /联系我们|报价|项目支持/);
  assert.match(html, /只有当前资料能支持可靠答案时才添加/);
});
