import { describe, test, expect } from "bun:test"

import type {
  AnthropicStreamEventData,
  AnthropicStreamState,
} from "~/routes/messages/anthropic-types"
import type { ChatCompletionChunk } from "~/services/copilot/create-chat-completions"

import {
  translateChunkToAnthropicEvents,
  translateErrorToAnthropicErrorEvent,
} from "~/routes/messages/stream-translation"
import { mapOpenAIStopReasonToAnthropic } from "~/routes/messages/utils"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function freshState(): AnthropicStreamState {
  return {
    messageStartSent: false,
    contentBlockIndex: 0,
    contentBlockOpen: false,
    toolCalls: {},
  }
}

function chunk(
  delta: Record<string, unknown>,
  finishReason: string | null = null,
  usage?: Record<string, unknown>,
): ChatCompletionChunk {
  return {
    id: "chatcmpl-test",
    object: "chat.completion.chunk",
    created: 1677652288,
    model: "claude-sonnet-4",
    choices: [
      {
        index: 0,
        delta: delta as any,
        finish_reason: finishReason as any,
        logprobs: null,
      },
    ],
    ...(usage ? { usage: usage as any } : {}),
  }
}

// ---------------------------------------------------------------------------
// Event sequence order
// ---------------------------------------------------------------------------

describe("Streaming event sequence", () => {
  test("basic text response follows correct event order", () => {
    const state = freshState()
    const events: Array<AnthropicStreamEventData> = []

    // Chunk 1: role announcement
    events.push(
      ...translateChunkToAnthropicEvents(chunk({ role: "assistant" }), state),
    )

    // Chunk 2: text content
    events.push(
      ...translateChunkToAnthropicEvents(chunk({ content: "Hello" }), state),
    )

    // Chunk 3: more text
    events.push(
      ...translateChunkToAnthropicEvents(chunk({ content: " world" }), state),
    )

    // Chunk 4: finish
    events.push(...translateChunkToAnthropicEvents(chunk({}, "stop"), state))

    const types = events.map((e) => e.type)

    // Expected sequence: message_start, content_block_start, content_block_delta(x2), content_block_stop, message_delta, message_stop
    expect(types[0]).toBe("message_start")
    expect(types).toContain("content_block_start")
    expect(types).toContain("content_block_delta")
    expect(types).toContain("content_block_stop")
    expect(types).toContain("message_delta")
    expect(types).toContain("message_stop")

    // message_start must come before content_block_start
    const startIdx = types.indexOf("message_start")
    const blockStartIdx = types.indexOf("content_block_start")
    expect(blockStartIdx).toBeGreaterThan(startIdx)

    // message_stop must be last
    expect(types.at(-1)).toBe("message_stop")
  })

  test("message_start contains empty content array", () => {
    const state = freshState()
    const events = translateChunkToAnthropicEvents(
      chunk({ role: "assistant" }),
      state,
    )

    const msgStart = events.find((e) => e.type === "message_start")!
    expect(msgStart.type).toBe("message_start")
    if (msgStart.type === "message_start") {
      expect(msgStart.message.content).toEqual([])
      expect(msgStart.message.role).toBe("assistant")
      expect(msgStart.message.type).toBe("message")
      expect(msgStart.message.stop_reason).toBeNull()
      expect(msgStart.message.stop_sequence).toBeNull()
    }
  })

  test("message_delta contains stop_reason and usage", () => {
    const state = freshState()
    // Prime the state
    translateChunkToAnthropicEvents(chunk({ role: "assistant" }), state)
    translateChunkToAnthropicEvents(chunk({ content: "Hi" }), state)

    const events = translateChunkToAnthropicEvents(chunk({}, "stop"), state)

    const msgDelta = events.find((e) => e.type === "message_delta")
    expect(msgDelta).toBeDefined()
    if (msgDelta?.type === "message_delta") {
      expect(msgDelta.delta.stop_reason).toBe("end_turn")
      expect(msgDelta.delta.stop_sequence).toBeNull()
    }
  })
})

// ---------------------------------------------------------------------------
// content_block_start / content_block_delta / content_block_stop
// ---------------------------------------------------------------------------

describe("Content block events", () => {
  test("text delta events carry correct text", () => {
    const state = freshState()
    translateChunkToAnthropicEvents(chunk({ role: "assistant" }), state)

    const events = translateChunkToAnthropicEvents(
      chunk({ content: "Hello" }),
      state,
    )

    const delta = events.find((e) => e.type === "content_block_delta")
    expect(delta).toBeDefined()
    if (delta?.type === "content_block_delta") {
      expect(delta.delta.type).toBe("text_delta")
      if (delta.delta.type === "text_delta") {
        expect(delta.delta.text).toBe("Hello")
      }
    }
  })

  test("each content block has incrementing index", () => {
    const state = freshState()
    translateChunkToAnthropicEvents(chunk({ role: "assistant" }), state)

    // Block 0: text
    const textEvents = translateChunkToAnthropicEvents(
      chunk({ content: "Hi" }),
      state,
    )
    const textStart = textEvents.find((e) => e.type === "content_block_start")!
    if (textStart.type === "content_block_start") {
      expect(textStart.index).toBe(0)
    }

    // Block 1: tool_use
    const toolEvents = translateChunkToAnthropicEvents(
      chunk({
        tool_calls: [
          {
            index: 0,
            id: "call_1",
            type: "function",
            function: { name: "get_weather", arguments: "" },
          },
        ],
      }),
      null,
    )
    const toolStart = toolEvents.find((e) => e.type === "content_block_start")!
    if (toolStart.type === "content_block_start") {
      expect(toolStart.index).toBe(1)
    }
  })

  test("content_block_start for text has type 'text'", () => {
    const state = freshState()
    translateChunkToAnthropicEvents(chunk({ role: "assistant" }), state)

    const events = translateChunkToAnthropicEvents(
      chunk({ content: "Hi" }),
      state,
    )

    const start = events.find((e) => e.type === "content_block_start")!
    if (start.type === "content_block_start") {
      expect(start.content_block.type).toBe("text")
    }
  })

  test("content_block_start for tool_use has correct structure", () => {
    const state = freshState()
    translateChunkToAnthropicEvents(chunk({ role: "assistant" }), state)

    const events = translateChunkToAnthropicEvents(
      chunk({
        tool_calls: [
          {
            index: 0,
            id: "call_abc",
            type: "function",
            function: { name: "get_weather", arguments: "" },
          },
        ],
      }),
      state,
    )

    const start = events.find((e) => e.type === "content_block_start")!
    if (start.type === "content_block_start") {
      expect(start.content_block.type).toBe("tool_use")
      if (start.content_block.type === "tool_use") {
        expect(start.content_block.id).toBe("call_abc")
        expect(start.content_block.name).toBe("get_weather")
        expect(start.content_block.input).toEqual({})
      }
    }
  })

  test("tool argument deltas are input_json_delta", () => {
    const state = freshState()
    translateChunkToAnthropicEvents(chunk({ role: "assistant" }), state)
    translateChunkToAnthropicEvents(
      chunk({
        tool_calls: [
          {
            index: 0,
            id: "call_1",
            type: "function",
            function: { name: "search", arguments: "" },
          },
        ],
      }),
      null,
    )

    const events = translateChunkToAnthropicEvents(
      chunk({
        tool_calls: [
          {
            index: 0,
            function: { arguments: '{"query": "test"}' },
          },
        ],
      }),
      null,
    )

    const delta = events.find((e) => e.type === "content_block_delta")!
    if (delta.type === "content_block_delta") {
      expect(delta.delta.type).toBe("input_json_delta")
      if (delta.delta.type === "input_json_delta") {
        expect(delta.delta.partial_json).toBe('{"query": "test"}')
      }
    }
  })
})

// ---------------------------------------------------------------------------
// Stop reason mapping
// ---------------------------------------------------------------------------

describe("Stop reason mapping", () => {
  test("maps 'stop' to 'end_turn'", () => {
    expect(mapOpenAIStopReasonToAnthropic("stop")).toBe("end_turn")
  })

  test("maps 'length' to 'max_tokens'", () => {
    expect(mapOpenAIStopReasonToAnthropic("length")).toBe("max_tokens")
  })

  test("maps 'tool_calls' to 'tool_use'", () => {
    expect(mapOpenAIStopReasonToAnthropic("tool_calls")).toBe("tool_use")
  })

  test("maps 'content_filter' to 'end_turn'", () => {
    expect(mapOpenAIStopReasonToAnthropic("content_filter")).toBe("end_turn")
  })

  test("maps null to null", () => {
    expect(mapOpenAIStopReasonToAnthropic(null)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Mixed text + tool_use streaming
// ---------------------------------------------------------------------------

describe("Mixed text and tool_use streaming", () => {
  test("closes text block before opening tool_use block", () => {
    const state = freshState()
    translateChunkToAnthropicEvents(chunk({ role: "assistant" }), state)

    // Text content
    const _textEvents = translateChunkToAnthropicEvents(
      chunk({ content: "Let me check" }),
      state,
    )

    // Tool call - should close text block first
    const toolEvents = translateChunkToAnthropicEvents(
      chunk({
        tool_calls: [
          {
            index: 0,
            id: "call_1",
            type: "function",
            function: { name: "search", arguments: "" },
          },
        ],
      }),
      null,
    )

    // Should have content_block_stop for the text block
    expect(toolEvents.some((e) => e.type === "content_block_stop")).toBe(true)
    // Should have content_block_start for the tool block
    expect(toolEvents.some((e) => e.type === "content_block_start")).toBe(true)
  })

  test("closes tool block before opening text block", () => {
    const state = freshState()
    translateChunkToAnthropicEvents(chunk({ role: "assistant" }), state)

    // Open a tool block
    translateChunkToAnthropicEvents(
      chunk({
        tool_calls: [
          {
            index: 0,
            id: "call_1",
            type: "function",
            function: { name: "search", arguments: "" },
          },
        ],
      }),
      null,
    )

    // Send text - should close tool block first
    const events = translateChunkToAnthropicEvents(
      chunk({ content: "Here's the result" }),
      state,
    )

    expect(events.some((e) => e.type === "content_block_stop")).toBe(true)
  })

  test("complete tool_use streaming flow", () => {
    const state = freshState()

    const allEvents: Array<AnthropicStreamEventData> = []

    // Start
    allEvents.push(
      ...translateChunkToAnthropicEvents(chunk({ role: "assistant" }), state),
    )

    // Tool call opening
    allEvents.push(
      ...translateChunkToAnthropicEvents(
        chunk({
          tool_calls: [
            {
              index: 0,
              id: "call_xyz",
              type: "function",
              function: { name: "get_weather", arguments: "" },
            },
          ],
        }),
        state,
      ),
    )

    // Tool arguments streaming
    allEvents.push(
      ...translateChunkToAnthropicEvents(
        chunk({
          tool_calls: [
            {
              index: 0,
              function: { arguments: '{"loc' },
            },
          ],
        }),
        state,
      ),
    )

    allEvents.push(
      ...translateChunkToAnthropicEvents(
        chunk({
          tool_calls: [
            {
              index: 0,
              function: { arguments: 'ation": "Paris"}' },
            },
          ],
        }),
        state,
      ),
    )

    // Finish
    allEvents.push(
      ...translateChunkToAnthropicEvents(chunk({}, "tool_calls"), state),
    )

    const types = allEvents.map((e) => e.type)
    expect(types).toContain("message_start")
    expect(types).toContain("content_block_start")
    expect(
      types.filter((t) => t === "content_block_delta").length,
    ).toBeGreaterThanOrEqual(2) // at least 2 arg deltas
    expect(types).toContain("content_block_stop")
    expect(types).toContain("message_delta")
    expect(types).toContain("message_stop")

    // Check stop reason is tool_use
    const msgDelta = allEvents.find((e) => e.type === "message_delta")!
    if (msgDelta.type === "message_delta") {
      expect(msgDelta.delta.stop_reason).toBe("tool_use")
    }
  })
})

// ---------------------------------------------------------------------------
// State management
// ---------------------------------------------------------------------------

describe("Stream state management", () => {
  test("message_start is sent only once", () => {
    const state = freshState()

    const events1 = translateChunkToAnthropicEvents(
      chunk({ role: "assistant" }),
      state,
    )
    expect(events1.some((e) => e.type === "message_start")).toBe(true)

    const events2 = translateChunkToAnthropicEvents(
      chunk({ content: "Hello" }),
      state,
    )
    expect(events2.some((e) => e.type === "message_start")).toBe(false)
  })

  test("empty chunk produces no events", () => {
    const state = freshState()
    const events = translateChunkToAnthropicEvents(chunk({}), state)
    // No content, no tool calls, no finish_reason => only message_start on first call
    // But empty delta with no finish reason produces no extra events after message_start
    expect(events.length).toBe(1) // just message_start
  })

  test("chunk with no choices produces no events", () => {
    const state = freshState()
    const emptyChunk: ChatCompletionChunk = {
      id: "chatcmpl-test",
      object: "chat.completion.chunk",
      created: 1677652288,
      model: "claude-sonnet-4",
      choices: [],
    }
    const events = translateChunkToAnthropicEvents(emptyChunk, state)
    expect(events).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Error event
// ---------------------------------------------------------------------------

describe("Error event translation", () => {
  test("translateErrorToAnthropicErrorEvent produces valid error event", () => {
    const event = translateErrorToAnthropicErrorEvent()

    expect(event.type).toBe("error")
    if (event.type === "error") {
      expect(event.error.type).toBe("api_error")
      expect(event.error.message).toBeDefined()
      expect(typeof event.error.message).toBe("string")
    }
  })
})

// ---------------------------------------------------------------------------
// Usage tracking
// ---------------------------------------------------------------------------

describe("Usage in streaming events", () => {
  test("message_start includes input_tokens from prompt", () => {
    const state = freshState()
    const events = translateChunkToAnthropicEvents(
      {
        id: "chatcmpl-test",
        object: "chat.completion.chunk",
        created: 1677652288,
        model: "claude-sonnet-4",
        choices: [
          {
            index: 0,
            delta: { role: "assistant" },
            finish_reason: null,
            logprobs: null,
          },
        ],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 0,
          prompt_tokens_details: { cached_tokens: 20 },
        },
      } as any,
      state,
    )

    const msgStart = events.find((e) => e.type === "message_start")!
    if (msgStart.type === "message_start") {
      // input_tokens should be prompt_tokens - cached_tokens
      expect(msgStart.message.usage.input_tokens).toBe(80)
      expect(msgStart.message.usage.cache_read_input_tokens).toBe(20)
    }
  })

  test("message_delta includes output_tokens from completion", () => {
    const state = freshState()
    translateChunkToAnthropicEvents(chunk({ role: "assistant" }), state)
    translateChunkToAnthropicEvents(chunk({ content: "Hi" }), state)

    const events = translateChunkToAnthropicEvents(
      {
        id: "chatcmpl-test",
        object: "chat.completion.chunk",
        created: 1677652288,
        model: "claude-sonnet-4",
        choices: [
          {
            index: 0,
            delta: {},
            finish_reason: "stop",
            logprobs: null,
          },
        ],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 50,
        },
      } as any,
      state,
    )

    const msgDelta = events.find((e) => e.type === "message_delta")!
    if (msgDelta.type === "message_delta") {
      expect(msgDelta.usage?.output_tokens).toBe(50)
    }
  })
})
