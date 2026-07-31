# 开发、验证与桌面发布快速流程

## 日常开发

```bash
npm run desktop:dev
```

此命令会等待 Vite 和 Python 后端健康后再打开 Electron。前端修改热更新，后端修改由 Uvicorn 重载；只有 `desktop/main.cjs` 或 `desktop/preload.cjs` 变化时重启 Electron。统一日志写入 `test-results/dev-session/latest.log`。

修改过程中运行约十秒的快速闸门：

```bash
npm run check:fast
```

## 交付复测

```bash
npm run verify:changed
```

该命令会检查工作区、暂存区和未跟踪文件，自动选择前端、后端、UI 或桌面专项闸门。结果写入：

- `test-results/verification/latest.md`
- `test-results/verification/latest.json`
- `test-results/verification/logs/`

检查通过后直接打开开发版 App：

```bash
npm run review:changed
```

UI 修改在宣布完成前仍必须执行 `npm run verify:ui`。

## 阶段发布

发布硬闸门：

```bash
npm run verify:release
```

正式发布只在用户明确确认阶段完成后执行：

```bash
npm run release:stage -- --platform all --bump patch
```

发布前先做无副作用预演：

```bash
npm run release:stage -- --platform all --bump patch --dry-run
```

`--dry-run` 运行完整验证、GET-only 只读站点冒烟和产物清单检查，但不改版本、不创建 Tag、不上传、不推送。真实发布必须是干净工作区，并提供可写入 `jinhongr10/SEO-WP` 的 `GH_TOKEN`。

只发布 Windows 时使用显式版本；本机不需要发布仓库 Token，Tag 会触发 GitHub Windows runner 使用仓库 Secret 构建：

```bash
npm run release:stage -- --platform windows --version 0.1.2 --dry-run
npm run release:stage -- --platform windows --version 0.1.2
```

真实发布必须从与 `origin/main` 完全一致的 `main` 执行。Windows 工作流先完成 UI、Electron、打包产物、静默安装、启动和卸载测试，再公开 Release；失败时只保留草稿。

macOS 产物先上传到草稿 Release，Tag 触发 Windows x64 构建。只有 DMG、ZIP、EXE、blockmap 和 `latest*.yml` 全部存在时才发布 Release；失败时草稿保留，客户端不会收到不完整更新。

Windows-only Release 只要求 EXE、EXE blockmap 和 `latest.yml`。当前 Windows 安装包未签名，公开说明必须提示 Microsoft Defender SmartScreen 可能显示“未知发布者”。

## 桌面构建缓存

`npm run build:desktop:mac` 和 Windows 构建会分别复用未变化的 Python 后端、Node 运行时和生产依赖。强制重建：

```bash
FORCE_BACKEND=true npm run build:desktop:mac
FORCE_NODE_RUNTIME=true npm run build:desktop:mac
```

缓存指纹位于已忽略的 `build/desktop-cache/`。
