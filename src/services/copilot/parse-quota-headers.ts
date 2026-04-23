import consola from "consola"

import type { QuotaSnapshot } from "~/lib/state"

import { state } from "../../lib/state"

/**
 * Parse quota-related response headers from Copilot API responses
 * and update state.quotaInfo.
 *
 * Relevant headers:
 *   x-quota-snapshot-chat: ent=-1&ov=0.0&ovPerm=false&rem=100.0&rst=...
 *   x-quota-snapshot-completions: ...
 *   x-quota-snapshot-premium_interactions: ...
 *   x-usage-ratelimit-session: ...
 *   x-usage-ratelimit-weekly: ...
 */
export function parseQuotaHeaders(headers: {
  get?: (name: string) => string | null
}): void {
  const chat = parseSnapshotHeader(headers, "x-quota-snapshot-chat")
  const completions = parseSnapshotHeader(
    headers,
    "x-quota-snapshot-completions",
  )
  const premiumInteractions = parseSnapshotHeader(
    headers,
    "x-quota-snapshot-premium_interactions",
  )
  const rateLimitSession = parseSnapshotHeader(
    headers,
    "x-usage-ratelimit-session",
  )
  const rateLimitWeekly = parseSnapshotHeader(
    headers,
    "x-usage-ratelimit-weekly",
  )

  if (
    !chat
    && !completions
    && !premiumInteractions
    && !rateLimitSession
    && !rateLimitWeekly
  ) {
    return
  }

  state.quotaInfo = {
    chat: chat ?? state.quotaInfo?.chat,
    completions: completions ?? state.quotaInfo?.completions,
    premiumInteractions:
      premiumInteractions ?? state.quotaInfo?.premiumInteractions,
    rateLimitSession: rateLimitSession ?? state.quotaInfo?.rateLimitSession,
    rateLimitWeekly: rateLimitWeekly ?? state.quotaInfo?.rateLimitWeekly,
    lastUpdated: Date.now(),
  }

  consola.debug("Quota info updated:", JSON.stringify(state.quotaInfo))
}

function parseSnapshotHeader(
  headers: { get?: (name: string) => string | null },
  headerName: string,
): QuotaSnapshot | undefined {
  if (!headers.get) return undefined
  const value = headers.get(headerName)
  if (!value) return undefined

  const params = new URLSearchParams(value)
  return {
    entitlement: Number.parseFloat(params.get("ent") ?? "0"),
    overage: Number.parseFloat(params.get("ov") ?? "0"),
    overagePermitted: params.get("ovPerm") === "true",
    remaining: Number.parseFloat(params.get("rem") ?? "0"),
    resetAt: params.get("rst") ?? undefined,
  }
}
