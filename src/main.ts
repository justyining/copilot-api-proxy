#!/usr/bin/env node

import { defineCommand, runMain } from "citty"
import consola from "consola"
import { execSync } from "node:child_process"
import fs from "node:fs/promises"
import process from "node:process"

import { auth } from "./auth"
import { checkUsage } from "./check-usage"
import { debug } from "./debug"
import { deregisterClient, ensureServer, registerClient } from "./lib/daemon"
import { runDaemon } from "./lib/daemon-server"
import { PATHS } from "./lib/paths"
import { setupGitHubToken } from "./lib/token"

// Intercept daemon mode BEFORE citty parses args
if (process.argv.includes("--internal-daemon")) {
  process.argv = process.argv.filter((a) => a !== "--internal-daemon")
  await runDaemon()
  process.exit(0)
}

async function hasGithubToken(): Promise<boolean> {
  try {
    const content = await fs.readFile(PATHS.GITHUB_TOKEN_PATH, "utf8")
    return content.trim().length > 0
  } catch {
    return false
  }
}

const main = defineCommand({
  meta: {
    name: "claude-copilot",
    description: "GitHub Copilot API proxy for Claude Code",
  },
  args: {
    foreground: {
      alias: "f",
      type: "boolean",
      default: false,
      description: "Run in foreground mode (don't exec claude, for debugging)",
    },
  },
  subCommands: {
    auth,
    start: (await import("./lib/start-command")).start,
    "check-usage": checkUsage,
    debug,
    stop: (await import("./stop")).stop,
  },
  async run({ args, rawArgs }) {
    // citty executes the parent's run() AFTER the subcommand's run() returns.
    // We only want the launch flow (daemon + exec claude) when NO subcommand was matched.
    const subCommandNames = ["auth", "start", "check-usage", "debug", "stop"]
    const firstPositional = rawArgs.find((a) => !a.startsWith("-"))
    if (firstPositional && subCommandNames.includes(firstPositional)) {
      return
    }

    // Step 1: Auth check
    if (!(await hasGithubToken())) {
      consola.info("Not authenticated, running login flow...")
      await setupGitHubToken({ force: false })
    }

    // Step 2: Ensure background server is running (random port)
    const port = await ensureServer()

    // Step 3: Register as a client
    await registerClient()

    const serverUrl = `http://localhost:${port}`

    if (args.foreground) {
      consola.info(`Foreground mode — proxy at ${serverUrl}`)
      consola.info("Press Ctrl+C to stop")

      // Keep running until Ctrl+C
      await new Promise<void>((resolve) => {
        process.on("SIGINT", () => resolve())
        process.on("SIGTERM", () => resolve())
      })
    } else {
      // Step 4: Launch Claude Code with proxy env vars
      const env = {
        ...process.env,
        ANTHROPIC_BASE_URL: serverUrl,
        ANTHROPIC_AUTH_TOKEN: "dummy",
        DISABLE_NON_ESSENTIAL_MODEL_CALLS: "1",
        CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
      }

      consola.info(`Launching Claude Code with proxy at ${serverUrl}`)

      try {
        // exec replaces this process — the PID survives, keeping the client lock valid
        execSync("claude", { stdio: "inherit", env })
      } catch {
        // claude exited (including Ctrl+C) — that's fine
      }
    }

    await deregisterClient()
  },
})

await runMain(main)
