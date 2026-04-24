#!/usr/bin/env node

import clipboard from "clipboardy"
import consola from "consola"
import { randomUUID } from "node:crypto"
import { serve, type Server, type ServerHandler } from "srvx"
import invariant from "tiny-invariant"

import type { Model } from "./services/copilot/get-models"

import {
  generateSessionId,
  loadOrCreateDeviceId,
  loadOrCreateMachineId,
} from "./lib/identity"
import { ensurePaths } from "./lib/paths"
import { initProxyFromEnv } from "./lib/proxy"
import { generateEnvScript } from "./lib/shell"
import { state } from "./lib/state"
import { setupCopilotToken, setupGitHubToken } from "./lib/token"
import { cacheModels, cacheVSCodeVersion } from "./lib/utils"
import { server } from "./server"

interface RunServerOptions {
  port: number
  verbose: boolean
  accountType: string
  manual: boolean
  rateLimit?: number
  rateLimitWait: boolean
  githubToken?: string
  claudeCode: boolean
  showToken: boolean
  proxyEnv: boolean
  clientMode: "claude-code" | "codex"
}

export async function runServer(options: RunServerOptions): Promise<Server> {
  if (options.proxyEnv) {
    initProxyFromEnv()
  }

  if (options.verbose) {
    consola.level = 5
    consola.info("Verbose logging enabled")
  }

  state.accountType = options.accountType
  if (options.accountType !== "individual") {
    consola.info(`Using ${options.accountType} plan GitHub account`)
  }

  state.manualApprove = options.manual
  state.rateLimitSeconds = options.rateLimit
  state.rateLimitWait = options.rateLimitWait
  state.showToken = options.showToken

  await ensurePaths()
  await cacheVSCodeVersion()

  // Initialize persistent and per-session identity
  state.deviceId = await loadOrCreateDeviceId()
  state.machineId = await loadOrCreateMachineId()
  state.sessionId = generateSessionId()
  state.interactionId = randomUUID()
  state.clientMode = options.clientMode
  state.port = options.port

  consola.info(`Client mode: ${state.clientMode}`)
  consola.info(`Device ID: ${state.deviceId.slice(0, 8)}...`)
  consola.info(`Session ID: ${state.sessionId.slice(0, 8)}...`)
  consola.info(`Interaction ID: ${state.interactionId.slice(0, 8)}...`)

  if (options.githubToken) {
    state.githubToken = options.githubToken
    consola.info("Using provided GitHub token")
  } else {
    await setupGitHubToken()
  }

  await setupCopilotToken()
  await cacheModels()

  // Log detailed model configuration
  consola.info(
    `Available models: \n${state.models?.data.map((model) => `- ${model.id}`).join("\n")}`,
  )

  if (options.verbose && state.models?.data) {
    logDetailedModelConfigurations(state.models.data)
  }

  const serverUrl = `http://localhost:${options.port}`

  if (options.claudeCode) {
    invariant(state.models, "Models should be loaded by now")

    const selectedModel = await consola.prompt(
      "Select a model to use with Claude Code",
      {
        type: "select",
        options: state.models.data.map((model) => model.id),
      },
    )

    const selectedSmallModel = await consola.prompt(
      "Select a small model to use with Claude Code",
      {
        type: "select",
        options: state.models.data.map((model) => model.id),
      },
    )

    const command = generateEnvScript(
      {
        ANTHROPIC_BASE_URL: serverUrl,
        ANTHROPIC_AUTH_TOKEN: "dummy",
        ANTHROPIC_MODEL: selectedModel,
        ANTHROPIC_DEFAULT_SONNET_MODEL: selectedModel,
        ANTHROPIC_SMALL_FAST_MODEL: selectedSmallModel,
        ANTHROPIC_DEFAULT_HAIKU_MODEL: selectedSmallModel,
        DISABLE_NON_ESSENTIAL_MODEL_CALLS: "1",
        CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
      },
      "claude",
    )

    try {
      clipboard.writeSync(command)
      consola.success("Copied Claude Code command to clipboard!")
    } catch {
      consola.warn(
        "Failed to copy to clipboard. Here is the Claude Code command:",
      )
      consola.log(command)
    }
  }

  const httpServer = serve({
    fetch: server.fetch as ServerHandler,
    port: options.port,
    // Long SSE streams (thinking budget up to 32k tokens) routinely exceed
    // Bun's default 10s idle timeout. 255 is Bun's max allowed value.
    bun: { idleTimeout: 255 },
    node: { requestTimeout: 0, headersTimeout: 0 },
  })

  return httpServer
}

function logDetailedModelConfigurations(models: Array<Model>) {
  consola.info("\nDetailed model configurations:")
  for (const model of models) {
    consola.info(`\n[${model.id}]`)
    consola.info(`  Name: ${model.name}`)
    consola.info(`  Vendor: ${model.vendor}`)
    consola.info(`  Version: ${model.version}`)
    consola.info(`  Preview: ${model.preview}`)
    consola.info(`  Family: ${model.capabilities.family}`)
    consola.info(`  Tokenizer: ${model.capabilities.tokenizer}`)
    consola.info(`  Type: ${model.capabilities.type}`)
    if (model.capabilities.limits) {
      consola.info("  Limits:")
      if (model.capabilities.limits.max_context_window_tokens) {
        consola.info(
          `    Max context window: ${model.capabilities.limits.max_context_window_tokens} tokens`,
        )
      }
      if (model.capabilities.limits.max_output_tokens) {
        consola.info(
          `    Max output: ${model.capabilities.limits.max_output_tokens} tokens`,
        )
      }
      if (model.capabilities.limits.max_prompt_tokens) {
        consola.info(
          `    Max prompt: ${model.capabilities.limits.max_prompt_tokens} tokens`,
        )
      }
      if (model.capabilities.limits.max_inputs) {
        consola.info(`    Max inputs: ${model.capabilities.limits.max_inputs}`)
      }
    }
    consola.info("  Supports:")
    consola.info(
      `    Tool calls: ${model.capabilities.supports.tool_calls ?? false}`,
    )
    consola.info(
      `    Parallel tool calls: ${model.capabilities.supports.parallel_tool_calls ?? false}`,
    )
    if (model.capabilities.supports.dimensions !== undefined) {
      consola.info(`    Dimensions: ${model.capabilities.supports.dimensions}`)
    }
    if (model.policy) {
      consola.info(`  Policy state: ${model.policy.state}`)
    }
  }
}
