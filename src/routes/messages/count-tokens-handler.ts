import type { Context } from "hono"

import consola from "consola"

import { state } from "~/lib/state"
import { getTokenCount } from "~/lib/tokenizer"
import { validateAnthropicCountTokensPayload } from "~/lib/validation"

import { type AnthropicMessagesPayload } from "./anthropic-types"
import { translateModelName, translateToOpenAI } from "./non-stream-translation"

/**
 * Handles token counting for Anthropic messages
 */
export async function handleCountTokens(c: Context) {
  const anthropicBeta = c.req.header("anthropic-beta")

  const anthropicPayload = await c.req.json<AnthropicMessagesPayload>()

  // Validate the payload (max_tokens is optional for count_tokens)
  validateAnthropicCountTokensPayload(anthropicPayload)

  const openAIPayload = translateToOpenAI(anthropicPayload)

  const resolvedModelName = translateModelName(anthropicPayload.model)
  const selectedModel = state.models?.data.find(
    (model) => model.id === resolvedModelName,
  )

  if (!selectedModel) {
    consola.warn(
      `Model not found: resolved="${resolvedModelName}", original="${anthropicPayload.model}", available=[${state.models?.data.map((m) => m.id).join(", ")}]`,
    )
    return c.json({
      input_tokens: 1,
    })
  }

  const tokenCount = await getTokenCount(openAIPayload, selectedModel)

  const vendor = selectedModel.vendor
  const isAnthropic = vendor === "Anthropic"
  const isGrok = vendor === "xAI"

  if (anthropicPayload.tools && anthropicPayload.tools.length > 0) {
    let mcpToolExist = false
    if (anthropicBeta?.startsWith("claude-code")) {
      mcpToolExist = anthropicPayload.tools.some((tool) =>
        tool.name.startsWith("mcp__"),
      )
    }
    if (!mcpToolExist) {
      if (isAnthropic) {
        // https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/overview#pricing
        tokenCount.input = tokenCount.input + 346
      } else if (isGrok) {
        tokenCount.input = tokenCount.input + 480
      }
    }
  }

  let finalTokenCount = tokenCount.input + tokenCount.output
  if (isAnthropic) {
    finalTokenCount = Math.round(finalTokenCount * 1.15)
  } else if (isGrok) {
    finalTokenCount = Math.round(finalTokenCount * 1.03)
  }

  consola.info("Token count:", finalTokenCount)

  return c.json({
    input_tokens: finalTokenCount,
  })
}
