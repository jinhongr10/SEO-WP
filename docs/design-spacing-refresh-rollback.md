# 视觉间距优化回退预案

## 目标

本次视觉间距优化只调整基础 UI token、组件间距和新版预览入口，不改变业务流程、数据结构或后端接口。若上线后发现布局错位、表格密度异常、弹窗遮挡或移动端不可用，可以按下面三层方案回退。

## 变更边界

- 基础样式：`src/styles.css`
- 预览页面：`components/DesignSpacingPreview.tsx`
- 导航入口：`appTabs.ts`、`App.tsx`
- 文档：`docs/design-spacing-refresh-rollback.md`

## 源码回退

推荐在实施前创建独立分支和基线 tag：

```bash
git switch -c design-spacing-refresh
git tag pre-design-spacing-refresh
```

提交建议拆成三类：

```bash
git commit -m "style: refresh ui spacing tokens"
git commit -m "feat: add design spacing preview"
git commit -m "docs: add design refresh rollback plan"
```

需要撤回时，优先撤样式 token，再按需撤预览入口：

```bash
git revert <style-token-commit-sha>
git revert <preview-commit-sha>
```

## 包版本回退

如果未来把这套改动发布成依赖包，先发 prerelease，不直接覆盖稳定版：

```bash
npm version prerelease --preid spacing-preview
```

业务项目验证失败时，把依赖锁回上一稳定版，例如：

```bash
npm install @arco-design/web-react@2.66.15
```

## 业务接入回退

如果某个业务项目只想试用新版样式，应把接入样式单独放在一个入口中，例如：

```ts
import './arco-spacing-preview.less';
```

发现异常时只删除该 import，或恢复原始 `ConfigProvider.size` / `componentConfig` 配置。

## 回退触发条件

- 核心页面出现明显遮挡、重叠、横向溢出。
- 表格、表单、弹窗高度变化影响业务操作。
- 深色模式、移动端、RTL 任一关键场景不可用。
- 构建、测试或截图回归失败且无法当天修复。

## 回退后验证

```bash
npm run build:web
npm test
```

同时人工检查：中控台、设置弹窗、图片处理、博客工作台、页面计划和新版视觉预览入口是否恢复稳定。
