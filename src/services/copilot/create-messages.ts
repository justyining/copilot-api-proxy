import consola from "consola"

import { copilotBaseUrl, copilotHeaders } from "~/lib/api-config"
import {
  createAuthenticationError,
  createServiceUnavailableError,
  createTimeoutError,
  HTTPError,
} from "~/lib/error"
import { state } from "~/lib/state"

import { parseQuotaHeaders } from "./parse-quota-headers"

export async function createMessages(
  payload: Record<string, unknown>,
): Promise<Response> {
  if (!state.copilotToken) {
    throw createAuthenticationError("Copilot token not found")
  }

  // Determine initiator from messages
  const messages = payload.messages as Array<{ role: string }> | undefined
  const isAgentCall = messages?.some((msg) =>
    ["assistant", "tool"].includes(msg.role),
  )

  const headers = copilotHeaders({
    state,
    intent: "messages-proxy",
    interactionType: "messages-proxy",
    initiator: isAgentCall ? "agent" : "user",
  })

  const response = await fetchWithErrorHandling(
    `${copilotBaseUrl(state)}/v1/messages`,
    headers,
    payload,
  )

  // Track quota info from response headers
  parseQuotaHeaders(response.headers)

  if (!response.ok) {
    return handleErrorResponse(response, payload)
  }

  return response
}

async function fetchWithErrorHandling(
  url: string,
  headers: Record<string, string>,
  payload: Record<string, unknown>,
): Promise<Response> {
  try {
    return await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    })
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

/**
 * Attempt to patch the payload based on a 400 error message.
 * Returns a patched copy if the error is recoverable, or null otherwise.
 */
function tryPatchFromError(
  payload: Record<string, unknown>,
  errorBody: CopilotErrorResponse,
): Record<string, unknown> | null {
  const message = errorBody.error?.message ?? ""

  // "thinking.type.enabled" not supported → force adaptive
  if (
    message.includes("thinking.type")
    && message.includes("is not supported")
  ) {
    const patched = { ...payload }
    if (patched.thinking) {
      patched.thinking = { type: "adaptive" }
    }
    return patched
  }

  return null
}
