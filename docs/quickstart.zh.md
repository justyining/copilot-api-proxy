# 快速上手

将 GitHub Copilot 转为 OpenAI/Anthropic 兼容 API，可用于 Claude Code 等工具。

**前置条件**：GitHub 账号已订阅 Copilot，已安装 [Bun](https://bun.sh)。

## 1. 下载并启动

```bash
git clone https://github.com/justyining/copilot-api.git
cd copilot-api
bun install
bun run dev
```

首次运行会提示在浏览器中打开 https://github.com/login/device 并输入设备码完成授权。

## 2. Docker 部署

```bash
docker build -t copilot-api .

mkdir -p copilot-data
docker run -p 4141:4141 \
  -e GH_TOKEN=your_github_token \
  -v $(pwd)/copilot-data:/home/copilot/.local/share/copilot-api \
  copilot-api
```

或使用 docker-compose：

```bash
echo 'GH_TOKEN=your_github_token' > .env
docker compose up -d
```

## 3. 配合 Claude Code 使用

在项目根目录创建 `.claude/settings.json`：

```json
{
  "env": {
    "ANTHROPIC_AUTH_TOKEN": "yougotthekey",
    "ANTHROPIC_BASE_URL": "http://localhost:4141",
    "ANTHROPIC_DEFAULT_OPUS_MODEL": "claude-opus-4.6",
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

## 4. 验证

```bash
curl http://localhost:4141/v1/models
```

返回模型列表即表示服务正常。

---

服务默认监听 `http://localhost:4141`，支持 OpenAI (`/v1/chat/completions`) 和 Anthropic (`/v1/messages`) 两种 API 格式。
