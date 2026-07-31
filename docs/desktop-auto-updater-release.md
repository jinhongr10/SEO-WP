# 桌面端自动更新发布策略

## 仓库策略

源码仓库继续保持 private。桌面端安装包和 electron-builder 生成的更新元数据发布到 public 的 releases-only 仓库，不放源码。

当前发布仓库：

```text
jinhongr10/SEO-WP
```

## 发布配置

普通本地打包继续使用 `electron-builder.json`，不会写入发布仓库信息：

```bash
npm run build:desktop:mac
```

正式发布包使用 `electron-builder.release.json`：

```bash
export GH_TOKEN="只允许访问 jinhongr10/SEO-WP 的 GitHub token"
npm run build:desktop:mac:release
```

日常阶段发布应使用统一入口，它会先全量验证、只读冒烟，再协调 macOS 与 Windows 产物：

```bash
npm run release:stage -- --platform all --bump patch --dry-run
npm run release:stage -- --platform all --bump patch
```

只发布 Windows x64 时：

```bash
npm run release:stage -- --platform windows --version 0.1.2 --dry-run
npm run release:stage -- --platform windows --version 0.1.2
```

该命令必须从干净且与 `origin/main` 同步的 `main` 运行。它更新版本、提交并推送 `v0.1.2` 标签；标签触发 Windows runner，发布者本机不需要构建 EXE。

发布产物先进入 GitHub 草稿 Release。只有两个平台的安装包、blockmap 和更新元数据全部存在时，Windows 工作流才会把草稿正式发布。

Windows 发布包：

```powershell
$env:GH_TOKEN = "只允许访问 jinhongr10/SEO-WP 的 GitHub token"
npm run build:desktop:windows:release
```

Windows 工作流在公开 Release 前执行以下硬闸门：Node 24 下的 UI/交互测试、Electron 启动、全新后端与 Node 运行时构建、打包目录遗留字符串扫描、未安装应用 UI 截图、NSIS 静默安装、安装后启动和静默卸载。任一失败时草稿不会公开。

当前 Windows 安装包未配置代码签名。Microsoft Defender SmartScreen 可能显示“未知发布者”，用户需要选择“更多信息 → 仍要运行”；此限制必须保留在 Release 说明中。

## 版本与 tag

每次发布前必须先更新 `package.json` 和 `package-lock.json` 的 `version`。GitHub release tag 必须匹配这个版本，并使用 `v` 前缀：

```text
package.json version: 0.1.0
GitHub tag: v0.1.0
```

如果版本号没有变化，客户端会认为没有可安装的新版本，即使 release 仓库里重新上传了安装包。

## 自动更新行为

打包后的应用启动后会延迟检查更新。发现新版本后自动下载；下载完成后，用户可以在“系统配置 > 应用更新”里点击“重启安装”。开发模式不会检查更新。

macOS 生产自动更新建议配合签名和公证；未签名包可以生成安装包和更新元数据，但用户侧更新安装可能被系统安全策略拦截。
