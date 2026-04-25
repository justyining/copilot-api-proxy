# Copilot API

> [!WARNING]
> 本项目为逆向代理，非 GitHub 官方支持，可能随时失效。过量使用可能触发 GitHub 滥用检测，导致账号被限制。请谨慎、负责任地使用。

将 GitHub Copilot 转为 OpenAI/Anthropic 兼容 API，可直接驱动 [Claude Code](https://docs.anthropic.com/en/docs/claude-code/overview) 等工具。

> **Note:** 本项目基于 [ericc-ch/copilot-api](https://github.com/ericc-ch/copilot-api) 开发，由 [@justyining](https://github.com/justyining) 独立维护。

**前置条件**：GitHub 账号已订阅 Copilot。

## 快速上手

### 全局安装（推荐）

```bash
npm install -g copilot-api-proxy
```

直接运行：

```bash
claude-copilot
```

首次使用会自动引导 GitHub 授权流程，之后每次运行会自动启动后台代理服务并启动 Claude Code。代理服务使用随机端口，无需担心端口冲突。

多个 `claude-copilot` 实例共享同一个后台代理服务，当所有实例关闭后服务自动停止。

### 从源码运行

```bash
git clone https://github.com/justyining/copilot-api-proxy.git
cd copilot-api-proxy
bun install
```

首次使用先登录：

```bash
bun run auth
```

启动代理服务（前台，端口 4141）：

```bash
bun run start
```

开发模式（改代码自动重启）：

```bash
bun run dev
```

验证服务是否正常：

```bash
curl http://localhost:4141/v1/models
```

### Docker 部署

```bash
docker build -t copilot-api-proxy .
mkdir -p copilot-data
docker run -p 4141:4141 \
  -e GH_TOKEN=your_github_token \
  -v $(pwd)/copilot-data:/home/copilot/.local/share/copilot-api-proxy \
  copilot-api-proxy
```

或 docker-compose：

```bash
echo 'GH_TOKEN=your_github_token' > .env
docker compose up -d
```

## 命令行

### claude-copilot

启动后台代理服务并运行 Claude Code：

```bash
claude-copilot          # 首次运行会自动引导登录
```

首次运行时，如果未登录会自动执行 GitHub 授权流程。登录完成后，会自动启动后台代理服务（随机端口）并 exec 启动 `claude`。

当所有使用该代理服务的 `claude-copilot` 实例关闭后，后台服务自动停止。

### 其他命令

- `claude-copilot auth` — 执行 GitHub 授权流程
- `claude-copilot stop` — 强制停止后台代理服务
- `claude-copilot start [选项]` — 前台启动代理服务（开发用，端口默认 4141）
- `claude-copilot check-usage` — 查看当前 Copilot 用量和配额
- `claude-copilot debug` — 输出诊断信息（`--json` 输出 JSON 格式）

### 手动配置 settings.json

如需直接使用代理而不通过 `claude-copilot` 命令（如 Docker 部署或开发模式），可在项目根目录创建 `.claude/settings.json`：

```json
{
  "env": {
    "ANTHROPIC_AUTH_TOKEN": "yougotthekey",
    "ANTHROPIC_BASE_URL": "http://localhost:4141",
    "ANTHROPIC_DEFAULT_OPUS_MODEL": "claude-opus-4.7",
    "ANTHROPIC_DEFAULT_SONNET_MODEL": "claude-sonnet-4.6",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL": "claude-haiku-4.5",
    "CLAUDE_CODE_DISABLE_1M_CONTEXT": 1,
    "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC": 1
  },
  "permissions": {
    "deny": ["WebSearch"]
  }
}
```

## 开发

所有 `claude-copilot` 子命令在源码阶段都有对应的 npm script，无需先 `bun run build`。

| 命令 | 说明 |
| --- | --- |
| `bun install` | 安装依赖 |
| `bun run launch` | 等价于 `claude-copilot`（后台服务 + exec claude） |
| `bun run launch:f` | 前台模式，启代理但不 exec claude，用于调试 |
| `bun run dev` | 开发模式，前台启动代理服务，改代码自动重启（端口 4141） |
| `bun run start` | 生产模式前台启动代理服务（端口 4141） |
| `bun run start -- -p 8080` | 指定端口启动 |
| `bun run auth` | GitHub 授权登录 |
| `bun run stop` | 强制停止后台代理服务 |
| `bun run check-usage` | 查看 Copilot 用量和配额 |
| `bun run debug` | 输出诊断信息（加 `-- --json` 输出 JSON） |
| `bun run build` | 构建（tsdown → dist/） |
| `bun run typecheck` | TypeScript 类型检查 |
| `bun run lint` | ESLint 检查 |
| `bun test` | 运行测试 |

## API 端点

服务监听随机端口（`claude-copilot` 自动配置）。开发模式 `claude-copilot start` 默认监听 `http://localhost:4141`。

### OpenAI 兼容

| 端点                         | 说明           |
| ---------------------------- | -------------- |
| `POST /v1/chat/completions`  | 对话补全       |
| `GET /v1/models`             | 模型列表       |
| `POST /v1/embeddings`        | 文本向量化     |

### Anthropic 兼容

| 端点                              | 说明         |
| --------------------------------- | ------------ |
| `POST /v1/messages`               | 消息对话     |
| `POST /v1/messages/count_tokens`  | Token 计数   |

### 监控

| 端点          | 说明                     |
| ------------- | ------------------------ |
| `GET /token`  | 当前 Copilot token       |
| `GET /health` | 存活探针                 |
| `GET /ready`  | 就绪探针（token 已初始化）|

## 安全须知

- 本项目处理敏感 token，切勿暴露到公网
- `/token` 端点会泄露 Copilot token，仅限本地使用
- 更多安全实践见 [SECURITY.md](./SECURITY.md)

## 许可证

MIT，见 [LICENSE](./LICENSE)。
