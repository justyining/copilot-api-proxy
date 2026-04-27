import consola from "consola"
import fs from "node:fs/promises"

import { PATHS } from "~/lib/paths"
import { getCopilotToken } from "~/services/github/get-copilot-token"
import { getDeviceCode } from "~/services/github/get-device-code"
import { getGitHubUser } from "~/services/github/get-user"
import { pollAccessToken } from "~/services/github/poll-access-token"

import { HTTPError } from "./error"
import { state } from "./state"

const readGithubToken = () => fs.readFile(PATHS.GITHUB_TOKEN_PATH, "utf8")

const writeGithubToken = (token: string) =>
  fs.writeFile(PATHS.GITHUB_TOKEN_PATH, token)

export const setupCopilotToken = async () => {
  const { token, refresh_in, endpoints } = await getCopilotToken()
  state.copilotToken = token

  consola.debug("GitHub Copilot Token fetched successfully!")
  if (state.showToken) {
    consola.info("Copilot token:", token)
  }

  applyAccountTypeFromEndpoint(endpoints?.api)

  const refreshInterval = (refresh_in - 60) * 1000
  let consecutiveFailures = 0

  const scheduleRefresh = () => {
    const delay =
      consecutiveFailures === 0 ? refreshInterval : (
        Math.min(
          refreshInterval * Math.pow(2, consecutiveFailures),
          refreshInterval * 4,
        )
      )

    state.tokenRefreshTimerId = setTimeout(async () => {
      consola.debug("Refreshing Copilot token")
      try {
        const { token: newToken } = await getCopilotToken()
        state.copilotToken = newToken
        consecutiveFailures = 0
        consola.debug("Copilot token refreshed")
        if (state.showToken) {
          consola.info("Refreshed Copilot token:", newToken)
        }
      } catch (error) {
        consecutiveFailures++
        consola.error(
          `Failed to refresh Copilot token (attempt ${consecutiveFailures}):`,
          error,
        )
      }
      scheduleRefresh()
    }, delay)
  }

  scheduleRefresh()
}

export function stopTokenRefresh() {
  if (state.tokenRefreshTimerId !== undefined) {
    clearTimeout(state.tokenRefreshTimerId)
    state.tokenRefreshTimerId = undefined
  }
}

let pendingRefresh: Promise<void> | null = null

/**
 * One-shot Copilot token refresh, deduped across concurrent callers.
 * Updates state.copilotToken; does not touch the periodic refresh timer.
 * Used by request error handlers when upstream returns 401.
 */
export function refreshCopilotToken(): Promise<void> {
  if (pendingRefresh) return pendingRefresh
  pendingRefresh = (async () => {
    try {
      const { token } = await getCopilotToken()
      state.copilotToken = token
      consola.debug("Copilot token refreshed on demand")
      if (state.showToken) {
        consola.info("Refreshed Copilot token (on demand):", token)
      }
    } finally {
      pendingRefresh = null
    }
  })()
  return pendingRefresh
}

interface SetupGitHubTokenOptions {
  force?: boolean
}

export async function setupGitHubToken(
  options?: SetupGitHubTokenOptions,
): Promise<void> {
  try {
    const githubToken = await readGithubToken()

    if (githubToken && !options?.force) {
      state.githubToken = githubToken
      if (state.showToken) {
        consola.info("GitHub token:", githubToken)
      }
      await logUser()

      return
    }

    const response = await getDeviceCode()
    consola.debug("Device code response:", response)

    consola.info(
      `Open ${response.verification_uri} and enter code: ${response.user_code}`,
    )

    const token = await pollAccessToken(response)
    await writeGithubToken(token)
    state.githubToken = token

    if (state.showToken) {
      consola.info("GitHub token:", token)
    }
    await logUser()
  } catch (error) {
    if (error instanceof HTTPError) {
      consola.error("Failed to get GitHub token:", await error.response.json())
      throw error
    }

    consola.error("Failed to get GitHub token:", error)
    throw error
  }
}

async function logUser() {
  const user = await getGitHubUser()
  consola.info(`Logged in as ${user.login}`)
}

const KNOWN_ACCOUNT_TYPES = new Set(["individual", "business", "enterprise"])

function applyAccountTypeFromEndpoint(apiUrl: string | undefined): void {
  const override = process.env.COPILOT_ACCOUNT_TYPE
  if (override) {
    state.accountType = override
    consola.info(`Account type from COPILOT_ACCOUNT_TYPE: ${override}`)
    return
  }

  if (!apiUrl) return

  // e.g. https://api.business.githubcopilot.com → "business"
  const match = /^https?:\/\/api\.([^.]+)\.githubcopilot\.com/.exec(apiUrl)
  const detected = match?.[1]
  if (!detected || !KNOWN_ACCOUNT_TYPES.has(detected)) return

  if (detected !== state.accountType) {
    consola.info(
      `Detected account type: ${detected} (was ${state.accountType})`,
    )
    state.accountType = detected
  }
}
