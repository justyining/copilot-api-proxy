import consola from "consola"

import { copilotBaseUrl, copilotHeaders } from "~/lib/api-config"
import {
  createAuthenticationError,
  createServiceUnavailableError,
  createTimeoutError,
  HTTPError,
} from "~/lib/error"
import { state } from "~/lib/state"

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

  const headers: Record<string, string> = {
    ...copilotHeaders(state),
    "openai-intent": "messages-proxy",
    "x-github-api-version": "2025-10-01",
    "X-Initiator": isAgentCall ? "agent" : "user",
  }

  let response: Response

  try {
    response = await fetch(`${copilotBaseUrl(state)}/v1/messages`, {
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

  if (!response.ok) {
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

  return response
}
