import consola from "consola"
import { execSync } from "node:child_process"
import fs from "node:fs/promises"
import process from "node:process"

import { deregisterClient, ensureServer, registerClient } from "./lib/daemon"
import { PATHS } from "./lib/paths"
import { setupGitHubToken } from "./lib/token"

async function hasGithubToken(): Promise<boolean> {
  try {
    const content = await fs.readFile(PATHS.GITHUB_TOKEN_PATH, "utf8")
    return content.trim().length > 0
  } catch {
    return false
  }
}

export async function runLaunch({
  foreground,
}: {
  foreground: boolean
}): Promise<void> {
  if (!(await hasGithubToken())) {
    consola.info("Not authenticated, running login flow...")
    await setupGitHubToken({ force: false })
  }

  const port = await ensureServer()
  await registerClient()

  const serverUrl = `http://localhost:${port}`

  if (foreground) {
    consola.info(`Foreground mode — proxy at ${serverUrl}`)
    consola.info("Press Ctrl+C to stop")

    await new Promise<void>((resolve) => {
      process.on("SIGINT", () => resolve())
      process.on("SIGTERM", () => resolve())
    })
  } else {
    const env = {
      ...process.env,
      ANTHROPIC_BASE_URL: serverUrl,
      ANTHROPIC_AUTH_TOKEN: "dummy",
      DISABLE_NON_ESSENTIAL_MODEL_CALLS: "1",
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
    }

    consola.info(`Launching Claude Code with proxy at ${serverUrl}`)

    try {
      execSync("claude", { stdio: "inherit", env })
    } catch {
      // claude exited (including Ctrl+C) — that's fine
    }
  }

  await deregisterClient()
}
