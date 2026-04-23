import type { ModelsResponse } from "~/services/copilot/get-models"

export type ClientMode = "claude-code" | "codex"

export interface QuotaInfo {
  chat?: QuotaSnapshot
  completions?: QuotaSnapshot
  premiumInteractions?: QuotaSnapshot
  rateLimitSession?: RateLimitSnapshot
  rateLimitWeekly?: RateLimitSnapshot
  lastUpdated?: number
}

export interface QuotaSnapshot {
  entitlement: number
  overage: number
  overagePermitted: boolean
  remaining: number
  resetAt?: string
}

export interface RateLimitSnapshot {
  entitlement: number
  overage: number
  overagePermitted: boolean
  remaining: number
  resetAt?: string
}

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

  // Token refresh timer
  tokenRefreshTimerId?: ReturnType<typeof setTimeout>

  // Quota tracking from Copilot response headers
  quotaInfo?: QuotaInfo
}

export const state: State = {
  accountType: "individual",
  clientMode: "claude-code",
  copilotVersion: "0.45.0",
  manualApprove: false,
  rateLimitWait: false,
  showToken: false,
}
