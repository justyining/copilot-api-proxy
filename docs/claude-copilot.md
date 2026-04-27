# Claude Copilot

用 GitHub Copilot 订阅驱动 [Claude Code](https://docs.anthropic.com/en/docs/claude-code/overview)。

## 前置条件

- GitHub 账号已订阅 Copilot（个人版 / Business / Enterprise 均可）
- 已安装 Node.js 18+（从 [官网](https://nodejs.org/) 下载 LTS 版本）
- 已安装 [Claude Code](https://docs.anthropic.com/en/docs/claude-code/overview)：`npm install -g @anthropic-ai/claude-code`

## 安装

```bash
npm install -g <package-name>
```

## 使用

安装后，用 `claude-copilot` 代替 `claude` 命令即可。使用方式完全一致，所有功能和参数均可正常使用。

```bash
claude-copilot
```

> **注意：** 请始终通过 `claude-copilot` 启动 Claude Code，而不是直接运行 `claude`。直接运行 `claude` 不会走 Copilot 代理，会提示 API key 无效。

### 首次使用

首次运行会自动引导 GitHub 授权：

```
ℹ Not authenticated, starting login...
ℹ Open https://github.com/login/device and enter code: XXXX-XXXX
```

在浏览器中打开链接，输入给出的 code 完成授权。之后每次运行无需重复授权。

### 确认状态

启动后，在 Claude Code 中输入 `/status` 可查看状态信息，确认代理已生效：

```
Auth token:          ANTHROPIC_AUTH_TOKEN
Anthropic base URL:  http://localhost:<port>
Model:               opus (claude-opus-4.6)
Setting sources:     User settings, Project local settings
```

- `Auth token` 显示 `ANTHROPIC_AUTH_TOKEN` 表示已通过代理认证
- `Anthropic base URL` 指向 `http://localhost:<port>` 表示请求已走本地代理
- `Setting sources` 包含 `Project local settings` 表示代理配置已注入

> **提示：** `claude-copilot` 启动时会在当前目录的 `.claude/settings.local.json` 中临时写入代理配置，退出后自动恢复。`claude-copilot` 的运行不受已有的 `.claude/settings.json` 影响。

## 重新登录

如果需要切换 GitHub 账号或重新授权：

```bash
claude-copilot auth
```

## 其他命令

| 命令 | 说明 |
| --- | --- |
| `claude-copilot auth` | 重新执行 GitHub 授权 |
| `claude-copilot check-usage` | 查看 Copilot 用量 |
| `claude-copilot debug` | 输出诊断信息 |

## 使用 Tips

**关于 Premium Requests**

- Copilot 按 Premium Requests 计费，Opus 模型每次请求消耗 3 个 Premium Requests
- 可通过 `claude-copilot check-usage` 查看当前用量

**如何节省用量**

- 同一个会话内持续对话不会产生新的计费——Copilot 后端会缓存 system prompt 的 KV Cache，只要缓存命中就不算新请求
- Compact（`/compact`）会重置上下文，导致缓存失效，计为新请求
- 每个 subagent 都是独立会话，会各自消耗 Premium Requests。避免使用会创建大量 subagent 的工具（如 Superpowers）

## 常见问题

### 授权失败或 token 过期

重新运行 `claude-copilot auth` 即可。

### 端口冲突

不会。代理服务使用随机端口，自动配置。

### Claude Code 提示 API key 无效

确认是通过 `claude-copilot` 启动的，不要单独运行 `claude`。`claude-copilot` 会自动注入代理配置。

## 工作原理

本项目基于 [copilot-api](https://github.com/ericc-ch/copilot-api) 改造而来，主要特性：

- **自动维护代理服务**：后台自动启动和管理代理进程，无需手动操作
- **与官方一致的 endpoint 和请求头**：使用与 VSCode Copilot 插件相同的 Agent endpoint 和 HTTP 请求头（编辑器版本、设备标识等），理论上与插件中的请求一致

## 问题反馈

如遇问题，请在 [GitLab Issues](https://git.nevint.com/ning.yi/claude-copilot/-/issues/new) 提交。
