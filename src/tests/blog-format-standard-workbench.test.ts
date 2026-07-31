import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('Blog format standard workbench uses AI feedback and an A1 before-after preview', async () => {
  const source = await readFile(new URL('../../components/BlogFormatStandardWorkbench.tsx', import.meta.url), 'utf8');

  assert.match(source, /AI 格式工作台/);
  assert.match(source, /原格式/);
  assert.match(source, /新格式/);
  assert.match(source, /改动清单/);
  assert.match(source, /保存为博客标准/);
  assert.match(source, /scanBlogFormatStandard/);
  assert.match(source, /reviseBlogFormatStandard/);
  assert.match(source, /className="ui-prompt-stack mt-4 min-w-0"/);
  assert.doesNotMatch(source, /下载样式插件|校验 WordPress/);
});

test('Skill factory presents Blog format and framework summaries before advanced settings', async () => {
  const source = await readFile(new URL('../../components/SkillFactoryDashboard.tsx', import.meta.url), 'utf8');
  const frameworkSource = await readFile(new URL('../../components/BlogFrameworkStandardWorkbench.tsx', import.meta.url), 'utf8');

  assert.match(source, /BlogFormatStandardWorkbench/);
  assert.match(source, /BlogFrameworkStandardWorkbench/);
  assert.match(frameworkSource, /博客撰写框架 AI 工作台/);
  assert.match(frameworkSource, /高级设置/);
});

test('Skill factory section headers use the shared toolbar and action-group contracts', async () => {
  const source = await readFile(new URL('../../components/SkillFactoryDashboard.tsx', import.meta.url), 'utf8');

  assert.ok((source.match(/<Toolbar\b/g) || []).length >= 6);
  for (const heading of ['品牌启动器', '博客格式标准', 'FAQ 库', '统一字段规则', '反馈迭代', 'WooCommerce 规则']) {
    assert.match(source, new RegExp(`<Toolbar[\\s\\S]{0,700}${heading}`));
  }
  assert.match(source, /<ActionGroup className="skill-faq-header-actions" minItemWidth=\{116\}>[\s\S]{0,900}手动新增 FAQ/);
});

test('Blog repair identifies the saved standard without plugin actions', async () => {
  const source = await readFile(new URL('../../components/BlogFormatDashboard.tsx', import.meta.url), 'utf8');

  assert.match(source, /当前博客标准/);
  assert.match(source, /调整格式标准/);
  assert.doesNotMatch(source, /下载样式插件/);
});
