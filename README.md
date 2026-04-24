# Copilot API

> [!WARNING]
> 本项目为逆向代理，非 GitHub 官方支持，可能随时失效。过量使用可能触发 GitHub 滥用检测，导致账号被限制。请谨慎、负责任地使用。

将 GitHub Copilot 转为 OpenAI/Anthropic 兼容 API，可直接驱动 [Claude Code](https://docs.anthropic.com/en/docs/claude-code/overview) 等工具。

> **Note:** 本项目基于 [ericc-ch/copilot-api](https://github.com/ericc-ch/copilot-api) 开发，由 [@justyining](https://github.com/justyining) 独立维护。

**前置条件**：GitHub 账号已订阅 Copilot。

## 快速上手

### 从源码运行

```bash
git clone https://github.com/justyining/copilot-api-proxy.git
cd copilot-api
bun install
```

首次使用需先授权：

```bash
bun run start auth
```

按提示打开 https://github.com/login/device 并输入设备码完成授权。

然后启动服务：

```bash
bun run start start
# 或开发模式（自动重启）
bun run dev start
```

### Docker 部署

```bash
docker build -t copilot-api .
mkdir -p copilot-data
docker run -p 4141:4141 \
  -e GH_TOKEN=your_github_token \
  -v $(pwd)/copilot-data:/home/copilot/.local/share/copilot-api \
  copilot-api
```

或 docker-compose：

```bash
echo 'GH_TOKEN=your_github_token' > .env
docker compose up -d
```

### 验证

```bash
curl http://localhost:4141/v1/models
```

返回模型列表即表示服务正常。

## 配合 Claude Code 使用

### 方式一：一键 wrapper 脚本（推荐）

```bash
curl -fsSL https://raw.githubusercontent.com/justyining/copilot-api-proxy/master/install.sh | bash
```

安装后直接运行：

```bash
claude-copilot          # 等同于 claude，但自动连接本地 copilot-api
claude-copilot --chat   # 透传所有 claude 原始参数
```

### 方式二：手动配置 settings.json

在项目根目录创建 `.claude/settings.json`：

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

## 命令行选项

### start

```bash
bun run start start [选项]
# 或已全局安装时
copilot-api start [选项]
```

| 选项           | 说明                                           | 默认值        | 别名 |
| -------------- | ---------------------------------------------- | ------------- | ---- |
| --port         | 监听端口                                       | 4141          | -p   |
| --verbose      | 详细日志                                       | false         | -v   |
| --account-type | 账号类型（individual/business/enterprise）      | individual    | -a   |
| --manual       | 手动审批每个请求                               | false         |      |
| --rate-limit   | 请求间隔（秒）                                 | 无            | -r   |
| --wait         | 触发限流时等待而非报错                         | false         | -w   |
| --github-token | 直接提供 GitHub token                          | 无            | -g   |
| --claude-code  | 生成 Claude Code 启动命令                      | false         | -c   |
| --show-token   | 显示 GitHub 和 Copilot token                   | false         |      |
| --proxy-env    | 从环境变量初始化代理（HTTP_PROXY 等）          | false         |      |
| --client-mode  | 客户端模式（claude-code/codex）                | claude-code   | -m   |

### 其他命令

- `auth` — 仅执行 GitHub 授权流程
- `check-usage` — 查看当前 Copilot 用量和配额
- `debug` — 输出诊断信息（`--json` 输出 JSON 格式）

## API 端点

服务默认监听 `http://localhost:4141`。

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
- 使用 `--rate-limit` 控制请求频率，避免触发 GitHub 滥用检测
- 更多安全实践见 [SECURITY.md](./SECURITY.md)

## 许可证

MIT，见 [LICENSE](./LICENSE)。
