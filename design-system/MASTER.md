# 独立站 AI 桌面端 UI 实施标准

本文件是仓库内 UI 布局、排版和溢出行为的唯一实施标准。`docs/ui-redesign-spec.md` 仅保留历史视觉方向；发生冲突时以本文件为准。

## 支持范围与验收矩阵

- 产品形态：Electron 桌面端和同尺寸浏览器端。
- 最小支持宽度：1100px；不要求实现手机端工作流。
- 固定验收尺寸：`1100×720`、`1320×860`、`1600×900`。
- 每个尺寸验证浅色与深色主题，以及 100%、125%、150% 文本/页面缩放。
- 150% 缩放时允许表格或明确标注的局部区域滚动，但文字不得跑出组件、按钮不得重叠、关键操作不得被裁掉。

## 布局契约

### Flex 与 Grid

- 所有可能承载动态文本的 Flex/Grid 子项必须设置 `min-width: 0`。
- 工具栏分为主内容和操作区；操作区必须允许换行，空间不足时先换行或堆叠，禁止继续压缩文字。
- 表单列使用 `minmax(0, 1fr)`；不得用不可收缩的固定列宽承载动态文案。
- 间距使用现有 4/8px token，不在业务页面新增随机间距值。

### 文本策略

- 标题、说明、表单标签默认自然换行。
- URL、文件名、ID、错误详情和连续英文字符串必须使用 `overflow-wrap: anywhere`。
- 只有元数据、状态标签和明确的紧凑列表项可以截断；截断必须显示完整 Tooltip。
- 正文不得靠缩小到 12px 以下解决拥挤。
- 按钮文字保持单行；空间不足由按钮组换行或堆叠。

### 组件策略

- 使用 `OverflowText` 明确选择 `wrap`、`truncate` 或 `break-anywhere`。
- 使用 `ActionGroup` 承载两个及以上并列操作。
- 使用 `Toolbar` 的 `start` 与 `actions` 区域组织工具栏。
- 所有宽表格必须放在 `TableShell` 内，通过局部横向滚动保持列可读。
- Badge、StatusPill 默认单行省略并提供 Tooltip；不得无限撑宽父容器。
- Tabs 由 Arco 的滚动容器处理空间不足，不设置固定标签最小宽度。

## 受控溢出

任何有意产生滚动、截断或裁剪的元素必须声明 `data-overflow-policy`：

- `data-overflow-policy="x-scroll"`：表格、标签条等局部横向滚动。
- `data-overflow-policy="y-scroll"`：弹窗内容区、长列表等局部纵向滚动。
- `data-overflow-policy="truncate"`：带 Tooltip 的单行或多行省略。
- `data-overflow-policy="clip-media"`：图片、视频、对比滑块等纯视觉裁剪。
- `data-overflow-policy="app-shell"`：拥有明确内部滚动区的应用壳；该策略只豁免壳元素自身，不豁免后代。

禁止用页面级 `overflow-x: hidden` 掩盖未知溢出。`overflow: hidden` 仅允许用于：

1. 带 `clip-media` 的媒体裁剪；
2. 带 `app-shell` 且存在明确内部滚动区的应用壳/弹窗；
3. 纯装饰圆角裁剪，不包含动态文本或交互操作。

## 高风险模式

新增以下写法前必须在代码旁或页面例外文档中说明理由：

- `whitespace-nowrap`
- `overflow: hidden` / `overflow-x: hidden`
- 动态文本容器上的固定 `width`、`height`、`min-width`
- 不带 `minmax(0, ...)` 的多列 Grid
- 同一行超过四个文字按钮

## 页面例外

页面确需偏离本标准时，在 `design-system/pages/<page>.md` 新增例外，写明：适用选择器、原因、允许的溢出策略和对应测试。不存在页面例外文件时，完全遵循本 Master。

## 交付检查

所有 UI 变更必须运行：

```bash
npm run verify:ui
```

人工 QA 至少覆盖页面身份、首屏非空、无 Vite/React 错误层、控制台健康、目标交互和 1100px 最小窗口截图。
