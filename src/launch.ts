import consola from "consola"
import { execSync } from "node:child_process"
import fs from "node:fs/promises"
import path from "node:path"

import { deregisterClient, ensureServer, registerClient } from "./lib/daemon"
import { ensurePaths, PATHS } from "./lib/paths"
import { setupGitHubToken } from "./lib/token"

const SETTINGS_LOCAL_PATH = path.join(
  process.cwd(),
  ".claude",
  "settings.local.json",
)

interface ClaudeSettings {
  env?: Record<string, string | number>
  [key: string]: unknown
}

async function hasGithubToken(): Promise<boolean> {
  try {
    const content = await fs.readFile(PATHS.GITHUB_TOKEN_PATH, "utf8")
    return content.trim().length > 0
  } catch {
    return false
  }
}

async function readSettingsLocal(): Promise<ClaudeSettings | null> {
  try {
    const content = await fs.readFile(SETTINGS_LOCAL_PATH)
    return JSON.parse(content) as ClaudeSettings
  } catch {
    return null
  }
}

async function writeSettingsLocal(settings: ClaudeSettings): Promise<void> {
  await fs.mkdir(path.dirname(SETTINGS_LOCAL_PATH), { recursive: true })
  await fs.writeFile(SETTINGS_LOCAL_PATH, JSON.stringify(settings, null, 2))
}

async function withProxySettings<T>(
  serverUrl: string,
  fn: () => Promise<T>,
): Promise<T> {
  const original = await readSettingsLocal()
  const originalBaseUrl = original?.env?.ANTHROPIC_BASE_URL
  const originalAuthToken = original?.env?.ANTHROPIC_AUTH_TOKEN

  const patched: ClaudeSettings = {
    ...original,
    env: {
      ...original?.env,
      ANTHROPIC_BASE_URL: serverUrl,
      ANTHROPIC_AUTH_TOKEN: "dummy",
      ANTHROPIC_DEFAULT_OPUS_MODEL: "claude-opus-4.6",
      ANTHROPIC_DEFAULT_SONNET_MODEL: "claude-sonnet-4.6",
      ANTHROPIC_DEFAULT_HAIKU_MODEL: "claude-haiku-4.5",
      CLAUDE_CODE_DISABLE_1M_CONTEXT: "1",
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
    },
  }

  await writeSettingsLocal(patched)

  try {
    return await fn()
  } finally {
    if (original) {
      const restored: ClaudeSettings = {
        ...original,
        env: { ...original.env },
      }
      if (originalBaseUrl !== undefined) {
        restored.env = { ...restored.env, ANTHROPIC_BASE_URL: originalBaseUrl }
      } else if (restored.env) {
        delete restored.env.ANTHROPIC_BASE_URL
      }
      if (originalAuthToken !== undefined) {
        restored.env = {
          ...restored.env,
          ANTHROPIC_AUTH_TOKEN: originalAuthToken,
        }
      } else if (restored.env) {
        delete restored.env.ANTHROPIC_AUTH_TOKEN
      }
      await writeSettingsLocal(restored)
    } else {
      await fs.unlink(SETTINGS_LOCAL_PATH).catch(() => {})
    }
  }
}

export async function runLaunch({
  claudeArgs,
}: {
  claudeArgs: Array<string>
}): Promise<void> {
  await ensurePaths()

  if (!(await hasGithubToken())) {
    consola.info("Not authenticated, starting login...")
    await setupGitHubToken({ force: false })
  }

  const port = await ensureServer()
  await registerClient()

  const serverUrl = `http://localhost:${port}`

  await withProxySettings(serverUrl, () => {
    const cmd =
      claudeArgs.length > 0 ? `claude ${claudeArgs.join(" ")}` : "claude"
    try {
      execSync(cmd, { stdio: "inherit" })
    } catch {
      // claude exited (including Ctrl+C) — that's fine
    }
  })

  await deregisterClient()
}
