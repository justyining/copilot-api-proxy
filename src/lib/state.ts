import type { ModelsResponse } from "~/services/copilot/get-models"

export type ClientMode = "claude-code" | "codex"

export interface State {
  githubToken?: string
  copilotToken?: string

  accountType: string
  models?: ModelsResponse
  vsCodeVersion?: string

  // Persistent identity (loaded from files)
  deviceId?: string
  machineId?: string

  // Per-startup identity
  sessionId?: string
  interactionId?: string

  // Client mode determines header profile
  clientMode: ClientMode
  copilotVersion: string

  manualApprove: boolean
  rateLimitWait: boolean
  showToken: boolean

  // Rate limiting configuration
  rateLimitSeconds?: number
  lastRequestTimestamp?: number

  // Server port (set during startup)
  port?: number

  // Token refresh timer
  tokenRefreshTimerId?: ReturnType<typeof setTimeout>
}

export const state: State = {
  accountType: "individual",
  clientMode: "claude-code",
  copilotVersion: "0.45.0",
  manualApprove: false,
  rateLimitWait: false,
  showToken: false,
}
