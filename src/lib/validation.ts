/**
 * Comprehensive validation utilities for API requests
 * Based on api-reference.md and error-codes.md specifications
 */

import type {
  AnthropicMessage,
  AnthropicMessagesPayload,
  AnthropicTool,
  AnthropicUserContentBlock,
} from "~/routes/messages/anthropic-types"
import type {
  ChatCompletionsPayload,
  Message,
  Tool,
} from "~/services/copilot/create-chat-completions"

import { createInvalidRequestError, createValidationError } from "~/lib/error"

// ---------------------------------------------------------------------------
// Shared types for validation
// ---------------------------------------------------------------------------

interface ValidatedAnthropicBase {
  model: string
  messages: Array<AnthropicMessage>
  temperature?: number | null
  top_p?: number | null
  top_k?: number | null
  stream?: boolean | null
  system?: string | AnthropicMessagesPayload["system"] | null
  stop_sequences?: Array<string> | null
  tools?: Array<AnthropicTool> | null
  tool_choice?: AnthropicMessagesPayload["tool_choice"] | null
  thinking?: AnthropicMessagesPayload["thinking"] | null
  service_tier?: string | null
  metadata?: AnthropicMessagesPayload["metadata"] | null
}

interface ImageSource {
  type: string
  media_type: string
  data: string
}

interface ImageBlock {
  type: "image"
  source?: ImageSource
}

interface ToolResultBlock {
  type: "tool_result"
  tool_use_id?: string
  content?: unknown
  is_error?: boolean
}

interface ToolUseBlock {
  type: "tool_use"
  id?: string
  name?: string
  input?: Record<string, unknown>
}

interface ThinkingBlock {
  type: "thinking"
  thinking: string
}

interface RedactedThinkingBlock {
  type: "redacted_thinking"
  data: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function assertNumberInRange(
  value: unknown,
  field: string,
  range: { min: number; max: number },
): void {
  if (typeof value !== "number") {
    throw createValidationError(`${field}: must be a number`)
  }
  if (value < range.min || value > range.max) {
    throw createValidationError(
      `${field}: must be between ${range.min} and ${range.max}`,
    )
  }
}

function assertPositiveInteger(value: unknown, field: string): void {
  if (typeof value !== "number") {
    throw createValidationError(`${field}: must be a number`)
  }
  if (value <= 0 || !Number.isInteger(value)) {
    throw createValidationError(`${field}: must be a positive integer`)
  }
}

function assertStringArray(value: unknown, field: string): void {
  if (!Array.isArray(value)) {
    throw createValidationError(`${field}: must be an array`)
  }
  for (const item of value) {
    if (typeof item !== "string") {
      throw createValidationError(`${field}: all elements must be strings`)
    }
  }
}

function isPresent<T>(value: T | undefined | null): value is T {
  return value !== undefined && value !== null
}

function contentBlockPath(msgIdx: number, blockIdx: number): string {
  return `messages[${msgIdx}].content[${blockIdx}]`
}

// ---------------------------------------------------------------------------
// Anthropic scalar / field validators (small, focused functions)
// ---------------------------------------------------------------------------

function validateStream(stream: unknown): void {
  if (isPresent(stream) && typeof stream !== "boolean") {
    throw createValidationError("stream: must be a boolean")
  }
}

function validateTemperature(temp: unknown, max = 1): void {
  if (!isPresent(temp)) return
  assertNumberInRange(temp, "temperature", { min: 0, max })
}

function validateTopP(topP: unknown): void {
  if (!isPresent(topP)) return
  assertNumberInRange(topP, "top_p", { min: 0, max: 1 })
}

function validateTopK(topK: unknown): void {
  if (!isPresent(topK)) return
  if (typeof topK !== "number" || topK <= 0 || !Number.isInteger(topK)) {
    throw createValidationError("top_k: must be a positive integer")
  }
}

function validateSystem(system: unknown): void {
  if (!isPresent(system)) return
  if (typeof system === "string") return
  if (!Array.isArray(system)) {
    throw createValidationError(
      "system: must be a string or array of text blocks",
    )
  }
  for (const block of system) {
    if (
      !block
      || typeof block !== "object"
      || (block as { type: string }).type !== "text"
    ) {
      throw createValidationError(
        "system: array elements must be text blocks with type 'text'",
      )
    }
    if (typeof (block as { text: unknown }).text !== "string") {
      throw createValidationError(
        "system: text blocks must have a 'text' string field",
      )
    }
  }
}

function validateAnthropicTools(tools: unknown): void {
  if (!isPresent(tools)) return
  if (!Array.isArray(tools)) {
    throw createValidationError("tools: must be an array")
  }
  for (const [i, tool] of tools.entries()) {
    validateAnthropicTool(tool, i)
  }
}

function validateToolChoice(toolChoice: unknown): void {
  if (!isPresent(toolChoice)) return
  if (typeof toolChoice !== "object") {
    throw createValidationError("tool_choice: must be an object")
  }
  const tc = toolChoice as { type?: string; name?: unknown }
  const validTypes = ["auto", "any", "tool", "none"]
  if (!validTypes.includes(tc.type ?? "")) {
    throw createValidationError(
      `tool_choice.type: must be one of ${validTypes.join(", ")}`,
    )
  }
  if (tc.type === "tool" && typeof tc.name !== "string") {
    throw createValidationError(
      "tool_choice.name: required when type is 'tool'",
    )
  }
}

function validateThinking(thinking: unknown): void {
  if (!isPresent(thinking)) return
  if (typeof thinking !== "object") {
    throw createValidationError("thinking: must be an object")
  }
  const t = thinking as { type?: string; budget_tokens?: unknown }
  const validTypes = ["enabled", "disabled", "adaptive"]
  if (!validTypes.includes(t.type ?? "")) {
    throw createValidationError(
      `thinking.type: must be one of ${validTypes.join(", ")}`,
    )
  }
  if (
    isPresent(t.budget_tokens)
    && (typeof t.budget_tokens !== "number" || t.budget_tokens <= 0)
  ) {
    throw createValidationError(
      "thinking.budget_tokens: must be a positive number",
    )
  }
}

function validateServiceTier(tier: unknown): void {
  if (!isPresent(tier)) return
  const validTiers = ["auto", "standard_only"]
  if (!validTiers.includes(tier as string)) {
    throw createValidationError(
      `service_tier: must be one of ${validTiers.join(", ")}`,
    )
  }
}

function validateMetadata(metadata: unknown): void {
  if (!isPresent(metadata)) return
  if (typeof metadata !== "object") {
    throw createValidationError("metadata: must be an object")
  }
  const userId = (metadata as { user_id?: unknown }).user_id
  if (isPresent(userId) && typeof userId !== "string") {
    throw createValidationError("metadata.user_id: must be a string")
  }
}

// ---------------------------------------------------------------------------
// Anthropic message & content block validators
// ---------------------------------------------------------------------------

function validateAnthropicCommonFields(p: ValidatedAnthropicBase): void {
  validateStream(p.stream)
  validateTemperature(p.temperature)
  validateTopP(p.top_p)
  validateTopK(p.top_k)

  for (let i = 0; i < p.messages.length; i++) {
    validateAnthropicMessage(p.messages[i], i)
  }

  validateSystem(p.system)
  if (isPresent(p.stop_sequences))
    assertStringArray(p.stop_sequences, "stop_sequences")
  validateAnthropicTools(p.tools)
  validateToolChoice(p.tool_choice)
  validateThinking(p.thinking)
  validateServiceTier(p.service_tier)
  validateMetadata(p.metadata)
}

function validateAnthropicMessage(
  message: unknown,
  index: number,
): asserts message is AnthropicMessage {
  if (!message || typeof message !== "object") {
    throw createValidationError(`messages[${index}]: must be an object`)
  }

  const m = message as Partial<AnthropicMessage>

  const validRoles = ["user", "assistant", "tool"]
  if (!m.role || !validRoles.includes(m.role)) {
    throw createValidationError(
      `messages[${index}].role: must be one of ${validRoles.join(", ")}`,
    )
  }

  if (!isPresent(m.content)) {
    throw createValidationError(
      `messages[${index}].content: required field missing`,
    )
  }
  if (typeof m.content !== "string" && !Array.isArray(m.content)) {
    throw createValidationError(
      `messages[${index}].content: must be a string or array`,
    )
  }

  if (Array.isArray(m.content)) {
    if (m.content.length === 0) {
      throw createValidationError(
        `messages[${index}].content: array must not be empty`,
      )
    }
    for (let i = 0; i < m.content.length; i++) {
      validateAnthropicContentBlock(m.content[i], index, i)
    }
  }
}

function validateAnthropicContentBlock(
  block: unknown,
  messageIndex: number,
  blockIndex: number,
): void {
  if (!block || typeof block !== "object") {
    throw createValidationError(
      `${contentBlockPath(messageIndex, blockIndex)}: must be an object`,
    )
  }

  const b = block as Partial<AnthropicUserContentBlock>

  if (!b.type || typeof b.type !== "string") {
    throw createValidationError(
      `${contentBlockPath(messageIndex, blockIndex)}.type: required field missing`,
    )
  }

  const path = contentBlockPath(messageIndex, blockIndex)

  switch (b.type) {
    case "text": {
      validateTextBlock(b, path)
      break
    }
    case "image": {
      validateImageBlock(block as ImageBlock, path)
      break
    }
    case "tool_result": {
      validateToolResultBlock(block as ToolResultBlock, path)
      break
    }
    case "tool_use": {
      validateToolUseBlock(block as ToolUseBlock, path)
      break
    }
    case "thinking": {
      validateThinkingBlock(block as ThinkingBlock, path)
      break
    }
    case "redacted_thinking": {
      validateRedactedThinkingBlock(block as RedactedThinkingBlock, path)
      break
    }
    default: {
      throw createValidationError(
        `${path}.type: unsupported block type '${b.type as string}'`,
      )
    }
  }
}

function validateTextBlock(
  b: Partial<AnthropicUserContentBlock>,
  path: string,
): void {
  if (typeof b.text !== "string") {
    throw createValidationError(`${path}.text: must be a string`)
  }
}

function validateImageBlock(b: ImageBlock, path: string): void {
  if (!b.source || typeof b.source !== "object") {
    throw createValidationError(`${path}.source: required for image blocks`)
  }
  if (b.source.type !== "base64") {
    throw createValidationError(`${path}.source.type: must be 'base64'`)
  }
  const validMediaTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"]
  if (!validMediaTypes.includes(b.source.media_type)) {
    throw createValidationError(
      `${path}.source.media_type: must be one of ${validMediaTypes.join(", ")}`,
    )
  }
  if (typeof b.source.data !== "string") {
    throw createValidationError(`${path}.source.data: must be a base64 string`)
  }
}

function validateToolResultBlock(b: ToolResultBlock, path: string): void {
  if (typeof b.tool_use_id !== "string") {
    throw createValidationError(
      `${path}.tool_use_id: required for tool_result blocks`,
    )
  }
  if (b.content === undefined) {
    throw createValidationError(
      `${path}.content: required for tool_result blocks`,
    )
  }
  if (b.is_error !== undefined && typeof b.is_error !== "boolean") {
    throw createValidationError(`${path}.is_error: must be a boolean`)
  }
}

function validateToolUseBlock(b: ToolUseBlock, path: string): void {
  if (typeof b.id !== "string") {
    throw createValidationError(`${path}.id: required for tool_use blocks`)
  }
  if (typeof b.name !== "string") {
    throw createValidationError(`${path}.name: required for tool_use blocks`)
  }
  if (!b.input || typeof b.input !== "object") {
    throw createValidationError(`${path}.input: must be an object`)
  }
}

function validateThinkingBlock(b: ThinkingBlock, path: string): void {
  if (typeof b.thinking !== "string") {
    throw createValidationError(`${path}.thinking: must be a string`)
  }
}

function validateRedactedThinkingBlock(
  b: RedactedThinkingBlock,
  path: string,
): void {
  if (typeof b.data !== "string") {
    throw createValidationError(`${path}.data: must be a string`)
  }
}

// ---------------------------------------------------------------------------
// Anthropic tool definition validator
// ---------------------------------------------------------------------------

function validateAnthropicTool(
  tool: unknown,
  index: number,
): asserts tool is AnthropicTool {
  if (!tool || typeof tool !== "object") {
    throw createValidationError(`tools[${index}]: must be an object`)
  }

  const t = tool as Partial<AnthropicTool>

  if (!t.name || typeof t.name !== "string") {
    throw createValidationError(`tools[${index}].name: required field missing`)
  }
  if (t.description !== undefined && typeof t.description !== "string") {
    throw createValidationError(`tools[${index}].description: must be a string`)
  }
  if (!t.input_schema || typeof t.input_schema !== "object") {
    throw createValidationError(
      `tools[${index}].input_schema: required and must be an object (JSON Schema)`,
    )
  }
}

// ---------------------------------------------------------------------------
// Anthropic payload validators (public API)
// ---------------------------------------------------------------------------

function validateAnthropicBase(
  payload: unknown,
): asserts payload is Partial<AnthropicMessagesPayload> {
  if (!payload || typeof payload !== "object") {
    throw createInvalidRequestError("Request body must be a valid JSON object")
  }

  const p = payload as Partial<AnthropicMessagesPayload>

  if (!p.model || typeof p.model !== "string") {
    throw createInvalidRequestError(
      "model: required field missing or invalid type",
    )
  }
  if (!p.messages || !Array.isArray(p.messages)) {
    throw createInvalidRequestError(
      "messages: required field missing or must be an array",
    )
  }
  if (p.messages.length === 0) {
    throw createInvalidRequestError("messages: array must not be empty")
  }

  return p as never
}

export function validateAnthropicPayload(
  payload: unknown,
): asserts payload is AnthropicMessagesPayload {
  validateAnthropicBase(payload)

  const p = payload

  if (typeof p.max_tokens !== "number") {
    throw createInvalidRequestError(
      "max_tokens: required field missing or must be a number",
    )
  }
  assertPositiveInteger(p.max_tokens, "max_tokens")

  validateAnthropicCommonFields(p as ValidatedAnthropicBase)
}

export function validateAnthropicCountTokensPayload(
  payload: unknown,
): asserts payload is Omit<AnthropicMessagesPayload, "max_tokens"> & {
  max_tokens?: number
} {
  validateAnthropicBase(payload)

  const p = payload

  // max_tokens is optional for count_tokens
  if (isPresent(p.max_tokens)) {
    assertPositiveInteger(p.max_tokens, "max_tokens")
  }

  validateAnthropicCommonFields(p as ValidatedAnthropicBase)
}

// ---------------------------------------------------------------------------
// OpenAI Chat Completions validators
// ---------------------------------------------------------------------------

function validateChatNumericParams(p: Partial<ChatCompletionsPayload>): void {
  if (isPresent(p.temperature))
    assertNumberInRange(p.temperature, "temperature", { min: 0, max: 2 })
  if (isPresent(p.top_p))
    assertNumberInRange(p.top_p, "top_p", { min: 0, max: 1 })
  if (isPresent(p.max_tokens)) assertPositiveInteger(p.max_tokens, "max_tokens")
  if (isPresent(p.frequency_penalty)) {
    assertNumberInRange(p.frequency_penalty, "frequency_penalty", {
      min: -2,
      max: 2,
    })
  }
  if (isPresent(p.presence_penalty)) {
    assertNumberInRange(p.presence_penalty, "presence_penalty", {
      min: -2,
      max: 2,
    })
  }
  if (
    isPresent(p.n)
    && (typeof p.n !== "number" || !Number.isInteger(p.n) || p.n < 1)
  ) {
    throw createValidationError("n: must be a positive integer")
  }
}

function validateChatToolChoice(toolChoice: unknown): void {
  if (!isPresent(toolChoice)) return

  if (typeof toolChoice === "string") {
    const valid = ["none", "auto", "required"]
    if (!valid.includes(toolChoice)) {
      throw createValidationError(
        `tool_choice: must be one of ${valid.join(", ")} or an object`,
      )
    }
    return
  }

  if (typeof toolChoice === "object") {
    const tc = toolChoice as { type?: string; function?: { name?: unknown } }
    if (tc.type !== "function") {
      throw createValidationError("tool_choice.type: must be 'function'")
    }
    if (!tc.function || typeof tc.function.name !== "string") {
      throw createValidationError(
        "tool_choice.function.name: required when specifying a function",
      )
    }
    return
  }

  throw createValidationError("tool_choice: must be a string or object")
}

function validateChatStop(stop: unknown): void {
  if (!isPresent(stop)) return
  if (typeof stop === "string") return
  assertStringArray(stop, "stop")
}

export function validateChatCompletionsPayload(
  payload: unknown,
): asserts payload is ChatCompletionsPayload {
  if (!payload || typeof payload !== "object") {
    throw createInvalidRequestError("Request body must be a valid JSON object")
  }

  const p = payload as Partial<ChatCompletionsPayload>

  if (!p.model || typeof p.model !== "string") {
    throw createInvalidRequestError(
      "model: required field missing or invalid type",
    )
  }
  if (!p.messages || !Array.isArray(p.messages)) {
    throw createInvalidRequestError(
      "messages: required field missing or must be an array",
    )
  }
  if (p.messages.length === 0) {
    throw createInvalidRequestError("messages: array must not be empty")
  }

  validateChatNumericParams(p)

  for (let i = 0; i < p.messages.length; i++) {
    validateChatMessage(p.messages[i], i)
  }

  // Validate tools
  if (isPresent(p.tools)) {
    if (!Array.isArray(p.tools)) {
      throw createValidationError("tools: must be an array")
    }
    for (let i = 0; i < p.tools.length; i++) {
      validateChatTool(p.tools[i], i)
    }
  }

  validateChatToolChoice(p.tool_choice)
  validateChatStop(p.stop)
  validateStream(p.stream)
}

function validateChatMessage(
  message: unknown,
  index: number,
): asserts message is Message {
  if (!message || typeof message !== "object") {
    throw createValidationError(`messages[${index}]: must be an object`)
  }

  const m = message as Partial<Message>

  const validRoles = ["user", "assistant", "system", "tool", "developer"]
  if (!m.role || !validRoles.includes(m.role)) {
    throw createValidationError(
      `messages[${index}].role: must be one of ${validRoles.join(", ")}`,
    )
  }

  if (m.role === "tool" && typeof m.tool_call_id !== "string") {
    throw createValidationError(
      `messages[${index}].tool_call_id: required for tool messages`,
    )
  }

  validateChatContent(m.content, index)
  validateChatToolCalls(m.tool_calls, index)
}

function validateChatContent(content: unknown, msgIndex: number): void {
  if (!isPresent(content)) return
  if (typeof content === "string") return
  if (!Array.isArray(content)) {
    throw createValidationError(
      `messages[${msgIndex}].content: must be a string, array, or null`,
    )
  }

  for (const [i, part] of content.entries()) {
    if (!part || typeof part !== "object") {
      throw createValidationError(
        `messages[${msgIndex}].content[${i}]: must be an object`,
      )
    }

    const p = part as {
      type?: string
      text?: unknown
      image_url?: { url?: unknown; detail?: string }
    }

    if (p.type === "text") {
      validateChatTextPart(p, msgIndex, i)
    } else if (p.type === "image_url") {
      validateChatImagePart(p, msgIndex, i)
    } else {
      throw createValidationError(
        `messages[${msgIndex}].content[${i}].type: must be 'text' or 'image_url'`,
      )
    }
  }
}

function validateChatTextPart(
  part: { text?: unknown },
  msgIndex: number,
  partIndex: number,
): void {
  if (typeof part.text !== "string") {
    throw createValidationError(
      `messages[${msgIndex}].content[${partIndex}].text: must be a string`,
    )
  }
}

function validateChatImagePart(
  part: { image_url?: { url?: unknown; detail?: string } },
  msgIndex: number,
  partIndex: number,
): void {
  if (!part.image_url || typeof part.image_url.url !== "string") {
    throw createValidationError(
      `messages[${msgIndex}].content[${partIndex}].image_url.url: required`,
    )
  }
  if (part.image_url.detail !== undefined) {
    const valid = ["low", "high", "auto"]
    if (!valid.includes(part.image_url.detail)) {
      throw createValidationError(
        `messages[${msgIndex}].content[${partIndex}].image_url.detail: must be one of ${valid.join(", ")}`,
      )
    }
  }
}

function validateChatToolCalls(toolCalls: unknown, msgIndex: number): void {
  if (!isPresent(toolCalls)) return
  if (!Array.isArray(toolCalls)) {
    throw createValidationError(
      `messages[${msgIndex}].tool_calls: must be an array`,
    )
  }

  for (const [i, toolCall] of toolCalls.entries()) {
    const tc = toolCall as
      | {
          id?: unknown
          type?: string
          function?: { name?: unknown; arguments?: unknown }
        }
      | undefined
    if (!tc || typeof tc !== "object") {
      throw createValidationError(
        `messages[${msgIndex}].tool_calls[${i}]: must be an object`,
      )
    }
    if (typeof tc.id !== "string") {
      throw createValidationError(
        `messages[${msgIndex}].tool_calls[${i}].id: required`,
      )
    }
    if (tc.type !== "function") {
      throw createValidationError(
        `messages[${msgIndex}].tool_calls[${i}].type: must be 'function'`,
      )
    }
    if (!tc.function || typeof tc.function.name !== "string") {
      throw createValidationError(
        `messages[${msgIndex}].tool_calls[${i}].function.name: required`,
      )
    }
    if (typeof tc.function.arguments !== "string") {
      throw createValidationError(
        `messages[${msgIndex}].tool_calls[${i}].function.arguments: must be a JSON string`,
      )
    }
  }
}

function validateChatTool(tool: unknown, index: number): asserts tool is Tool {
  if (!tool || typeof tool !== "object") {
    throw createValidationError(`tools[${index}]: must be an object`)
  }

  const t = tool as Partial<Tool>

  if (t.type !== "function") {
    throw createValidationError(`tools[${index}].type: must be 'function'`)
  }
  if (!t.function || typeof t.function !== "object") {
    throw createValidationError(
      `tools[${index}].function: required and must be an object`,
    )
  }
  if (typeof t.function.name !== "string") {
    throw createValidationError(`tools[${index}].function.name: required`)
  }
  const desc = (t.function as { description?: unknown }).description
  if (desc !== undefined && typeof desc !== "string") {
    throw createValidationError(
      `tools[${index}].function.description: must be a string`,
    )
  }
  const params = (t.function as { parameters?: unknown }).parameters
  if (!params || typeof params !== "object") {
    throw createValidationError(
      `tools[${index}].function.parameters: required and must be an object (JSON Schema)`,
    )
  }
}
