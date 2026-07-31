import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import {
    PRODUCT_SEO_FIELD_KEYS,
    PRODUCT_WORKBENCH_FIELD_KEYS,
    SEO_KEYWORDS_HELP_TEXT,
    ProductDetailActions,
    ProductTemplateRulesModal,
    areAllProductSeoFieldsSelected,
    getProductSeoFieldKeysForProfile,
    getProductSeoFieldOptionsForProfile,
    buildProductBatchGenerateRequestBody,
    buildProductFieldGenerateRequestBody,
    buildProductDailySeoTask,
    buildProductTemplateDraftRequest,
    buildProductTemplatePackForSave,
    buildWooCommerceProductFieldTemplateGuidance,
    buildProductRefImagePath,
    getNextProductSeoAllFieldSelection,
    buildProductCategoryWarningNotice,
    toggleProductSeoFieldSelection,
    PRODUCT_SHORT_DESCRIPTION_PREVIEW_CLASS,
    shouldShowProductDetailSection,
    ProductBatchGenerateFeedback,
    validateProductRefImageUploadResponse,
    validateProductRefImageClearResponse,
    buildProductRefImagesClearPath,
    buildProductReviewBatchNotice,
    buildProductBatchSyncNotice,
    validateProductUpdateResponse,
    validateProductOkMutationResponse,
    validateProductReviewListResponse,
    validateProductReviewBatchResponse,
    validateProductSingleSyncResponse,
    validateProductBatchSyncResponse,
    validateProductBatchGenerateResponse,
    validateProductDetailSliceSeoBatchResponse,
    buildProductDetailSliceSeoBatchNotice,
    buildProductCacheNotice,
    formatProductCacheAge,
    formatProductCacheSummary,
    groupProductBatchGenerateErrorsByField,
    isRetryableProductBatchGenerateError,
    validateProductFieldGenerateResult,
} from '../../components/ProductSeoDashboard.tsx';
import { fetchProductSeoImageParts, normalizeProductSeoOutput } from '../product_seo.ts';

const productTemplateTheme = {
    cardBorder: 'border-slate-200',
    heading: 'text-slate-900',
    subText: 'text-slate-500',
    inputBg: 'bg-white',
    inputBorder: 'border-slate-200',
};

test('product SEO field selection can select all fields from a partial selection', () => {
    const nextSelection = getNextProductSeoAllFieldSelection(['slug', 'description']);

    assert.deepEqual(nextSelection, PRODUCT_SEO_FIELD_KEYS);
    assert.equal(areAllProductSeoFieldsSelected(nextSelection), true);
});

test('WooCommerce workbench always offers the four generated and synced fields', () => {
    assert.deepEqual(PRODUCT_WORKBENCH_FIELD_KEYS, ['slug', 'short_description', 'description', 'tag_names']);
});

test('product SEO field selection can clear all fields when all fields are selected', () => {
    const nextSelection = getNextProductSeoAllFieldSelection(PRODUCT_SEO_FIELD_KEYS);

    assert.deepEqual(nextSelection, []);
    assert.equal(areAllProductSeoFieldsSelected(nextSelection), false);
});

test('product SEO profile field config distinguishes unset from explicitly empty', () => {
    assert.deepEqual(getProductSeoFieldKeysForProfile(undefined), PRODUCT_SEO_FIELD_KEYS);
    assert.deepEqual(getProductSeoFieldKeysForProfile(''), []);
    assert.deepEqual(getProductSeoFieldOptionsForProfile([]), []);
    assert.equal(areAllProductSeoFieldsSelected([], []), false);
});

test('product SEO field selection keeps individual toggles in field order', () => {
    const nextSelection = toggleProductSeoFieldSelection(['tag_names', 'slug'], 'description');

    assert.deepEqual(nextSelection, ['slug', 'description', 'tag_names']);
});

test('product SEO field options omit ACF extra info from the default WooCommerce flow', () => {
    const enabled = getProductSeoFieldKeysForProfile('slug,short_description,description,aioseo_title,aioseo_description,tag_names');
    const options = getProductSeoFieldOptionsForProfile(enabled);

    assert.deepEqual(enabled, ['slug', 'short_description', 'description', 'aioseo_title', 'aioseo_description', 'tag_names']);
    assert.equal((PRODUCT_SEO_FIELD_KEYS as readonly string[]).includes('acf_seo_extra_info'), false);
    assert.equal(options.some(option => String(option.key) === 'acf_seo_extra_info'), false);
    assert.equal(options.some(option => option.key === 'aioseo_title'), true);
});

test('WooCommerce product template save pack strips legacy AIOSEO templates', () => {
    const saved = buildProductTemplatePackForSave({
        productShortDescription: 'old short',
        productFullDescription: 'old full',
        aioseoTitle: 'old title rule',
        aioseoDescription: 'old description rule',
        blogStandard: 'blog rules',
        enabledProductFields: 'slug,short_description,description,aioseo_title,aioseo_description,tag_names',
    }, {
        productSlug: '  model-keyword slug rules  ',
        productShortDescription: '  short table rules  ',
        productFullDescription: '  full description rules  ',
        tagNames: '  tag rules  ',
    });

    assert.deepEqual(saved, {
        productSlug: 'model-keyword slug rules',
        productShortDescription: 'short table rules',
        productFullDescription: 'full description rules',
        blogStandard: 'blog rules',
        enabledProductFields: 'slug,short_description,description,aioseo_title,aioseo_description,tag_names',
        tagNames: 'tag rules',
    });
    assert.equal('aioseoTitle' in saved, false);
    assert.equal('aioseoDescription' in saved, false);
    assert.equal('customProductFields' in saved, false);
});

test('WooCommerce product template modal focuses content templates and short-template feedback', () => {
    const html = renderToStaticMarkup(React.createElement(ProductTemplateRulesModal, {
        theme: productTemplateTheme,
        visible: true,
        siteId: 'demo-brand',
        backendUrl: '/api',
        templatePack: {
            productShortDescription: 'Use a two-column specs table.',
            productFullDescription: 'Use sections for specs and applications.',
            aioseoTitle: 'legacy title rule',
            aioseoDescription: 'legacy description rule',
        },
        onClose: () => undefined,
        onSaved: () => undefined,
        onNotice: () => undefined,
    }));

    assert.match(html, /data-testid="product-template-rules-modal"/);
    assert.match(html, /WooCommerce 模板\/规则/);
    assert.match(html, /Slug 规则/);
    assert.match(html, /data-testid="product-template-field-productSlug"/);
    assert.match(html, /短描述模板/);
    assert.match(html, /data-testid="product-template-field-productShortDescription"/);
    assert.match(html, /data-testid="product-template-field-productFullDescription"/);
    assert.match(html, /data-testid="product-template-field-tagNames"/);
    assert.match(html, /data-testid="product-template-generate-productShortDescription"/);
    assert.match(html, /data-testid="product-template-generate-productSlug"/);
    assert.match(html, /data-testid="product-template-generate-productFullDescription"/);
    assert.match(html, /data-testid="product-template-generate-tagNames"/);
    assert.match(html, /data-testid="product-template-feedback-productShortDescription"/);
    assert.match(html, /data-testid="product-template-feedback-productFullDescription"/);
    assert.doesNotMatch(html, /data-testid="product-template-field-customProductFields"/);
    assert.doesNotMatch(html, /自定义字段说明/);
    assert.doesNotMatch(html, /哪里不好 \/ 想怎么改/);
    assert.doesNotMatch(html, /根据反馈再生成/);
    assert.doesNotMatch(html, /AIOSEO 标题/);
    assert.doesNotMatch(html, /AIOSEO 描述/);
    assert.doesNotMatch(html, /SEO title/i);
    assert.match(html, /\u7559\u7a7a\u5219\u4e0d\u5e94\u7528\u7ed3\u6784\u6a21\u677f/);
    assert.doesNotMatch(html, /\u53ea\u4fdd\u7559\u89c4\u683c\u8868/);
    assert.doesNotMatch(html, /\u4ea7\u54c1\u5356\u70b9、\u89c4\u683c、\u5e94\u7528\u573a\u666f、\u5b89\u88c5\u7ef4\u62a4、FAQ/);
});

test('WooCommerce description generators do not retain built-in short or full description structures', async () => {
    const fs = await import('node:fs/promises');
    const legacyGeneratorSource = await fs.readFile(new URL('../product_seo.ts', import.meta.url), 'utf8');
    const dashboardSource = await fs.readFile(new URL('../../components/ProductSeoDashboard.tsx', import.meta.url), 'utf8');

    assert.doesNotMatch(legacyGeneratorSource, /short_description: rewrite\/improve the short description \(1-2 paragraphs\)/);
    assert.doesNotMatch(legacyGeneratorSource, /description: rewrite\/improve full description in HTML with 3 sections/);
    assert.doesNotMatch(dashboardSource, /value\.includes\('DOCX_STYLE_TEMPLATE_V'\)/);
    assert.doesNotMatch(dashboardSource, /\u8be6\u7ec6\u63cf\u8ff0\s*\{docxRenderVersion/);
});

test('WooCommerce template guidance only maps content fields to their own templates', () => {
    const guidance = buildWooCommerceProductFieldTemplateGuidance({
        productSlug: 'slug rules',
        productShortDescription: 'short rules',
        productFullDescription: 'full rules',
        tagNames: 'tag rules',
        aioseoTitle: 'title rules',
        aioseoDescription: 'description rules',
    });

    assert.deepEqual(guidance, {
        slugTemplate: 'slug rules',
        shortTemplate: 'short rules',
        fullTemplate: 'full rules',
        tagNamesTemplate: 'tag rules',
    });
});

test('WooCommerce short template draft request keeps feedback separate from saving', () => {
    assert.deepEqual(buildProductTemplateDraftRequest({
        templateKey: 'productShortDescription',
        currentTemplate: '  current short rules  ',
        feedback: '  keep it as table rows only  ',
    }), {
        templateKey: 'productShortDescription',
        currentTemplate: 'current short rules',
        feedback: 'keep it as table rows only',
    });
});

test('product reference image path encodes the filename path segment', () => {
    assert.equal(
        buildProductRefImagePath(9481, 'catalog shot #1.webp'),
        '/products/9481/ref-images/catalog%20shot%20%231.webp',
    );
});

test('product reference image clear path can target all images or one category', () => {
    assert.equal(
        buildProductRefImagesClearPath(9481),
        '/products/9481/ref-images',
    );
    assert.equal(
        buildProductRefImagesClearPath(9481, 'catalog'),
        '/products/9481/ref-images?category=catalog',
    );
});

test('product detail slice SEO batch response accepts partial image generation', () => {
    const result = validateProductDetailSliceSeoBatchResponse({
        ok: true,
        requested: 3,
        generated: 2,
        failed: 1,
        results: [
            { productId: 9481, assetId: 10, ok: true, status: 'seo_generated' },
            { productId: 9481, assetId: 11, ok: false, status: 'failed', error: 'missing image' },
        ],
    });

    assert.equal(result.generated, 2);
    assert.equal(result.failed, 1);
    assert.match(buildProductDetailSliceSeoBatchNotice(result), /成功 2 张，失败 1 张/);
    assert.throws(
        () => validateProductDetailSliceSeoBatchResponse({ ok: false, detail: 'Vertex AI 模型不可用' }),
        /Vertex AI 模型不可用/,
    );
});

test('product batch generation payload sends one shared core keyword to AI fields', () => {
    const payload = buildProductBatchGenerateRequestBody({
        ids: [101, 102],
        selectedFieldKeys: ['slug', 'aioseo_title', 'aioseo_description', 'tag_names'],
        language: 'en',
        slugTemplate: '  slug guide  ',
        shortTemplate: '  short guide  ',
        fullTemplate: '  full guide  ',
        seoKeywords: '  product sample  ',
        siteId: ' site-a ',
        keywordCategory: ' water-bottle ',
        keywordContext: '  product sample keyword database  ',
        companyContext: '  Demo Brand company facts  ',
    });

    assert.deepEqual(payload, {
        ids: [101, 102],
        fields: ['slug', 'aioseo_title', 'aioseo_description', 'tag_names'],
        language: 'en',
        slug_template: 'slug guide',
        short_template: 'short guide',
        full_template: 'full guide',
        seo_keywords: 'product sample',
        site_id: 'site-a',
        keyword_category: 'water-bottle',
    });
});

test('single product field generation starts an async backend task', () => {
    const payload = buildProductFieldGenerateRequestBody({
        field: 'description',
        shortDescription: '  specs  ',
        description: '  body  ',
        shortRefImages: 'short-a.png',
        fullRefImages: 'full-a.png',
        currentValue: 'old body',
        language: 'en',
        shortTemplate: '  short template  ',
        fullTemplate: '  full template  ',
        seoKeywords: '  enterprise product sample  ',
        siteId: ' site-a ',
        keywordCategory: ' water-bottle ',
        keywordContext: '  enterprise product sample keyword database  ',
        companyContext: '  Demo Brand factory context  ',
    });

    assert.deepEqual(payload, {
        field: 'description',
        short_description: 'specs',
        description: 'body',
        short_ref_images: 'short-a.png',
        full_ref_images: 'full-a.png',
        current_value: 'old body',
        language: 'en',
        slug_template: '',
        short_template: 'short template',
        full_template: 'full template',
        seo_keywords: 'enterprise product sample',
        site_id: 'site-a',
        keyword_category: 'water-bottle',
        async_mode: true,
    });
});

test('product field generation result rejects empty values before applying to drafts', () => {
    assert.throws(
        () => validateProductFieldGenerateResult({
            ok: false,
            field: 'description',
            detail: 'Vertex AI quota exceeded while generating product field',
        }),
        /Vertex AI quota exceeded/i,
    );

    assert.throws(
        () => validateProductFieldGenerateResult({
            ok: true,
            field: 'aioseo_title',
            value: '   ',
        }),
        /empty product field/i,
    );

    assert.deepEqual(
        validateProductFieldGenerateResult({
            ok: true,
            field: 'aioseo_title',
            value: 'Product Sample | Demo Brand',
        }),
        {
            ok: true,
            field: 'aioseo_title',
            value: 'Product Sample | Demo Brand',
        },
    );
});

test('product SEO normalization uses a non-Demo Brand marketing profile without forcing Demo Brand suffix', () => {
    const result = normalizeProductSeoOutput({
        productId: 88,
        productName: 'BM-1 GPS Bait Boat',
        currentShortDescription: '',
        currentDescription: '',
        template: '',
        marketingProfile: {
            brandName: 'Boatman',
            siteDomain: 'boatman.example',
            titleBrandSuffix: ' | Boatman',
            titleMaxChars: 60,
            productCategory: 'bait boats and fishing gear',
            audience: 'anglers and fishing gear buyers',
            buyerIntent: 'compare bait boat range, battery life, GPS, and payload',
            procurementModifiers: ['fishing', 'outdoor'],
            industryTerms: ['bait boat', 'GPS fishing gear'],
            titleFormat: '[Product Identity] | Boatman',
        },
    } as any, {
        short_description: 'GPS bait boat for lake fishing.',
        description: '<p>GPS bait boat for precise bait placement.</p>',
        acf_seo_extra_info: 'GPS bait boat with fishing-focused controls.',
        aioseo_title: 'BM-1 GPS Bait Boat',
        aioseo_description: 'BM-1 GPS bait boat for controlled bait placement and fishing trips.',
    });

    const combined = [
        result.short_description,
        result.description,
        result.acf_seo_extra_info,
        result.aioseo_title,
        result.aioseo_description,
    ].join(' ');
    assert.equal(result.aioseo_title, 'BM-1 GPS Bait Boat | Boatman');
    assert.doesNotMatch(combined, /Demo Brand|example-site\.com|deployment site|product sample/i);
});

test('product field async task response rejects missing ids and empty completed results', async () => {
    const { validateProductFieldGenerateTask } = await import('../../components/ProductSeoDashboard.tsx');

    assert.throws(
        () => validateProductFieldGenerateTask({
            taskId: '',
            productId: 9481,
            field: 'description',
            status: 'queued',
        }),
        /task id/i,
    );

    assert.throws(
        () => validateProductFieldGenerateTask({
            taskId: 'task-empty-result',
            productId: 9481,
            field: 'description',
            status: 'completed',
            result: { field: 'description', value: '   ' },
        }),
        /empty product field/i,
    );
});

test('product field async task response preserves backend ok false detail', async () => {
    const { validateProductFieldGenerateTask } = await import('../../components/ProductSeoDashboard.tsx');

    assert.throws(
        () => validateProductFieldGenerateTask({
            ok: false,
            detail: 'Vertex AI quota exceeded, retry later',
        }),
        /Vertex AI quota exceeded/i,
    );
});

test('product list response rejects malformed pagination payloads', async () => {
    const { validateProductListResponse } = await import('../../components/ProductSeoDashboard.tsx');

    assert.throws(
        () => validateProductListResponse({
            ok: false,
            detail: 'Product list query failed: database is locked',
        }),
        /database is locked/i,
    );

    assert.throws(
        () => validateProductListResponse({
            items: [],
        }),
        /invalid product total/i,
    );

    assert.throws(
        () => validateProductListResponse({
            total: 2,
        }),
        /missing product items/i,
    );

    assert.deepEqual(
        validateProductListResponse({
            items: [],
            total: 0,
            issue_summary: {},
        }),
        {
            items: [],
            total: 0,
            issue_summary: {},
        },
    );
});

test('product list response accepts cache metadata and rejects malformed cache info', async () => {
    const { validateProductListResponse } = await import('../../components/ProductSeoDashboard.tsx');

    assert.throws(
        () => validateProductListResponse({
            items: [],
            total: 0,
            cache: [],
        }),
        /cache metadata/i,
    );

    assert.deepEqual(
        validateProductListResponse({
            items: [],
            total: 0,
            issue_summary: {},
            cache: {
                hasCache: true,
                rowCount: 8,
                isStale: true,
                staleAfterSeconds: 86400,
                staleCount: 8,
                missingScannedAtCount: 0,
                latestLastScannedAt: '2026-05-26T06:20:31Z',
                oldestLastScannedAt: '2026-05-26T06:20:31Z',
                latestAgeSeconds: 120,
                oldestAgeSeconds: 120,
            },
        }).cache?.staleCount,
        8,
    );
});

test('product cache notice explains stale scan age', () => {
    assert.equal(formatProductCacheAge(30), '<1分钟');
    assert.equal(formatProductCacheAge(3600 * 5), '5小时');
    assert.equal(formatProductCacheAge(86400 * 3), '3天');
    assert.equal(formatProductCacheSummary(null), '未扫描');
    assert.equal(formatProductCacheSummary({
        hasCache: true,
        rowCount: 1,
        isStale: false,
        staleAfterSeconds: 86400,
        staleCount: 0,
        missingScannedAtCount: 0,
        latestLastScannedAt: '2026-06-19T01:00:00Z',
        oldestLastScannedAt: '2026-06-19T01:00:00Z',
        latestAgeSeconds: 3600,
        oldestAgeSeconds: 3600,
    }), '最新 1小时前');

    const notice = buildProductCacheNotice({
        hasCache: true,
        rowCount: 3,
        isStale: true,
        staleAfterSeconds: 86400,
        staleCount: 2,
        missingScannedAtCount: 1,
        latestLastScannedAt: '2026-06-18T01:00:00Z',
        oldestLastScannedAt: '2026-05-26T06:20:31Z',
        latestAgeSeconds: 90000,
        oldestAgeSeconds: 86400 * 24,
    });

    assert.match(notice, /产品扫描缓存已超过 24小时/);
    assert.match(notice, /最旧 24天前/);
    assert.match(notice, /过期 3 条/);
});

test('product issue labels include WooCommerce tag and ACF gaps in Chinese', async () => {
    const dashboardModule = await import('../../components/ProductSeoDashboard.tsx') as Record<string, any>;
    const optionLabels = dashboardModule.PRODUCT_ISSUE_OPTIONS.map((option: any) => option.label);

    assert.ok(
        dashboardModule.PRODUCT_ISSUE_OPTIONS.some((option: any) => (
            option.key === 'tag_names_empty' && option.label === '标签为空'
        )),
    );
    assert.ok(optionLabels.includes('详细描述为空'));
    assert.ok(optionLabels.includes('短描述为空'));
    assert.deepEqual(
        dashboardModule.getProductIssueLabels({
            issue_flags: {
                tag_names_empty: true,
            },
        }),
        ['标签为空'],
    );
    assert.deepEqual(
        dashboardModule.getProductIssueLabels({
            issue_groups: ['tag_names_empty', 'acf_seo_extra_info_empty'],
            issue_flags: {},
        }),
        ['标签为空', 'ACF SEO 信息为空'],
    );
});

test('product thumbnail cell renders the first WooCommerce product image', async () => {
    const dashboardModule = await import('../../components/ProductSeoDashboard.tsx') as Record<string, any>;

    assert.equal(typeof dashboardModule.ProductThumbnailCell, 'function');

    const html = renderToStaticMarkup(React.createElement(dashboardModule.ProductThumbnailCell, {
        product: {
            id: 1376,
            name: 'MODEL-006 Commercial compact White Manual Product Sample',
            image_urls: '["https://example.test/images/model-006-main.webp","https://example.test/images/model-006-side.webp"]',
        },
        theme: {
            cardBorder: 'border-slate-200',
            subText: 'text-slate-500',
        },
    }));

    assert.match(html, /src="https:\/\/example\.test\/images\/model-006-main\.webp"/);
    assert.match(html, /alt="MODEL-006 Commercial compact White Manual Product Sample 缩略图"/);
    assert.match(html, /min-w-\[5\.5rem\]/);
    assert.match(html, /min-w-\[3\.5rem\]/);
});

test('product media selector response rejects malformed pagination payloads', async () => {
    const { validateProductMediaSelectorResponse } = await import('../../components/ProductSeoDashboard.tsx');

    assert.throws(
        () => validateProductMediaSelectorResponse({
            ok: false,
            detail: 'Media selector failed: WordPress media scan is still running',
        }),
        /WordPress media scan is still running/i,
    );

    assert.throws(
        () => validateProductMediaSelectorResponse({
            items: [],
        }),
        /invalid media total/i,
    );

    assert.throws(
        () => validateProductMediaSelectorResponse({
            total: 1,
        }),
        /missing media items/i,
    );

    assert.deepEqual(
        validateProductMediaSelectorResponse({
            items: [],
            total: 0,
        }),
        {
            items: [],
            total: 0,
        },
    );
});

test('product media selector response rejects malformed media rows', async () => {
    const { validateProductMediaSelectorResponse } = await import('../../components/ProductSeoDashboard.tsx');

    assert.throws(
        () => validateProductMediaSelectorResponse({
            items: [{
                id: 12,
                filename: 'product-sample.webp',
                status: 'optimized',
            }],
            total: 1,
        }),
        /media source url/i,
    );
});

test('product category options response rejects malformed list payloads', async () => {
    const { validateProductCategoryOptionsResponse } = await import('../../components/ProductSeoDashboard.tsx');

    assert.throws(
        () => validateProductCategoryOptionsResponse({
            warnings: [],
        }),
        /missing product category items/i,
    );

    assert.throws(
        () => validateProductCategoryOptionsResponse({
            items: [],
        }),
        /missing product category warnings/i,
    );

    assert.throws(
        () => validateProductCategoryOptionsResponse({
            items: [{
                slug: '',
                name: 'Product Samples',
                count: 12,
            }],
            warnings: [],
        }),
        /category slug/i,
    );

    assert.throws(
        () => validateProductCategoryOptionsResponse({
            items: [{
                slug: 'product-samples',
                name: 'Product Samples',
                count: Number.NaN,
            }],
            warnings: [],
        }),
        /category count/i,
    );

    assert.deepEqual(
        validateProductCategoryOptionsResponse({
            items: [{
                slug: 'product-samples',
                name: 'Product Samples',
                count: 12,
            }],
            warnings: [],
        }),
        {
            items: [{
                slug: 'product-samples',
                name: 'Product Samples',
                count: 12,
            }],
            warnings: [],
        },
    );
});

test('product tag history response rejects malformed list payloads', async () => {
    const { validateProductTagHistoryResponse } = await import('../../components/ProductSeoDashboard.tsx');

    assert.throws(
        () => validateProductTagHistoryResponse({}),
        /missing product tag history items/i,
    );

    assert.throws(
        () => validateProductTagHistoryResponse({
            items: [{
                name: '',
                count: 8,
            }],
        }),
        /tag name/i,
    );

    assert.throws(
        () => validateProductTagHistoryResponse({
            items: [{
                name: 'product sample',
                count: Number.NaN,
            }],
        }),
        /tag count/i,
    );

    assert.deepEqual(
        validateProductTagHistoryResponse({
            items: [{
                name: 'product sample',
                count: 8,
            }],
        }),
        {
            items: [{
                name: 'product sample',
                count: 8,
            }],
        },
    );
});

test('product reference image response rejects malformed image lists', async () => {
    const { validateProductRefImagesResponse } = await import('../../components/ProductSeoDashboard.tsx');

    assert.throws(
        () => validateProductRefImagesResponse({}),
        /missing product reference images/i,
    );

    assert.throws(
        () => validateProductRefImagesResponse({
            images: [{
                filename: 'catalog-shot.webp',
                category: 'catalog',
            }],
        }),
        /reference image url/i,
    );

    assert.deepEqual(
        validateProductRefImagesResponse({
            images: [],
        }),
        {
            images: [],
        },
    );

    assert.throws(
        () => validateProductRefImagesResponse({
            images: [{
                filename: 'product-shot.webp',
                category: 'product',
                url: '/products/9481/ref-images/product-shot.webp',
                assetId: 'not-a-number',
            }],
        }),
        /asset id/i,
    );

    assert.deepEqual(
        validateProductRefImagesResponse({
            images: [{
                filename: 'product-shot.webp',
                category: 'product',
                url: '/products/9481/ref-images/product-shot.webp',
                assetId: 12,
                status: 'seo_generated',
                seoFilename: 'reviewed-product-shot.webp',
                title: 'portable lantern | Demo Brand',
                altText: 'portable lantern detail for deployment sites',
                caption: 'Demo Brand portable lantern detail',
                description: 'Detail image for an Demo Brand portable lantern.',
                wpUrl: '',
            }],
        }),
        {
            images: [{
                filename: 'product-shot.webp',
                category: 'product',
                url: '/products/9481/ref-images/product-shot.webp',
                assetId: 12,
                status: 'seo_generated',
                seoFilename: 'reviewed-product-shot.webp',
                title: 'portable lantern | Demo Brand',
                altText: 'portable lantern detail for deployment sites',
                caption: 'Demo Brand portable lantern detail',
                description: 'Detail image for an Demo Brand portable lantern.',
                wpUrl: '',
            }],
        },
    );
});

test('product reference image upload rejects ok false and partial upload responses', () => {
    assert.throws(
        () => validateProductRefImageUploadResponse({
            ok: false,
            uploaded: 2,
            files: [
                { filename: 'product-a.webp', category: 'product', size: 20, assetId: 1 },
                { filename: 'product-b.webp', category: 'product', size: 22, assetId: 2 },
            ],
            detail: 'AI filename generation failed',
        }, 2),
        /AI filename generation failed/,
    );

    assert.throws(
        () => validateProductRefImageUploadResponse({
            ok: true,
            uploaded: 1,
            files: [
                { filename: 'product-a.webp', category: 'product', size: 20, assetId: 1 },
            ],
        }, 2),
        /incomplete product reference image upload/i,
    );

    assert.deepEqual(
        validateProductRefImageUploadResponse({
            ok: true,
            uploaded: 1,
            files: [
                { filename: 'product-a.webp', category: 'product', size: 20, assetId: 1 },
            ],
        }, 1),
        {
            ok: true,
            uploaded: 1,
            files: [
                { filename: 'product-a.webp', category: 'product', size: 20, assetId: 1 },
            ],
        },
    );
});

test('product reference image clear response rejects failed or malformed deletes', () => {
    assert.throws(
        () => validateProductRefImageClearResponse({
            ok: false,
            deleted: 2,
            detail: 'clear failed',
        }),
        /clear failed/i,
    );

    assert.throws(
        () => validateProductRefImageClearResponse({
            ok: true,
        }),
        /invalid deleted count/i,
    );

    assert.deepEqual(
        validateProductRefImageClearResponse({
            ok: true,
            deleted: 0,
        }),
        {
            ok: true,
            deleted: 0,
        },
    );
});

test('product update response rejects ok false and zero-update saves', () => {
    assert.throws(
        () => validateProductUpdateResponse({
            ok: false,
            updated: 1,
            detail: 'Product row update failed',
        }),
        /Product row update failed/,
    );

    assert.throws(
        () => validateProductUpdateResponse({
            ok: true,
            updated: 0,
        }),
        /product update did not change any rows/i,
    );

    assert.deepEqual(
        validateProductUpdateResponse({
            ok: true,
            updated: 1,
        }),
        {
            ok: true,
            updated: 1,
        },
    );
});

test('product ok mutation response rejects ok false bodies', () => {
    assert.throws(
        () => validateProductOkMutationResponse({
            ok: false,
            detail: 'Reference image delete failed',
        }, 'Product reference image delete failed'),
        /Reference image delete failed/,
    );

    assert.deepEqual(
        validateProductOkMutationResponse({ ok: true }, 'Product reference image delete failed'),
        { ok: true },
    );
});

test('product generation history response rejects malformed history lists', async () => {
    const { validateProductGenerationHistoryResponse } = await import('../../components/ProductSeoDashboard.tsx');

    assert.throws(
        () => validateProductGenerationHistoryResponse({}),
        /missing product generation history/i,
    );

    assert.throws(
        () => validateProductGenerationHistoryResponse({
            history: [{
                id: 1,
                field: 'description',
                value: { html: '<p>Bad history value</p>' },
                created_at: '2026-06-12T00:00:00Z',
            }],
        }),
        /history value/i,
    );

    assert.deepEqual(
        validateProductGenerationHistoryResponse({
            history: [],
        }),
        {
            history: [],
        },
    );
});

test('product review list response rejects malformed review rows', () => {
    assert.throws(
        () => validateProductReviewListResponse({
            ok: false,
            detail: 'Product review query failed: database is locked',
        }),
        /database is locked/i,
    );

    assert.throws(
        () => validateProductReviewListResponse([{
            id: '',
            product_id: 0,
            short_description: '',
            description: '',
            acf_seo_extra_info: '',
            aioseo_title: 'Generated title',
            aioseo_description: 'Generated description',
            generator: 'ai',
            review_status: 'pending',
            product_name: '',
            product_permalink: '',
        }]),
        /invalid product review item/i,
    );

    assert.deepEqual(
        validateProductReviewListResponse([{
            id: 12,
            product_id: 9481,
            short_description: '',
            description: '',
            acf_seo_extra_info: '',
            aioseo_title: 'Demo Brand Product Sample',
            aioseo_description: 'Commercial product for enterprise deployment sites.',
            generator: 'ai',
            review_status: 'pending',
            product_name: 'Demo Brand Product Sample',
            product_permalink: 'https://example.com/product/demo-brand-product-sample/',
        }]),
        [{
            id: 12,
            product_id: 9481,
            short_description: '',
            description: '',
            acf_seo_extra_info: '',
            aioseo_title: 'Demo Brand Product Sample',
            aioseo_description: 'Commercial product for enterprise deployment sites.',
            generator: 'ai',
            review_status: 'pending',
            product_name: 'Demo Brand Product Sample',
            product_permalink: 'https://example.com/product/demo-brand-product-sample/',
        }],
    );
});

test('product daily SEO task carries current draft images and core keyword aliases', () => {
    const task = buildProductDailySeoTask(
        {
            id: 2067,
            name: 'SKU-ALPHA Elbow Product Sample',
            short_description: 'Old specs',
            description: 'Old description',
            short_ref_images: '',
            full_ref_images: '',
        },
        {
            fields: ['description', 'aioseo_title'],
            draft: {
                short_description: '  Draft specs  ',
                description: '  Draft description  ',
                short_ref_images: '  https://example.com/wp-content/uploads/sku-alpha-spec.webp  ',
                full_ref_images: '  https://example.com/wp-content/uploads/sku-alpha-detail.webp  ',
            },
            seoKeywords: '  BQ 2067 elbow product sample  ',
            keywordContext: '  product sample keyword database  ',
            companyContext: '  Demo Brand factory context  ',
            slugTemplate: '  slug guide  ',
            shortTemplate: '  short guide  ',
            fullTemplate: '  full guide  ',
        },
    );

    assert.equal(task.taskType, 'product');
    assert.equal(task.targetId, 2067);
    assert.deepEqual(task.fields, ['description', 'aioseo_title']);
    assert.deepEqual(task.payload, {
        keyword: 'BQ 2067 elbow product sample',
        coreKeyword: 'BQ 2067 elbow product sample',
        seo_keywords: 'BQ 2067 elbow product sample',
        keyword_context: 'product sample keyword database',
        company_context: 'Demo Brand factory context',
        language: 'en',
        slugTemplate: 'slug guide',
        shortTemplate: 'short guide',
        fullTemplate: 'full guide',
        short_description: 'Draft specs',
        description: 'Draft description',
        short_ref_images: 'https://example.com/wp-content/uploads/sku-alpha-spec.webp',
        full_ref_images: 'https://example.com/wp-content/uploads/sku-alpha-detail.webp',
        useShortDescriptionImages: false,
        useDetailSlices: true,
    });
});

test('product daily SEO task allows a missing core keyword without adding defaults', () => {
    const task = buildProductDailySeoTask(
            {
                id: 2067,
                name: 'SKU-ALPHA Elbow Product Sample',
            },
            {
                fields: ['description'],
                seoKeywords: '   ',
            },
        );
    assert.equal(task.payload.keyword, undefined);
    assert.equal(task.payload.coreKeyword, undefined);
    assert.equal(task.payload.seo_keywords, undefined);
});

test('SEO keyword helper text describes the active WooCommerce fields', () => {
    assert.match(SEO_KEYWORDS_HELP_TEXT, /SEO 核心关键词/);
    assert.match(SEO_KEYWORDS_HELP_TEXT, /Slug/);
    assert.match(SEO_KEYWORDS_HELP_TEXT, /短描述/);
    assert.match(SEO_KEYWORDS_HELP_TEXT, /详细描述/);
    assert.match(SEO_KEYWORDS_HELP_TEXT, /标签/);
    assert.doesNotMatch(SEO_KEYWORDS_HELP_TEXT, /AIOSEO/);
    assert.doesNotMatch(SEO_KEYWORDS_HELP_TEXT, /ACF Extra Info/);
});

test('short description preview renders generated tables like WooCommerce spec grids', () => {
    assert.match(PRODUCT_SHORT_DESCRIPTION_PREVIEW_CLASS, /\[&_table\]:border-collapse/);
    assert.match(PRODUCT_SHORT_DESCRIPTION_PREVIEW_CLASS, /\[&_th\]:border/);
    assert.match(PRODUCT_SHORT_DESCRIPTION_PREVIEW_CLASS, /\[&_td\]:border/);
    assert.match(PRODUCT_SHORT_DESCRIPTION_PREVIEW_CLASS, /\[&_th\]:font-bold/);
    assert.match(PRODUCT_SHORT_DESCRIPTION_PREVIEW_CLASS, /\[&_td\]:p/);
});

test('product SEO JSON normalization strips echoed prompt labels', () => {
    const output = normalizeProductSeoOutput(
        {
            productId: 1,
            productName: 'MODEL-009 Camera Strap',
            currentShortDescription: '',
            currentDescription: '',
            template: '',
        },
        {
            short_description: 'Primary keyword: camera strap for enterprises',
            description: '=== TARGET SEO KEYWORDS ===\nCommercial compact holder for guest workspaces.',
            acf_seo_extra_info: 'Additional Context: Durable product holder for guest facilities.',
            aioseo_title: 'Primary keyword guidance: camera strap for enterprises',
            aioseo_description: 'Keyword usage rules: camera strap for enterprises supports bulk deployment site projects.',
        },
    );

    const combined = Object.values(output).join(' ');
    assert.doesNotMatch(combined, /Primary keyword|TARGET SEO KEYWORDS|Additional Context|Keyword usage rules/i);
    assert.equal(output.aioseo_title, 'MODEL-009 Camera Strap');
});

test('product SEO normalization repairs generic procurement titles without forcing a built-in brand', () => {
    const output = normalizeProductSeoOutput(
        {
            productId: 19,
            productName: 'MODEL-004 White portable lantern',
            currentShortDescription: '',
            currentDescription: '',
            template: '',
        },
        {
            short_description: 'White portable lantern for deployment sites.',
            description: 'MODEL-004 white compact portable lantern for deployment site projects.',
            acf_seo_extra_info: 'White MODEL-004 portable lantern for facility deployment sites.',
            aioseo_title: 'Commercial portable lantern - Bulk B2B Supply',
            aioseo_description: 'Commercial portable lantern for wholesale deployment site projects.',
        },
    );

    assert.equal(output.aioseo_title, 'MODEL-004 White portable lantern');
    assert.doesNotMatch(output.aioseo_title, /\b(commercial|bulk|b2b|wholesale|supplier)\b/i);
});

test('product category warning notices are short and deduplicated', () => {
    const notice = buildProductCategoryWarningNotice([
        '<html><head><title>415 Unsupported Media Type</title></head><script>bad()</script></html>',
        '<html><head><title>415 Unsupported Media Type</title></head><script>bad2()</script></html>',
    ]);

    assert.equal(notice, '分类已使用本地缓存；WooCommerce 实时分类读取失败: 415 Unsupported Media Type');
    assert.doesNotMatch(notice, /<html|<script/i);
});

test('product issue filters show only matching detail sections for specific problems', () => {
    assert.equal(shouldShowProductDetailSection('full_description_empty', 'description'), true);
    assert.equal(shouldShowProductDetailSection('full_description_empty', 'aioseo'), false);

    assert.equal(shouldShowProductDetailSection('aioseo_description_is_default_or_empty', 'aioseo'), true);
    assert.equal(shouldShowProductDetailSection('aioseo_description_is_default_or_empty', 'description'), false);

});

test('broad product issue filters keep all detail sections accessible', () => {
    for (const filter of ['', 'needs_attention', 'generated_not_synced']) {
        assert.equal(shouldShowProductDetailSection(filter, 'description'), true);
        assert.equal(shouldShowProductDetailSection(filter, 'aioseo'), true);
    }
});

test('product detail bottom actions keep save sync and collapse available after long edits', () => {
    const theme = {
        cardBorder: 'border-slate-200',
    };
    const html = renderToStaticMarkup(React.createElement(ProductDetailActions, {
        theme,
        isEditingProduct: true,
        syncing: false,
        placement: 'bottom',
        onCancel: () => undefined,
        onSave: () => undefined,
        onBeginEdit: () => undefined,
        onSync: () => undefined,
        onCollapse: () => undefined,
    }));

    assert.match(html, /data-testid="product-detail-actions-bottom"/);
    assert.match(html, /保存修改/);
    assert.match(html, /同步SEO到WordPress/);
    assert.match(html, /收起详情/);
});

test('product detail sync action is disabled when WordPress sync is unavailable', () => {
    const theme = {
        cardBorder: 'border-slate-200',
    };
    const html = renderToStaticMarkup(React.createElement(ProductDetailActions, {
        theme,
        isEditingProduct: false,
        syncing: false,
        placement: 'top',
        canSyncToWordPress: false,
        onCancel: () => undefined,
        onSave: () => undefined,
        onBeginEdit: () => undefined,
        onSync: () => undefined,
    }));

    assert.match(html, /disabled=""/);
    assert.match(html, /请先配置 WordPress 网址、用户名和应用密码/);
});

test('product dashboard passes and applies the WordPress sync gate', async () => {
    const { readFile } = await import('node:fs/promises');
    const appSource = await readFile(new URL('../../App.tsx', import.meta.url), 'utf8');
    const dashboardSource = await readFile(new URL('../../components/ProductSeoDashboard.tsx', import.meta.url), 'utf8');

    assert.match(appSource, /<ProductSeoDashboard[\s\S]*canSyncToWordPress=\{canSyncBlogToWordPress\}/);
    assert.match(dashboardSource, /canSyncToWordPress\?: boolean/);
    assert.match(dashboardSource, /if \(!canSyncToWordPress\) \{[\s\S]*请先在系统配置中填写 WordPress 网址、用户名和应用密码/);
    assert.match(dashboardSource, /const batchSyncDisabled = Boolean\([\s\S]*!canSyncToWordPress/);
    assert.match(dashboardSource, /disabled=\{batchSyncDisabled\}/);
});

test('product dashboard toolbar uses shared controls and compact field chips', async () => {
    const { readFile } = await import('node:fs/promises');
    const dashboardSource = await readFile(new URL('../../components/ProductSeoDashboard.tsx', import.meta.url), 'utf8');

    assert.match(dashboardSource, /import\s+\{[^}]*\bButton\b[^}]*\}\s+from '\.\/ui'/s);
    assert.match(dashboardSource, /product-seo-toolbar/);
    assert.match(dashboardSource, /product-seo-field-chip/);
    assert.match(dashboardSource, /product-seo-action-group/);
    assert.match(dashboardSource, /本次生成\/同步字段/);
    assert.match(dashboardSource, /handleGenerateField\(p, 'slug'\)/);
    assert.doesNotMatch(dashboardSource, /enabledProductFields\?:/);
    assert.doesNotMatch(dashboardSource, /field !== 'slug'/);
    assert.doesNotMatch(dashboardSource, /ACF Extra Info/);
    assert.doesNotMatch(dashboardSource, /bg-purple-600 hover:bg-purple-500 text-white text-sm font-bold py-2 px-4 rounded-lg/);
    assert.doesNotMatch(dashboardSource, /bg-green-600 hover:bg-green-500 text-white text-sm font-bold py-2 px-5 rounded-lg/);
});

test('product batch failed errors can be grouped for precise retry requests', () => {
    const groups = groupProductBatchGenerateErrorsByField([
        { product_id: 101, field: 'description', error: 'Gemini HTTP 429 after retries' },
        { product_id: 102, field: 'description', error: 'EOF occurred in violation of protocol' },
        { product_id: 101, field: 'aioseo_description', error: 'timeout' },
        { product_id: 999, field: 'slug', error: 'slug is not generated by AI' },
    ]);

    assert.deepEqual(groups, [
        { fields: ['description'], ids: [101, 102] },
        { fields: ['aioseo_description'], ids: [101] },
        { fields: ['slug'], ids: [999] },
    ]);
});

test('product batch generation rejects ok false responses even with generated counts', () => {
    assert.throws(
        () => validateProductBatchGenerateResponse({
            ok: false,
            updated_products: 1,
            generated_fields: 2,
            detail: 'AI provider failed before saving all selected fields',
        }),
        /AI provider failed before saving all selected fields/,
    );
});

test('product batch retry only treats transient provider errors as automatic retry candidates', () => {
    assert.equal(isRetryableProductBatchGenerateError({ error: 'Gemini HTTP 429 after retries' }), true);
    assert.equal(isRetryableProductBatchGenerateError({ error: 'EOF occurred in violation of protocol' }), true);
    assert.equal(isRetryableProductBatchGenerateError({ error_type: 'TransportError', error: 'oauth2 token timeout' }), true);
    assert.equal(isRetryableProductBatchGenerateError({ error: 'Invalid field: slug' }), false);
});

test('product batch feedback renders failures and retry action', () => {
    const html = renderToStaticMarkup(React.createElement(ProductBatchGenerateFeedback, {
        feedback: {
            status: 'partial',
            message: '批量 AI 部分完成：还有 2 项失败，可重试失败项',
            requestedProducts: 10,
            requestedFields: 10,
            updatedProducts: 8,
            generatedFields: 8,
            failed: 2,
            errors: [
                { product_id: 101, name: 'BQ-6001', field: 'description', error: 'Gemini HTTP 429 after retries' },
                { product_id: 102, name: 'BQ-6002', field: 'aioseo_description', error: 'EOF occurred in violation of protocol' },
            ],
            initialConcurrency: 10,
            finalConcurrency: 5,
            rateLimitThrottles: 1,
            autoRetryAttempted: true,
        },
        retryDisabled: false,
        onRetry: () => undefined,
        onDismiss: () => undefined,
    }));

    assert.match(html, /data-testid="product-batch-generate-feedback"/);
    assert.match(html, /重试失败项/);
    assert.match(html, /详细描述/);
    assert.match(html, /AIOSEO 描述/);
    assert.match(html, /并发 10 → 5/);
    assert.match(html, /已自动重试 1 次/);
});

test('product review batch notice reports sync failures instead of unconditional success', () => {
    assert.equal(
        buildProductReviewBatchNotice(true, { applied: 3, failed: 2 }),
        '产品 SEO 同步完成：成功 3，失败 2（请检查失败项）',
    );
    assert.equal(
        buildProductReviewBatchNotice(true, { applied: 0, failed: 1 }),
        '产品 SEO 同步失败：失败 1（请检查失败项）',
    );
    assert.equal(
        buildProductReviewBatchNotice(true, { applied: 4, failed: 0 }),
        '已同步 4 条产品 SEO 到 WordPress！',
    );
    assert.equal(
        buildProductReviewBatchNotice(false, { updated: 5 }),
        '已批准 5 个产品 SEO 草稿',
    );
});

test('product review batch rejects ok false and all-failed sync responses', () => {
    assert.throws(
        () => validateProductReviewBatchResponse(true, {
            ok: false,
            applied: 2,
            failed: 0,
            errors: [{ product_id: 9481, product_name: 'Product sample', error: 'AIOSEO update failed' }],
        }),
        /AIOSEO update failed|product seo/i,
    );

    assert.throws(
        () => validateProductReviewBatchResponse(true, {
            ok: true,
            applied: 0,
            failed: 1,
            errors: [{ product_id: 9481, product_name: 'Product sample', error: 'WooCommerce 403' }],
        }),
        /WooCommerce 403/,
    );
});

test('single product sync rejects ok false and all-failed responses', () => {
    assert.throws(
        () => validateProductSingleSyncResponse({
            ok: false,
            skipped: false,
            synced_fields: ['aioseo_title'],
            detail: 'WooCommerce rejected SEO update',
        }),
        /WooCommerce rejected SEO update/,
    );

    assert.throws(
        () => validateProductSingleSyncResponse({
            skipped: false,
            synced_fields: [],
            failed: 1,
            errors: [{ product_id: 9481, error: 'AIOSEO REST update failed' }],
        }),
        /AIOSEO REST update failed/,
    );

    assert.deepEqual(
        validateProductSingleSyncResponse({
            skipped: false,
            synced_fields: ['aioseo_title'],
        }),
        {
            skipped: false,
            synced_fields: ['aioseo_title'],
        },
    );
});

test('product batch sync notice includes failed item details from backend response', () => {
    const notice = buildProductBatchSyncNotice({
        applied: 2,
        skipped: 1,
        failed: 2,
        errors: [
            { product_id: 9481, name: 'Demo Brand product sample', error: 'WooCommerce 500' },
            { product_id: 9482, product_name: 'Paper holder', error: 'timeout' },
        ],
    });

    assert.match(notice, /同步完成：成功 2，跳过 1，失败 2/);
    assert.match(notice, /#9481 Demo Brand product sample: WooCommerce 500/);
    assert.match(notice, /#9482 Paper holder: timeout/);
});

test('product batch sync rejects ok false and all-failed responses', () => {
    assert.throws(
        () => validateProductBatchSyncResponse({
            ok: false,
            applied: 1,
            skipped: 0,
            failed: 0,
            detail: 'Batch sync transaction failed',
        }),
        /Batch sync transaction failed/,
    );

    assert.throws(
        () => validateProductBatchSyncResponse({
            applied: 0,
            skipped: 0,
            failed: 1,
            errors: [{ product_id: 9481, name: 'Product sample', error: 'WordPress rejected update' }],
        }),
        /WordPress rejected update/,
    );
});

test('product scan follows its own queued task and reconciles backend restarts', async () => {
    const source = await import('node:fs/promises').then(fs => (
        fs.readFile(new URL('../../components/ProductSeoDashboard.tsx', import.meta.url), 'utf8')
    ));

    assert.match(source, /waitForBackgroundTask\(task/);
    assert.match(source, /followProductScanTask\(started\.task/);
    assert.match(source, /started\.task\.status === 'queued'/);
    assert.match(source, /reconcileStoredBackgroundTask/);
    assert.doesNotMatch(source, /waitForProductScanReportIdle/);
});

test('product scan start rejects ok false responses before polling', async () => {
    const source = await import('node:fs/promises').then(fs => (
        fs.readFile(new URL('../../components/ProductSeoDashboard.tsx', import.meta.url), 'utf8')
    ));

    const scanRequestIndex = source.indexOf("requestJson<ProductOkMutationResponse>('/product-scan')");
    assert.notEqual(scanRequestIndex, -1);
    assert.notEqual(source.indexOf("'Product scan failed'", scanRequestIndex), -1);
    assert.doesNotMatch(source, /requestVoid\('\/product-scan'\)/);
});

test('product scan permission errors are shown as inline WooCommerce guidance', async () => {
    const dashboardModule = await import('../../components/ProductSeoDashboard.tsx') as Record<string, any>;
    const source = await import('node:fs/promises').then(fs => (
        fs.readFile(new URL('../../components/ProductSeoDashboard.tsx', import.meta.url), 'utf8')
    ));

    assert.equal(
        dashboardModule.formatProductActionError('Sorry, you cannot list resources. Check WooCommerce REST key/secret and make sure the key/user can read WooCommerce products.'),
        'WooCommerce 产品 API 没有读取权限。请到设置里检查 Consumer Key / Secret 是否有 Read 或 Read/Write 权限，并确认这个 key 属于有权读取产品的账号。',
    );
    assert.equal(
        dashboardModule.getProductActionErrorCtaLabel('WooCommerce 产品 API 没有读取权限。请到设置里检查 Consumer Key / Secret 是否有 Read 或 Read/Write 权限，并确认这个 key 属于有权读取产品的账号。'),
        '检查 WooCommerce 权限',
    );
    assert.equal(
        dashboardModule.formatProductActionError('Missing WC key/secret and WP user/app password. Please configure credentials first.'),
        '还没有配置 WooCommerce Consumer Key / Secret。请先在设置里填写 WooCommerce REST API 凭据。',
    );
    assert.equal(
        dashboardModule.getProductActionErrorCtaLabel('还没有配置 WooCommerce Consumer Key / Secret。请先在设置里填写 WooCommerce REST API 凭据。'),
        '配置 WooCommerce',
    );
    assert.match(source, /data-testid="product-seo-inline-feedback"/);
    assert.match(source, /检查 WooCommerce 权限/);
});

test('product SEO toolbar wraps filters by container width so sidebar windows do not overflow', async () => {
    const fs = await import('node:fs/promises');
    const styles = await fs.readFile(new URL('../../src/styles.css', import.meta.url), 'utf8');
    const dashboardSource = await fs.readFile(new URL('../../components/ProductSeoDashboard.tsx', import.meta.url), 'utf8');
    const toolbarStyles = styles.slice(
        styles.indexOf('.product-seo-filter-layout'),
        styles.indexOf('.product-seo-control-label'),
    );

    assert.match(toolbarStyles, /\.product-seo-filter-primary-row[\s\S]*grid-template-columns:\s*max-content\s*minmax\(0,\s*1fr\)/);
    assert.match(toolbarStyles, /\.product-seo-filter-select-row[\s\S]*grid-template-columns:\s*minmax\(260px,\s*1fr\)\s*minmax\(260px,\s*1fr\)/);
    assert.match(toolbarStyles, /grid-template-columns:\s*minmax\(220px,\s*1fr\)\s*minmax\(210px,\s*max-content\)/);
    assert.match(toolbarStyles, /\.product-seo-filter-control \.arco-select-view[\s\S]*background:\s*var\(--system-surface\)/);
    assert.match(styles, /\.product-seo-toolbar-section-filters[\s\S]*container-type:\s*inline-size/);
    assert.match(styles, /@container\s*\(max-width:\s*980px\)[\s\S]*\.product-seo-filter-primary-row[\s\S]*grid-template-columns:\s*minmax\(150px,\s*220px\)\s*minmax\(0,\s*1fr\)/);
    assert.match(styles, /@container\s*\(max-width:\s*980px\)[\s\S]*\.product-seo-search-group[\s\S]*min-width:\s*0/);
    assert.match(styles, /@container\s*\(max-width:\s*680px\)[\s\S]*\.product-seo-filter-primary-row,[\s\S]*\.product-seo-filter-select-row[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
    assert.match(styles, /\.product-seo-search-actions[\s\S]*display:\s*flex/);
    assert.doesNotMatch(toolbarStyles, /minmax\(430px/);
    assert.doesNotMatch(toolbarStyles, /minmax\(180px,\s*260px\)/);
    assert.match(styles, /\.product-seo-toolbar[\s\S]*overflow:\s*visible/);
    assert.match(dashboardSource, /product-seo-filter-primary-row/);
    assert.match(dashboardSource, /product-seo-filter-select-row/);
    assert.match(dashboardSource, /product-seo-category-select/);
    assert.match(dashboardSource, /product-seo-issue-select/);
    assert.match(dashboardSource, /dropdownMenuClassName="product-seo-filter-menu product-seo-category-menu"/);
    assert.match(dashboardSource, /dropdownMenuClassName="product-seo-filter-menu product-seo-issue-menu"/);
    assert.match(dashboardSource, /aria-label="产品分类筛选"/);
    assert.match(dashboardSource, /aria-label="产品问题筛选"/);
    assert.match(dashboardSource, /triggerProps=\{\{\s*autoAlignPopupWidth:\s*false,\s*autoAlignPopupMinWidth:\s*true\s*\}\}/);
    assert.match(dashboardSource, /dropdownMenuStyle=\{\{\s*minWidth:\s*3[0-9]{2},\s*maxWidth:\s*[45][0-9]{2}\s*\}\}/);
    assert.match(dashboardSource, /visibleProductIssueOptions\.map\(\(opt\)/);
    assert.match(dashboardSource, /label:\s*`\$\{opt\.label\} \(\$\{issueSummary\[opt\.key\] \|\| 0\}\)`/);
    assert.match(dashboardSource, /当前筛选没有匹配产品或问题/);
    assert.match(dashboardSource, /<Button variant="primary" onClick=\{handleScan\} disabled=\{isRunning\}>/);
});

test('product SEO table keeps desktop columns readable in narrow app windows', async () => {
    const dashboardSource = await import('node:fs/promises').then(fs => (
        fs.readFile(new URL('../../components/ProductSeoDashboard.tsx', import.meta.url), 'utf8')
    ));

    assert.match(dashboardSource, /className="product-seo-table"/);
    assert.match(dashboardSource, /scroll=\{\{\s*x:\s*PRODUCT_SEO_TABLE_SCROLL_X\s*\}\}/);
    assert.match(dashboardSource, /rowSelection=\{\{/);
    assert.match(dashboardSource, /columnWidth:\s*PRODUCT_SEO_TABLE_SELECTION_WIDTH/);
    assert.match(dashboardSource, /expandProps=\{\{\s*width:\s*PRODUCT_SEO_TABLE_EXPAND_WIDTH\s*\}\}/);
    assert.match(dashboardSource, /const PRODUCT_SEO_TABLE_SCROLL_X\s*=\s*9[0-9]{2}/);
    assert.doesNotMatch(dashboardSource, /title:\s*'ID',\s*dataIndex:\s*'id'/);
    assert.match(dashboardSource, /title:\s*'产品名称',\s*dataIndex:\s*'name',\s*width:\s*396/);
    assert.doesNotMatch(dashboardSource, /dataIndex:\s*'selected'/);
    assert.doesNotMatch(dashboardSource, /title:\s*'简短描述',\s*dataIndex:\s*'short_description'/);
    assert.doesNotMatch(dashboardSource, /title:\s*'更新时间',\s*dataIndex:\s*'updated_at'/);
    assert.match(dashboardSource, /product-seo-status-updated/);
    assert.match(dashboardSource, /placeholder="全部分类"/);
    assert.match(dashboardSource, /showSearch/);
});

test('product scan route exposes later page failures as dashboard warnings', async () => {
    const cliSource = await import('node:fs/promises').then(fs => (
        fs.readFile(new URL('../../src/cli.ts', import.meta.url), 'utf8')
    ));

    assert.match(
        cliSource,
        /lastWarning:\s*string \| null/,
    );
    assert.match(
        cliSource,
        /state\.lastWarning = result\.warnings\[0\] \|\| null;/,
    );
    assert.match(
        cliSource,
        /Product scan partially completed: stopped at WooCommerce page/,
    );
});

test('product SEO image helper throws when every supplied image fails', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => (
        new Response('Forbidden image', {
            status: 403,
            statusText: 'Forbidden',
            headers: { 'Content-Type': 'text/plain' },
        })
    )) as typeof fetch;

    try {
        await assert.rejects(
            () => fetchProductSeoImageParts(['https://wp.example/uploads/ref.webp']),
            /Unable to load product reference images.*ref\.webp.*403 Forbidden/s,
        );
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('product SEO image helper keeps usable images when some downloads fail', async () => {
    const originalFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = (async () => {
        calls += 1;
        if (calls === 1) {
            return new Response('Forbidden image', { status: 403, statusText: 'Forbidden' });
        }
        return new Response(new Uint8Array([1, 2, 3]), {
            status: 200,
            headers: { 'Content-Type': 'image/webp' },
        });
    }) as typeof fetch;

    try {
        const parts = await fetchProductSeoImageParts([
            'https://wp.example/uploads/blocked.webp',
            'https://wp.example/uploads/ok.webp',
        ]);

        assert.equal(parts.length, 1);
        assert.deepEqual(parts[0], { inlineData: { data: 'AQID', mimeType: 'image/webp' } });
    } finally {
        globalThis.fetch = originalFetch;
    }
});
