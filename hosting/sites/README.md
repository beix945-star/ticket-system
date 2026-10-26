# 工单台：Sites 在线部署适配

在线版保留原 React 工单页面，把本地 Express / node:sqlite 接口适配为 Vinext 路由和 Cloudflare D1 持久化存储。

- `app/hosted-api.ts`：在线 API，登录、角色权限、工单、留言、版本校验与审计。
- `app/api/[...path]/route.ts`：请求入口，读取 D1 绑定。
- `components/`：复用本地版的页面与请求类型。
- `db/schema.ts`、`drizzle/`：在线数据库结构与迁移。
- `tests/hosted.test.ts`：使用内存 SQLite 模拟 D1 方法，验证在线适配的完整流程。

在线版密码使用 Web Crypto PBKDF2，Cookie 为 Secure / HttpOnly / SameSite=Strict；本地版使用 Node scrypt。两边数据库独立，不同步账号和业务数据。在线演示公开共享，请只输入虚构内容。

演示首次使用时点击页面顶部“准备演示账号”，然后使用 `demo / Demo12345!` 或 `admin / Admin12345!` 登录。初始化不会重置已有工单。

本地检查：Node.js 24 执行 `node --test tests/hosted.test.ts`；安装依赖后运行 `node node_modules/typescript/bin/tsc --noEmit`。Sites 构建、迁移与发布通过仓库的 `.openai/hosting.json` 和 Sites 工具完成。

主项目源码：https://github.com/beix945-star/ticket-system
