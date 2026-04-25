import consola from "consola"

import { copilotBaseUrl, copilotHeaders } from "~/lib/api-config"
import {
  createAuthenticationError,
  createServiceUnavailableError,
  createTimeoutError,
  HTTPError,
} from "~/lib/error"
import { state } from "~/lib/state"

/**
 * Normalize thinking.type per the target model's capabilities:
 *   - adaptive_thinking=true  (opus-4.6/4.7, sonnet-4.6)  → { type: "adaptive" }
 *     (budget_tokens is not accepted — the model picks its own)
 *   - adaptive_thinking=false (sonnet-4.5, opus-4.5, haiku-4.5)
 *                                                → { type: "enabled", budget_tokens }
 *     clamped to [min_thinking_budget, max_thinking_budget]
 *   - "disabled" → strip thinking + context_management entirely
 */
function normalizeThinking(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const thinking = payload.thinking as
    | { type?: string; budget_tokens?: number }
    | undefined

  if (thinking?.type === "disabled") {
    const patched = { ...payload }
    delete patched.thinking
    delete patched.context_management
    return patched
  }

  if (thinking?.type !== "adaptive" && thinking?.type !== "enabled") {
    return payload
  }

  const modelId = payload.model as string | undefined
  const supports = state.models?.data.find((m) => m.id === modelId)
    ?.capabilities.supports
  const maxBudget = supports?.max_thinking_budget ?? 10000
  const minBudget = supports?.min_thinking_budget ?? 1024

  if (supports?.adaptive_thinking) {
    return { ...payload, thinking: { type: "adaptive" } }
  }

  const requested = thinking.budget_tokens ?? maxBudget
  const clamped = Math.min(Math.max(requested, minBudget), maxBudget)
  return {
    ...payload,
    thinking: { type: "enabled", budget_tokens: clamped },
  }
}

/**
 * Normalize output_config.effort based on the target model's capabilities:
 *   - Model doesn't support reasoning_effort  → strip `effort`
 *   - Model supports only a subset (e.g. opus-4.7 → ["medium"])  → clamp to
 *     the closest supported value.
 */
function normalizeReasoningEffort(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const outputConfig = payload.output_config as { effort?: string } | undefined
  const requested = outputConfig?.effort
  if (!requested) return payload

  const modelId = payload.model as string | undefined
  const model = state.models?.data.find((m) => m.id === modelId)
  const supported = model?.capabilities.supports.reasoning_effort

  if (!supported || supported.length === 0) {
    // Model does not advertise reasoning_effort — drop the field.
    return stripOutputConfigEffort(payload)
  }

  if (supported.includes(requested)) return payload

  // Clamp to closest: prefer the same tier direction, fall back to any.
  const order = ["low", "medium", "high"]
  const reqIdx = order.indexOf(requested)
  const chosen =
    [...supported].sort(
      (a, b) =>
        Math.abs(order.indexOf(a) - reqIdx)
        - Math.abs(order.indexOf(b) - reqIdx),
    )[0] ?? supported[0]

  return {
    ...payload,
    output_config: {
      ...(outputConfig as Record<string, unknown>),
      effort: chosen,
    },
  }
}

/**
 * Warn (don't block) when the payload contains image blocks but the target
 * model doesn't advertise vision support — upstream will likely 400.
 */
function warnIfVisionUnsupported(
  payload: Record<string, unknown>,
  messages: Array<{ role: string; content?: unknown }> | undefined,
): void {
  if (!messages) return

  const hasImage = messages.some((m) => {
    if (!Array.isArray(m.content)) return false
    return (m.content as Array<{ type?: string }>).some(
      (b) => b.type === "image",
    )
  })
  if (!hasImage) return

  const modelId = payload.model as string | undefined
  const model = state.models?.data.find((m) => m.id === modelId)
  if (model && !model.capabilities.supports.vision) {
    consola.warn(
      `Model ${modelId} does not support vision, but request contains image blocks — upstream will likely reject it.`,
    )
  }
}

function stripOutputConfigEffort(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const patched = { ...payload }
  const oc = { ...(patched.output_config as Record<string, unknown>) }
  delete oc.effort
  if (Object.keys(oc).length > 0) {
    patched.output_config = oc
  } else {
    delete patched.output_config
  }
  return patched
}

/**
 * Inject metadata.user_id and context_management if not present.
 */
function injectDefaults(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const patched = { ...payload }

  if (!patched.metadata) {
    patched.metadata = {
      user_id: JSON.stringify({
        device_id: state.deviceId ?? "",
        account_uuid: "",
        session_id: state.sessionId ?? "",
      }),
    }
  }

  if (!patched.context_management && patched.thinking) {
    patched.context_management = {
      edits: [{ type: "clear_thinking_20251015", keep: "all" }],
    }
  }

  return patched
}

export async function createMessages(
  rawPayload: Record<string, unknown>,
): Promise<Response> {
  if (!state.copilotToken) {
    throw createAuthenticationError("Copilot token not found")
  }

  const payload = injectDefaults(
    normalizeReasoningEffort(normalizeThinking(rawPayload)),
  )

  const messages = payload.messages as
    | Array<{ role: string; content?: unknown }>
    | undefined
  const isAgentCall = messages?.some((msg) =>
    ["assistant", "tool"].includes(msg.role),
  )

  warnIfVisionUnsupported(payload, messages)

  const headers = copilotHeaders({
    state,
    intent: "messages-proxy",
    interactionType: "messages-proxy",
    initiator: isAgentCall ? "agent" : "user",
  })

  const url = `${copilotBaseUrl(state)}/v1/messages`
  const body = JSON.stringify(payload)
  consola.info(
    `→ Copilot endpoint: POST ${url} (body ${formatBytes(body.length)})`,
  )

  const response = await fetchWithRetry(url, { headers, body })

  if (!response.ok) {
    return handleErrorResponse(response, payload)
  }

  return response
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n}B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KiB`
  return `${(n / (1024 * 1024)).toFixed(2)}MiB`
}

/**
 * Retry on transient upload failures.
 * Copilot occasionally returns 408 user_request_timeout when the body
 * upload takes longer than their server-side limit (~60s).
 */
interface FetchRetryOptions {
  headers: Record<string, string>
  body: string
  maxAttempts?: number
}

async function fetchWithRetry(
  url: string,
  { headers, body, maxAttempts = 5 }: FetchRetryOptions,
): Promise<Response> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const response = await fetchOnce(url, headers, body)

    // 408 / 504 are retriable upload timeouts.
    if (response.status !== 408 && response.status !== 504) return response
    if (attempt === maxAttempts) return response

    const backoffMs = Math.min(500 * 2 ** (attempt - 1), 10_000)
    consola.warn(
      `Copilot returned ${response.status}; retrying in ${backoffMs}ms (attempt ${attempt + 1}/${maxAttempts})`,
    )

    await new Promise((r) => setTimeout(r, backoffMs))
  }
  // Unreachable, but TS needs it.
  throw new Error("fetchWithRetry exhausted without returning")
}

async function fetchOnce(
  url: string,
  headers: Record<string, string>,
  body: string,
): Promise<Response> {
  try {
    return await fetch(url, { method: "POST", headers, body })
  } catch (error) {
    consola.error("Network error creating messages:", error)
    if (error instanceof TypeError && error.message.includes("fetch")) {
      throw createServiceUnavailableError(
        "Unable to connect to GitHub Copilot service. Please check your network connection.",
      )
    }
    throw createServiceUnavailableError(
      "GitHub Copilot service is temporarily unavailable",
    )
  }
}

async function handleErrorResponse(
  response: Response,
  originalPayload: Record<string, unknown>,
): Promise<Response> {
  if (response.status === 400) {
    const errorBody = await readErrorBody(response)
    const patched = tryPatchFromError(originalPayload, errorBody)

    if (patched) {
      consola.warn(
        "Retrying /v1/messages with patched payload after 400 error:",
        errorBody.error?.message ?? "unknown",
      )
      return createMessages(patched)
    }

    throw new HTTPError(
      `Failed to create messages: ${errorBody.error?.message ?? response.statusText}`,
      new Response(JSON.stringify(errorBody), {
        status: response.status,
        headers: response.headers,
      }),
    )
  }

  consola.error(
    "Failed to create messages",
    response.status,
    response.statusText,
  )

  if (response.status === 401) {
    throw createAuthenticationError("Invalid or expired GitHub Copilot token")
  }

  if (response.status === 503) {
    throw createServiceUnavailableError(
      "GitHub Copilot service is temporarily unavailable",
    )
  }

  if (response.status === 504) {
    throw createTimeoutError("Request to GitHub Copilot timed out")
  }

  throw new HTTPError("Failed to create messages", response)
}

interface CopilotErrorResponse {
  type?: string
  error?: {
    type?: string
    message?: string
  }
  request_id?: string
}

async function readErrorBody(
  response: Response,
): Promise<CopilotErrorResponse> {
  try {
    return (await response.json()) as CopilotErrorResponse
  } catch {
    return {}
  }
}

function hasThinkingBlocks(payload: Record<string, unknown>): boolean {
  const messages = payload.messages as Array<{ content?: unknown }> | undefined
  if (!Array.isArray(messages)) return false
  return messages.some(
    (m) =>
      Array.isArray(m.content)
      && (m.content as Array<{ type?: string }>).some(
        (b) => b.type === "thinking" || b.type === "redacted_thinking",
      ),
  )
}

function stripThinkingBlocks(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const messages = payload.messages as
    | Array<{ role: string; content: unknown }>
    | undefined
  if (!Array.isArray(messages)) return payload

  const cleaned = messages.map((msg) => {
    if (!Array.isArray(msg.content)) return msg
    const filtered = (msg.content as Array<{ type?: string }>).filter(
      (b) => b.type !== "thinking" && b.type !== "redacted_thinking",
    )
    return { ...msg, content: filtered }
  })

  return { ...payload, messages: cleaned }
}

function tryPatchFromError(
  payload: Record<string, unknown>,
  errorBody: CopilotErrorResponse,
): Record<string, unknown> | null {
  const message = errorBody.error?.message ?? ""

  if (
    message.includes("thinking")
    && (message.includes("does not match")
      || message.includes("Invalid signature"))
  ) {
    const hadThinking =
      hasThinkingBlocks(payload)
      || payload.thinking !== undefined
      || payload.context_management !== undefined
    if (!hadThinking) {
      consola.warn(
        "Copilot rejected thinking signature but payload has no thinking blocks — giving up to avoid retry loop.",
      )
      return null
    }
    const patched = stripThinkingBlocks({ ...payload })
    delete patched.thinking
    delete patched.context_management
    return patched
  }

  // Haiku (and some other models) reject output_config.effort.
  // Drop reasoning-effort-related fields and retry.
  if (
    message.includes("does not support reasoning effort")
    || message.includes("invalid_reasoning_effort")
  ) {
    const patched = { ...payload }
    if (patched.output_config && typeof patched.output_config === "object") {
      const oc = { ...(patched.output_config as Record<string, unknown>) }
      delete oc.effort
      patched.output_config = Object.keys(oc).length > 0 ? oc : undefined
      if (patched.output_config === undefined) delete patched.output_config
    }
    return patched
  }

  return null
}
