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

  // Map model name to Copilot format
  patched.model = translateModelName(payload.model)

  return patched
}

/**
 * Wrap the upstream SSE body so we log where the stream ends:
 *   - clean EOF  → total bytes + whether a `message_stop` event was seen
 *   - read error → upstream dropped the connection mid-flight (most likely
 *     cause of "socket connection was closed unexpectedly" on the client).
 */
function monitorStream(
  body: ReadableStream<Uint8Array> | null,
  model: string,
): ReadableStream<Uint8Array> | null {
  if (!body) {
    consola.warn(`[stream ${model}] upstream body is null`)
    return body
  }

  const started = Date.now()
  let bytes = 0
  let events = 0
  let sawMessageStop = false
  const recentEvents: Array<string> = []
  let buffered = ""

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = body.getReader()
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          bytes += value.byteLength
          const chunk = new TextDecoder().decode(value, { stream: true })
          buffered += chunk
          // Parse out `event: <name>` lines for diagnostic trailing context.
          const eventMatches = buffered.matchAll(/event: (\S+)/g)
          for (const m of eventMatches) {
            events += 1
            recentEvents.push(m[1])
            if (recentEvents.length > 6) recentEvents.shift()
            if (m[1] === "message_stop") sawMessageStop = true
          }
          // Keep only the tail in case of partial line at the end.
          const lastNl = buffered.lastIndexOf("\n\n")
          if (lastNl !== -1) buffered = buffered.slice(lastNl + 2)
          try {
            controller.enqueue(value)
          } catch (enqueueErr) {
            const ms = Date.now() - started
            consola.warn(
              `[stream ${model}] client disconnected mid-stream after ${bytes}B, ${events} events, ${ms}ms — last events: [${recentEvents.join(", ")}]`,
              (enqueueErr as Error).message,
            )
            await reader.cancel().catch(() => {})
            return
          }
        }
        const ms = Date.now() - started
        if (sawMessageStop) {
          consola.info(
            `[stream ${model}] done: ${bytes}B, ${events} events, ${ms}ms`,
          )
        } else {
          consola.warn(
            `[stream ${model}] upstream EOF WITHOUT message_stop: ${bytes}B, ${events} events, ${ms}ms — last events: [${recentEvents.join(", ")}]`,
          )
        }
        controller.close()
      } catch (err) {
        const ms = Date.now() - started
        consola.error(
          `[stream ${model}] upstream read error after ${bytes}B, ${events} events, ${ms}ms — last events: [${recentEvents.join(", ")}]:`,
          err,
        )
        try {
          controller.error(err)
        } catch {
          // controller already closed
        }
      }
    },
    cancel(reason) {
      const ms = Date.now() - started
      consola.warn(
        `[stream ${model}] client cancelled after ${bytes}B, ${events} events, ${ms}ms — last events: [${recentEvents.join(", ")}]:`,
        reason,
      )
    },
  })
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
    if (selectedModel.capabilities.limits?.max_output_tokens) {
      consola.debug(
        `  Max output tokens: ${selectedModel.capabilities.limits.max_output_tokens} tokens`,
      )
    }
  } else {
    consola.warn(
      `Model not found: requested="${patchedPayload.model as string}", original="${payload.model}", available=[${state.models?.data.map((m) => m.id).join(", ")}]`,
    )
  }

  if (state.manualApprove) {
    await awaitApproval()
  }

  const response = await createMessages(patchedPayload)

  if (payload.stream) {
    // Wrap the upstream body so we can observe where it ends / errors.
    const monitored = monitorStream(
      response.body,
      patchedPayload.model as string,
    )
    return new Response(monitored, {
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
