# 工单台 / Ticket System

用于逐步学习 Web 全栈开发的工单管理系统。当前是第 1 阶段：使用 React + TypeScript 展示三条模拟工单。

## 当前进度

- [x] React + TypeScript + Vite 项目初始化
- [x] 定义工单类型，展示三条模拟数据
- [x] 复用工单卡片，显示中文状态和创建日期
- [x] 适配手机窄屏布局
- [ ] 状态筛选与 React 状态管理
- [ ] 新建工单、查看详情及表单校验
- [ ] Node.js + Express 接口与 SQLite 数据库
- [ ] 登录、权限校验和状态流转
- [ ] 接口测试与部署

当前没有后端、登录、数据持久化，也没有创建或修改工单的交互。所有工单都是学习用的演示数据。

## 在这台 Mac 上启动

双击根目录的 `启动项目.command`，或在项目根目录执行：

```bash
./project.sh dev
```

打开终端显示的本地地址（通常为 http://localhost:5173）。按 Control + C 停止服务。启动脚本优先使用已有 Node.js / pnpm，当前机器也可使用 Codex 附带的运行环境，不修改系统配置。

## 在其他电脑上启动

安装受支持的 Node.js LTS 和 pnpm，然后：

```bash
cd frontend
pnpm install --frozen-lockfile
pnpm dev
```

具体 Node.js 要求见 [Vite 官方文档](https://vite.dev/guide/)。依赖版本由 `frontend/pnpm-lock.yaml` 记录。

## 检查代码

```bash
./project.sh build
./project.sh lint
```

`build` 先检查 TypeScript，再生成前端文件；`lint` 检查常见代码问题。此阶段尚未编写自动化功能测试。

## 先看这些文件

- `frontend/src/App.tsx`：工单类型、模拟数据、卡片组件和列表。
- `frontend/src/App.css`：卡片、状态标签和手机布局。
- `frontend/src/index.css`：全局字体、背景和基本样式。
- `docs/第1课-从数据到页面.md`：逐段讲解与第一次练习。

## GitHub

项目使用 Git 记录每一步学习进度。`.gitignore` 已排除依赖、构建产物、本地环境变量和数据库文件。

后续修改代码后，在项目根目录查看和提交自己的改动：

```bash
git status
git add .
git commit -m "说明本次完成的功能"
git push
```

提交前先检查 `git diff`，确认本次修改内容，并运行上面的构建和代码检查。
