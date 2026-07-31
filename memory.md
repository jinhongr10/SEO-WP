# Memory

## Docker/Windows 商业包默认要求

当用户要求“打包 Docker / 打包成 tar / 我要导入 Docker / 一键启动部署 / 做 Windows EXE 商业包”时，默认按下面要求执行：

> 交付包不能包含真实客户凭据、API key、service-account JSON、SQLite 数据库、缓存、备份或本地 settings。安装后由用户在设置页填写 WordPress、WooCommerce、SFTP、AI/Vertex、GSC 等模块配置。

具体执行偏好：

- 目标镜像必须是 `linux/amd64`，最终导出为可用 `docker load -i` 导入的镜像 tar。
- 部署包里要包含一键启动脚本，例如 `start.sh`，脚本负责 `docker load`、检查必要文件、移除旧容器并启动 `docker compose`。
- 部署包要包含可运行的 `docker-compose.yml`、`.env.example`/`.env.server.example` 和配置说明，但不复制本机真实 `.env`。
- 不得打包 `.env`、`.env.local`、`.env.server`、`keys/`、`data/settings.json`、SQLite 数据库、缓存目录、备份目录、历史 release 包或客户数据。
- 运行数据默认写入用户数据目录；Windows 桌面版使用 `%APPDATA%/SeoWpSync/`。
- 打包后必须做基础校验：镜像架构是 `amd64/linux`，启动命令正确，启动脚本语法正确，压缩包里不包含真实密钥、数据库或缓存。
- 如条件允许，使用临时容器挂载部署包目录测试前端页面和后端接口能返回；测试完成后删除临时容器。
- 不要在回复里打印真实密码、API key、service account JSON 或其他敏感内容。
