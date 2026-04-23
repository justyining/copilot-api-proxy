import type { Context } from "hono"

import consola from "consola"

import { awaitApproval } from "~/lib/approval"
import { checkRateLimit } from "~/lib/rate-limit"
import { state } from "~/lib/state"
import { validateAnthropicPayload } from "~/lib/validation"
import { createMessages } from "~/services/copilot/create-messages"

import type { AnthropicMessagesPayload } from "./anthropic-types"

import { translateModelName } from "./non-stream-translation"

function patchPayload(
  payload: AnthropicMessagesPayload,
): Record<string, unknown> {
  const patched: Record<string, unknown> = { ...payload }

  // Force thinking.type to "adaptive" (Copilot doesn't support "enabled")
  if (payload.thinking) {
    patched.thinking = { type: "adaptive" }
  }

  // Map model name to Copilot format
  patched.model = translateModelName(payload.model)

  return patched
}

export async function handleCompletion(c: Context) {
  await checkRateLimit(state)

  const payload = await c.req.json<AnthropicMessagesPayload>()

  // Validate the payload before processing
  validateAnthropicPayload(payload)

  consola.debug("Anthropic request payload:", JSON.stringify(payload))

  const patchedPayload = patchPayload(payload)
  consola.debug(
    "Patched payload for Copilot /v1/messages:",
    JSON.stringify(patchedPayload),
  )

  // Log model information for Anthropic requests
  const selectedModel = state.models?.data.find(
    (model) => model.id === patchedPayload.model,
  )
  if (selectedModel) {
    consola.info(`Selected model (Anthropic direct): ${selectedModel.id}`)
    consola.info(
      `  Model info: ${selectedModel.vendor} ${selectedModel.name} (${selectedModel.version})`,
    )
    consola.debug(`  Family: ${selectedModel.capabilities.family}`)
    if (selectedModel.capabilities.limits.max_output_tokens) {
      consola.debug(
        `  Max output tokens: ${selectedModel.capabilities.limits.max_output_tokens} tokens`,
      )
    }
  } else {
    consola.warn(
      `Model not found: requested="${patchedPayload.model}", original="${payload.model}", available=[${state.models?.data.map((m) => m.id).join(", ")}]`,
    )
  }

  if (state.manualApprove) {
    await awaitApproval()
  }

  const response = await createMessages(patchedPayload)

  if (payload.stream) {
    // Pipe the SSE response directly - it's already Anthropic format
    return new Response(response.body, {
      status: 200,
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache",
        connection: "keep-alive",
      },
    })
  }

  // Non-streaming: parse and return JSON
  const data = await response.json()
  consola.debug(
    "Non-streaming response from Copilot /v1/messages:",
    JSON.stringify(data),
  )
  return c.json(data)
}
