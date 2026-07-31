import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('Blog framework workbench shows a complete article blueprint instead of a field summary', async () => {
  const source = await readFile(new URL('../../components/BlogFrameworkStandardWorkbench.tsx', import.meta.url), 'utf8');

  assert.match(source, /AI 最终按这张施工图生成文章/);
  assert.match(source, /生成前必须提供/);
  assert.match(source, /文章标题 H1/);
  assert.match(source, /开头：直接回答/);
  assert.match(source, /FAQ/);
  assert.match(source, /结尾 CTA/);
  assert.match(source, /发布前检查/);
  assert.match(source, /禁止编造/);
  assert.match(source, /已保存框架/);
  assert.match(source, /AI 修改后/);
  assert.match(source, /恢复内置默认/);
  assert.match(source, /撤销本轮/);
  assert.match(source, /高级设置/);
  assert.match(source, /Toolbar/);
  assert.match(source, /ActionGroup/);
  assert.match(source, /OverflowText/);
  assert.match(source, /className="ui-prompt-stack mt-auto min-w-0 pt-3"/);
  assert.match(source, /data-overflow-policy="y-scroll"/);
});

test('Blog framework workbench uses scrollable top tabs and an adaptive content grid', async () => {
  const source = await readFile(new URL('../../components/BlogFrameworkStandardWorkbench.tsx', import.meta.url), 'utf8');

  assert.match(source, /blog-framework-workbench__tab-row/);
  assert.match(source, /<TabsList/);
  assert.match(source, /<TabButton/);
  assert.match(source, /data-overflow-policy="x-scroll"/);
  assert.doesNotMatch(source, /extra=\{<ArcoButton[^>]*>\s*新增自定义框架/s);
  assert.match(source, /<ActionGroup[^>]*className="blog-framework-workbench__tab-action"[\s\S]*新增自定义框架/);
  assert.match(source, /blog-framework-workbench__content-grid/);
  assert.match(source, /文章类型代码/);
  assert.doesNotMatch(source, /blog-framework-workbench__selector/);
});

test('Skill factory delegates Blog framework editing to the focused workbench', async () => {
  const source = await readFile(new URL('../../components/SkillFactoryDashboard.tsx', import.meta.url), 'utf8');

  assert.match(source, /BlogFrameworkStandardWorkbench/);
  assert.doesNotMatch(source, /frameworkAiBrief/);
  assert.doesNotMatch(source, /handleGenerateFrameworkDraft/);
});
