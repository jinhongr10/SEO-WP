# 博客撰写框架 AI 工作台设计

## 目标

把站点资料中的“博客写作框架”从大量字段编辑器升级为 AI 对话工作台。普通用户直接使用系统内置框架，通过自然语言修改一类文章的写法，在完整文章施工图中确认影响后保存为站点标准；未保存草稿不影响 Blog AI，也不修改任何历史文章。

## 产品边界

- 系统内置并维护 5 类不可变基线：标准买家指南、展会复盘、证书说明、项目案例、产品视频博客。
- 新站点无需配置即可使用内置基线。AI 修改产生站点级副本，系统基线始终保留，以支持恢复默认。
- AI 默认只修改当前选中的框架。切换框架时保留本次会话中的未保存草稿。
- 保存操作发布整套站点框架标准并递增版本；保存前 Blog AI 继续读取上一个已生效版本。
- 恢复默认只把当前框架重置成内置基线草稿，不自动保存，不影响其他框架。
- 当前文章大纲与站点长期框架严格区分：站点资料工作台只编辑长期框架；Blog AI 中针对某篇文章的要求只进入该文章草稿。用户表述有歧义时，AI 只追问一次。
- 历史文章、博客视觉格式和 Gutenberg 样式写回不属于本工作台职责。

## 数据模型

新增站点级包装结构，现有 `BlogFramework` 字段作为单个框架的内容主体继续兼容：

```ts
type BlogFrameworkStandardStatus = "default" | "configured";

interface BlogFrameworkStandard {
  status: BlogFrameworkStandardStatus;
  version: number;
  basePresetVersion: number;
  name: string;
  frameworks: BlogFramework[];
  updatedAt: string;
}

interface BlogFrameworkAssistantRequest {
  frameworkId: string;
  message: string;
  standard: BlogFrameworkStandard;
  conversation: Array<{ role: "user" | "assistant"; content: string }>;
}

interface BlogFrameworkChange {
  path: string;
  label: string;
  before: unknown;
  after: unknown;
  reason: string;
}

interface BlogFrameworkAssistantResult {
  standard: BlogFrameworkStandard;
  reply: string;
  changes: BlogFrameworkChange[];
  warnings: string[];
  clarification?: string;
}
```

- 读取旧站点的 `blogFrameworks` 数组时，将其迁移包装为 `configured` v1；缺失或空数组映射为 `default` v0 的内置 5 类框架。
- 一个兼容周期内，站点资料响应同时保留 `blogFrameworks` 和新增 `blogFrameworkStandard`。旧写入接口继续可用，但内部统一归一化到新结构。
- 所有 AI 返回必须经过白名单结构校验；只允许修改当前 `frameworkId`，不得改变其他框架、版本号或系统基线。

## 默认框架内容

每个框架都是 AI 生成整篇文章时读取的施工图，至少包含以下六层：

1. 文章任务：文章类型、营销漏斗阶段、默认语言、目标读者和建议篇幅。
2. 写前资料：主题、关键词、目标市场、产品/项目/活动事实、已审核 FAQ、有效内链和可用媒体。
3. 语气与可读性：按受众调节专业度，术语配通俗解释，主动语态为主，句长和段落节奏自然。
4. 文章结构：H1、开头、H2/H3、条件区块、FAQ、媒体、内链和 CTA 的位置、意图与必选状态。
5. SEO 与增强规则：关键词自然分布、E-E-A-T 证据、长尾问题、图片 Alt、真实工具/资源与趋势引用。
6. 发布前检查与禁止项：资料证据、逻辑、搜索意图、链接有效性、FAQ 审核状态、CTA 匹配，以及不得编造的内容。

“标准买家指南”默认结构为：写前资料检查 → H1 → 开头直接回答 → H2 买家筛选标准及场景/容量/材质/安装/维护等 H3 → 有真实数据才生成型号或方案对比 → 选择步骤/检查清单 → 已审核 FAQ → 内链与媒体 → 明确下一步/样品/目录 CTA。

参考《深圳网贸会分享文章写作提示词》时吸收 E-E-A-T、受众适配、自然可读性、先列提纲、FAQ/Alt/内链和防编造要求；不固定 Flesch 80、FAQ 数量或单一字数，不刻意制造口头填充、题外话或“人类不完美”，不把链接视觉样式放入写作框架，也不强制所有文章套用 AIDA。AIDA 仅作为主题规划和漏斗阶段信息。

## 工作台交互

- 继续使用站点资料的“博客写作框架”入口，并升级现有分区，不新增独立顶级页面。
- 顶部摘要显示标准名称、状态、版本、更新时间、内置/站点修改数量，并提供“进入工作台”和“恢复内置默认”。
- 工作台采用三栏桌面布局：左侧选择框架；中间进行当前框架的 AI 对话；右侧显示文章施工图。
- 右侧不是字段清单，而是按生成顺序展示“生成前资料、H1、开头、H2/H3、条件区块、FAQ、内链/媒体、CTA、禁止项和发布检查”。
- 支持“已保存框架 / AI 修改后”切换；AI 修改处高亮并附改动清单。草稿状态和“尚未影响 Blog AI”必须持续可见。
- 原名称、类型、必填输入、区块顺序、FAQ/CTA/内链/媒体/SEO 和禁止项编辑器移入折叠的“高级设置”。
- 操作包括撤销本轮、继续对话、恢复当前框架默认、保存为站点框架标准。离开有未保存草稿时沿用现有确认交互。
- UI 遵守 `design-system/MASTER.md`：动态文本祖先 `min-width: 0`，三栏使用 `minmax(0, …)`，操作区允许换行，受控滚动声明 `data-overflow-policy`，不实现低于 1100px 的移动布局。

## 接口与数据流

- `GET /site-profiles/{site_id}/blog-framework-standard`：返回已生效标准；无站点副本时返回内置 default v0。
- `POST /site-profiles/{site_id}/blog-framework-standard/assistant`：接收当前框架、完整草稿和对话；调用已配置的 Gemini/Vertex AI，返回经校验的结构化草稿、回复、差异和风险提示，不写数据库。
- `PUT /site-profiles/{site_id}/blog-framework-standard`：保存完整标准，状态改为 `configured`，版本递增并更新时间；拒绝客户端自行跳版本。
- `POST /site-profiles/{site_id}/blog-framework-standard/reset-draft` 不需要新增；恢复默认由客户端从响应携带的系统基线构造草稿，最终仍通过保存接口生效。
- Blog AI 选择框架时优先使用显式 `frameworkId`，否则按 `articleType` 匹配，再回退标准买家指南。生成提示中注入当前生效标准的六层规则。
- AI 未配置或调用失败时保留当前草稿并显示可恢复错误，不退化为伪 AI 关键词替换；用户仍可在高级设置中手动编辑。

## 测试与验收

- 后端：内置 5 类默认、旧数据迁移、AI 只改当前框架、空消息、非法结构、单次澄清、零写入草稿、保存版本递增、恢复默认草稿和 AI 服务失败。
- 服务层：读取/AI 修改/保存请求与响应校验，兼容旧 `blogFrameworks`，并验证草稿不进入站点资料。
- UI：默认摘要、三栏工作台、框架切换保留草稿、已保存/草稿切换、高亮差异、改动清单、高级设置、撤销、恢复默认、离开确认和保存成功状态。
- Blog AI：新站点使用内置默认；保存后使用新版本；单篇文章要求不污染站点框架；显式框架 ID 和文章类型回退正确。
- 运行 `npm run typecheck`、目标前后端测试、`npm run verify:ui`；布局覆盖 `1100×720`、`1320×860`、`1600×900`，浅色/深色及 100%、125%、150% 缩放。
- 验收标准：普通用户无需理解字段名，只需选择文章类型、用自然语言说明写法、在文章施工图中看清每个位置将生成什么并保存，即可让后续 Blog AI 使用统一框架。
