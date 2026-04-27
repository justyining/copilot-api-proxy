import consola from "consola"
import { events } from "fetch-event-stream"

import { copilotHeaders, copilotBaseUrl } from "~/lib/api-config"
import {
  createAuthenticationError,
  createServiceUnavailableError,
  createTimeoutError,
  HTTPError,
} from "~/lib/error"
import { state } from "~/lib/state"
import { refreshCopilotToken } from "~/lib/token"

async function handle401(
  payload: ChatCompletionsPayload,
  options: { alreadyRefreshed?: boolean },
): Promise<ChatCompletionResult> {
  if (options.alreadyRefreshed) {
    throw createAuthenticationError("Invalid or expired GitHub Copilot token")
  }
  consola.warn("Copilot returned 401 — refreshing token and retrying once")
  try {
    await refreshCopilotToken()
  } catch (refreshErr) {
    consola.error("Failed to refresh Copilot token after 401:", refreshErr)
    throw createAuthenticationError("Invalid or expired GitHub Copilot token")
  }
  return createChatCompletions(payload, { alreadyRefreshed: true })
}

type ChatCompletionResult = ReturnType<typeof events> | ChatCompletionResponse

export const createChatCompletions = async (
  payload: ChatCompletionsPayload,
  options: { alreadyRefreshed?: boolean } = {},
): Promise<ChatCompletionResult> => {
  if (!state.copilotToken) {
    throw createAuthenticationError("Copilot token not found")
  }

  const enableVision = payload.messages.some(
    (x) =>
      typeof x.content !== "string"
      && x.content?.some((x) => x.type === "image_url"),
  )

  if (enableVision) {
    const model = state.models?.data.find((m) => m.id === payload.model)
    if (model && !model.capabilities.supports.vision) {
      consola.warn(
        `Model ${payload.model} does not support vision, but request contains image_url parts — upstream will likely reject it.`,
      )
    }
  }

  // Agent/user check for X-Initiator header
  // Determine if any message is from an agent ("assistant" or "tool")
  const isAgentCall = payload.messages.some((msg) =>
    ["assistant", "tool"].includes(msg.role),
  )

  const headers = copilotHeaders({
    state,
    vision: enableVision,
    intent: "conversation-panel",
    interactionType: "conversation-panel",
    initiator: isAgentCall ? "agent" : "user",
  })

  const url = `${copilotBaseUrl(state)}/chat/completions`
  consola.info(`→ Copilot endpoint: POST ${url}`)

  let response: Response

  try {
    response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    })
  } catch (error) {
    consola.error("Network error creating chat completions:", error)
    // Handle network errors
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
      "Failed to create chat completions",
      response.status,
      response.statusText,
    )

    // Handle specific error status codes
    if (response.status === 401) {
      return handle401(payload, options)
    }

    if (response.status === 503) {
      throw createServiceUnavailableError(
        "GitHub Copilot service is temporarily unavailable",
      )
    }

    if (response.status === 504) {
      throw createTimeoutError("Request to GitHub Copilot timed out")
    }

    // For other errors, throw HTTPError to preserve the original response
    throw new HTTPError("Failed to create chat completions", response)
  }

  if (payload.stream) {
    return events(response)
  }

  return (await response.json()) as ChatCompletionResponse
}

// Streaming types

export interface ChatCompletionChunk {
  id: string
  object: "chat.completion.chunk"
  created: number
  model: string
  choices: Array<Choice>
  system_fingerprint?: string
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
    prompt_tokens_details?: {
      cached_tokens: number
    }
    completion_tokens_details?: {
      accepted_prediction_tokens: number
      rejected_prediction_tokens: number
    }
  }
}

interface Delta {
  content?: string | null
  role?: "user" | "assistant" | "system" | "tool"
  tool_calls?: Array<{
    index: number
    id?: string
    type?: "function"
    function?: {
      name?: string
      arguments?: string
    }
  }>
}

interface Choice {
  index: number
  delta: Delta
  finish_reason: "stop" | "length" | "tool_calls" | "content_filter" | null
  logprobs: object | null
}

// Non-streaming types

export interface ChatCompletionResponse {
  id: string
  object: "chat.completion"
  created: number
  model: string
  choices: Array<ChoiceNonStreaming>
  system_fingerprint?: string
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
    prompt_tokens_details?: {
      cached_tokens: number
    }
  }
}

interface ResponseMessage {
  role: "assistant"
  content: string | null
  tool_calls?: Array<ToolCall>
}

interface ChoiceNonStreaming {
  index: number
  message: ResponseMessage
  logprobs: object | null
  finish_reason: "stop" | "length" | "tool_calls" | "content_filter"
}

// Payload types

export interface ChatCompletionsPayload {
  messages: Array<Message>
  model: string
  temperature?: number | null
  top_p?: number | null
  max_tokens?: number | null
  stop?: string | Array<string> | null
  n?: number | null
  stream?: boolean | null

  frequency_penalty?: number | null
  presence_penalty?: number | null
  logit_bias?: Record<string, number> | null
  logprobs?: boolean | null
  response_format?: { type: "json_object" } | null
  seed?: number | null
  tools?: Array<Tool> | null
  tool_choice?:
    | "none"
    | "auto"
    | "required"
    | { type: "function"; function: { name: string } }
    | null
  user?: string | null
}

export interface Tool {
  type: "function"
  function: {
    name: string
    description?: string
    parameters: Record<string, unknown>
  }
}

export interface Message {
  role: "user" | "assistant" | "system" | "tool" | "developer"
  content: string | Array<ContentPart> | null

  name?: string
  tool_calls?: Array<ToolCall>
  tool_call_id?: string
}

export interface ToolCall {
  id: string
  type: "function"
  function: {
    name: string
    arguments: string
  }
}

export type ContentPart = TextPart | ImagePart

export interface TextPart {
  type: "text"
  text: string
}

export interface ImagePart {
  type: "image_url"
  image_url: {
    url: string
    detail?: "low" | "high" | "auto"
  }
}
