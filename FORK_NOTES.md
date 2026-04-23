# Notes

本项目基于 [ericc-ch/copilot-api](https://github.com/ericc-ch/copilot-api) 开发，由 [@justyining](https://github.com/justyining) 独立维护。

## 与上游的主要差异

- 直接代理 Anthropic `/v1/messages` 和 `/v1/messages/count_tokens`，不再做 OpenAI 格式转换
- 更严格的请求校验，支持 OpenAI 和 Anthropic 两种风格的 payload
- `/usage` 用量面板、`check-usage` 和 `debug` 命令、`--manual`/`--rate-limit` 流控
- `--claude-code` 一键生成 Claude Code 启动配置
- 非 root Docker 镜像、`/health` 和 `/ready` 探针
- 更多安全实践见 [SECURITY.md](./SECURITY.md)

## Contributing

- Issues: https://github.com/justyining/copilot-api-proxy/issues
- Pull Requests: https://github.com/justyining/copilot-api-proxy/pulls
