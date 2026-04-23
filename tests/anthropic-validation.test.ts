import { describe, test, expect } from "bun:test"

import {
  validateAnthropicPayload,
  validateAnthropicCountTokensPayload,
} from "~/lib/validation"

// ---------------------------------------------------------------------------
// validateAnthropicPayload
// ---------------------------------------------------------------------------

describe("validateAnthropicPayload – required fields", () => {
  test("accepts a minimal valid payload", () => {
    const payload = {
      model: "claude-sonnet-4-6",
      messages: [{ role: "user", content: "Hi" }],
      max_tokens: 1024,
    }
    expect(() => validateAnthropicPayload(payload)).not.toThrow()
  })

  test("rejects null", () => {
    expect(() => validateAnthropicPayload(null)).toThrow()
  })

  test("rejects non-object", () => {
    expect(() => validateAnthropicPayload("string")).toThrow()
    expect(() => validateAnthropicPayload(42)).toThrow()
  })

  test("rejects missing model", () => {
    const payload = {
      messages: [{ role: "user", content: "Hi" }],
      max_tokens: 1024,
    }
    expect(() => validateAnthropicPayload(payload)).toThrow()
  })

  test("rejects non-string model", () => {
    const payload = {
      model: 123,
      messages: [{ role: "user", content: "Hi" }],
      max_tokens: 1024,
    }
    expect(() => validateAnthropicPayload(payload)).toThrow()
  })

  test("rejects missing messages", () => {
    const payload = {
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
    }
    expect(() => validateAnthropicPayload(payload)).toThrow()
  })

  test("rejects non-array messages", () => {
    const payload = {
      model: "claude-sonnet-4-6",
      messages: { role: "user", content: "Hi" },
      max_tokens: 1024,
    }
    expect(() => validateAnthropicPayload(payload)).toThrow()
  })

  test("rejects empty messages array", () => {
    const payload = {
      model: "claude-sonnet-4-6",
      messages: [],
      max_tokens: 1024,
    }
    expect(() => validateAnthropicPayload(payload)).toThrow()
  })

  test("rejects missing max_tokens", () => {
    const payload = {
      model: "claude-sonnet-4-6",
      messages: [{ role: "user", content: "Hi" }],
    }
    expect(() => validateAnthropicPayload(payload)).toThrow()
  })

  test("rejects zero max_tokens", () => {
    const payload = {
      model: "claude-sonnet-4-6",
      messages: [{ role: "user", content: "Hi" }],
      max_tokens: 0,
    }
    expect(() => validateAnthropicPayload(payload)).toThrow()
  })

  test("rejects negative max_tokens", () => {
    const payload = {
      model: "claude-sonnet-4-6",
      messages: [{ role: "user", content: "Hi" }],
      max_tokens: -10,
    }
    expect(() => validateAnthropicPayload(payload)).toThrow()
  })

  test("rejects non-integer max_tokens", () => {
    const payload = {
      model: "claude-sonnet-4-6",
      messages: [{ role: "user", content: "Hi" }],
      max_tokens: 10.5,
    }
    expect(() => validateAnthropicPayload(payload)).toThrow()
  })
})

describe("validateAnthropicPayload – message validation", () => {
  test("accepts string content", () => {
    const payload = {
      model: "claude-sonnet-4-6",
      messages: [{ role: "user", content: "Hello, Claude" }],
      max_tokens: 1024,
    }
    expect(() => validateAnthropicPayload(payload)).not.toThrow()
  })

  test("accepts array content with text block", () => {
    const payload = {
      model: "claude-sonnet-4-6",
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: "Hello, Claude" }],
        },
      ],
      max_tokens: 1024,
    }
    expect(() => validateAnthropicPayload(payload)).not.toThrow()
  })

  test("accepts multi-turn conversation", () => {
    const payload = {
      model: "claude-sonnet-4-6",
      messages: [
        { role: "user", content: "Hello there." },
        {
          role: "assistant",
          content: "Hi, I'm Claude. How can I help you?",
        },
        { role: "user", content: "Can you explain LLMs in plain English?" },
      ],
      max_tokens: 1024,
    }
    expect(() => validateAnthropicPayload(payload)).not.toThrow()
  })

  test("rejects invalid role", () => {
    const payload = {
      model: "claude-sonnet-4-6",
      messages: [{ role: "system", content: "You are helpful" }],
      max_tokens: 1024,
    }
    expect(() => validateAnthropicPayload(payload)).toThrow()
  })

  test("rejects missing content", () => {
    const payload = {
      model: "claude-sonnet-4-6",
      messages: [{ role: "user" }],
      max_tokens: 1024,
    }
    expect(() => validateAnthropicPayload(payload)).toThrow()
  })

  test("rejects empty content array", () => {
    const payload = {
      model: "claude-sonnet-4-6",
      messages: [{ role: "user", content: [] }],
      max_tokens: 1024,
    }
    expect(() => validateAnthropicPayload(payload)).toThrow()
  })

  test("rejects invalid content block type", () => {
    const payload = {
      model: "claude-sonnet-4-6",
      messages: [{ role: "user", content: [{ type: "audio", data: "..." }] }],
      max_tokens: 1024,
    }
    expect(() => validateAnthropicPayload(payload)).toThrow()
  })
})

describe("validateAnthropicPayload – content block types", () => {
  test("accepts image block with base64 source", () => {
    const payload = {
      model: "claude-sonnet-4-6",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/png",
                data: "iVBORw0KGgo=",
              },
            },
          ],
        },
      ],
      max_tokens: 1024,
    }
    expect(() => validateAnthropicPayload(payload)).not.toThrow()
  })

  test("rejects image block without source", () => {
    const payload = {
      model: "claude-sonnet-4-6",
      messages: [{ role: "user", content: [{ type: "image" }] }],
      max_tokens: 1024,
    }
    expect(() => validateAnthropicPayload(payload)).toThrow()
  })

  test("rejects image block with invalid media_type", () => {
    const payload = {
      model: "claude-sonnet-4-6",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/bmp",
                data: "abc",
              },
            },
          ],
        },
      ],
      max_tokens: 1024,
    }
    expect(() => validateAnthropicPayload(payload)).toThrow()
  })

  test("accepts tool_result block", () => {
    const payload = {
      model: "claude-sonnet-4-6",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "toolu_01",
              content: "result data",
            },
          ],
        },
      ],
      max_tokens: 1024,
    }
    expect(() => validateAnthropicPayload(payload)).not.toThrow()
  })

  test("accepts tool_result block with is_error", () => {
    const payload = {
      model: "claude-sonnet-4-6",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "toolu_01",
              content: "error data",
              is_error: true,
            },
          ],
        },
      ],
      max_tokens: 1024,
    }
    expect(() => validateAnthropicPayload(payload)).not.toThrow()
  })

  test("rejects tool_result block without tool_use_id", () => {
    const payload = {
      model: "claude-sonnet-4-6",
      messages: [
        {
          role: "user",
          content: [{ type: "tool_result", content: "result" }],
        },
      ],
      max_tokens: 1024,
    }
    expect(() => validateAnthropicPayload(payload)).toThrow()
  })

  test("accepts tool_use block in assistant message", () => {
    const payload = {
      model: "claude-sonnet-4-6",
      messages: [
        {
          role: "assistant",
          content: [
            {
              type: "tool_use",
              id: "toolu_01",
              name: "get_weather",
              input: { location: "San Francisco" },
            },
          ],
        },
      ],
      max_tokens: 1024,
    }
    expect(() => validateAnthropicPayload(payload)).not.toThrow()
  })

  test("rejects tool_use block without id", () => {
    const payload = {
      model: "claude-sonnet-4-6",
      messages: [
        {
          role: "assistant",
          content: [
            {
              type: "tool_use",
              name: "get_weather",
              input: { location: "SF" },
            },
          ],
        },
      ],
      max_tokens: 1024,
    }
    expect(() => validateAnthropicPayload(payload)).toThrow()
  })

  test("accepts thinking block in assistant message", () => {
    const payload = {
      model: "claude-sonnet-4-6",
      messages: [
        {
          role: "assistant",
          content: [
            { type: "thinking", thinking: "Let me reason about this..." },
          ],
        },
      ],
      max_tokens: 1024,
    }
    expect(() => validateAnthropicPayload(payload)).not.toThrow()
  })

  test("rejects thinking block with non-string thinking field", () => {
    const payload = {
      model: "claude-sonnet-4-6",
      messages: [
        {
          role: "assistant",
          content: [{ type: "thinking", thinking: 42 }],
        },
      ],
      max_tokens: 1024,
    }
    expect(() => validateAnthropicPayload(payload)).toThrow()
  })
})

describe("validateAnthropicPayload – optional fields", () => {
  test("accepts system prompt as string", () => {
    const payload = {
      model: "claude-sonnet-4-6",
      messages: [{ role: "user", content: "Hi" }],
      max_tokens: 1024,
      system: "You are a helpful assistant.",
    }
    expect(() => validateAnthropicPayload(payload)).not.toThrow()
  })

  test("accepts system prompt as array of text blocks", () => {
    const payload = {
      model: "claude-sonnet-4-6",
      messages: [{ role: "user", content: "Hi" }],
      max_tokens: 1024,
      system: [
        { type: "text", text: "You are helpful." },
        { type: "text", text: "Be concise." },
      ],
    }
    expect(() => validateAnthropicPayload(payload)).not.toThrow()
  })

  test("rejects non-string non-array system", () => {
    const payload = {
      model: "claude-sonnet-4-6",
      messages: [{ role: "user", content: "Hi" }],
      max_tokens: 1024,
      system: 42,
    }
    expect(() => validateAnthropicPayload(payload)).toThrow()
  })

  test("accepts valid temperature", () => {
    const payload = {
      model: "claude-sonnet-4-6",
      messages: [{ role: "user", content: "Hi" }],
      max_tokens: 1024,
      temperature: 0.7,
    }
    expect(() => validateAnthropicPayload(payload)).not.toThrow()
  })

  test("rejects temperature > 1", () => {
    const payload = {
      model: "claude-sonnet-4-6",
      messages: [{ role: "user", content: "Hi" }],
      max_tokens: 1024,
      temperature: 1.5,
    }
    expect(() => validateAnthropicPayload(payload)).toThrow()
  })

  test("rejects negative temperature", () => {
    const payload = {
      model: "claude-sonnet-4-6",
      messages: [{ role: "user", content: "Hi" }],
      max_tokens: 1024,
      temperature: -0.1,
    }
    expect(() => validateAnthropicPayload(payload)).toThrow()
  })

  test("accepts valid top_p", () => {
    const payload = {
      model: "claude-sonnet-4-6",
      messages: [{ role: "user", content: "Hi" }],
      max_tokens: 1024,
      top_p: 0.9,
    }
    expect(() => validateAnthropicPayload(payload)).not.toThrow()
  })

  test("accepts valid top_k", () => {
    const payload = {
      model: "claude-sonnet-4-6",
      messages: [{ role: "user", content: "Hi" }],
      max_tokens: 1024,
      top_k: 40,
    }
    expect(() => validateAnthropicPayload(payload)).not.toThrow()
  })

  test("rejects zero top_k", () => {
    const payload = {
      model: "claude-sonnet-4-6",
      messages: [{ role: "user", content: "Hi" }],
      max_tokens: 1024,
      top_k: 0,
    }
    expect(() => validateAnthropicPayload(payload)).toThrow()
  })

  test("accepts stream boolean", () => {
    const payload = {
      model: "claude-sonnet-4-6",
      messages: [{ role: "user", content: "Hi" }],
      max_tokens: 1024,
      stream: true,
    }
    expect(() => validateAnthropicPayload(payload)).not.toThrow()
  })

  test("rejects non-boolean stream", () => {
    const payload = {
      model: "claude-sonnet-4-6",
      messages: [{ role: "user", content: "Hi" }],
      max_tokens: 1024,
      stream: "yes",
    }
    expect(() => validateAnthropicPayload(payload)).toThrow()
  })

  test("accepts stop_sequences", () => {
    const payload = {
      model: "claude-sonnet-4-6",
      messages: [{ role: "user", content: "Hi" }],
      max_tokens: 1024,
      stop_sequences: ["\n\n", "END"],
    }
    expect(() => validateAnthropicPayload(payload)).not.toThrow()
  })

  test("rejects non-string stop_sequences elements", () => {
    const payload = {
      model: "claude-sonnet-4-6",
      messages: [{ role: "user", content: "Hi" }],
      max_tokens: 1024,
      stop_sequences: [123],
    }
    expect(() => validateAnthropicPayload(payload)).toThrow()
  })

  test("accepts metadata with user_id", () => {
    const payload = {
      model: "claude-sonnet-4-6",
      messages: [{ role: "user", content: "Hi" }],
      max_tokens: 1024,
      metadata: { user_id: "user-123" },
    }
    expect(() => validateAnthropicPayload(payload)).not.toThrow()
  })

  test("rejects non-string metadata.user_id", () => {
    const payload = {
      model: "claude-sonnet-4-6",
      messages: [{ role: "user", content: "Hi" }],
      max_tokens: 1024,
      metadata: { user_id: 123 },
    }
    expect(() => validateAnthropicPayload(payload)).toThrow()
  })
})

describe("validateAnthropicPayload – tools", () => {
  test("accepts valid tools array", () => {
    const payload = {
      model: "claude-sonnet-4-6",
      messages: [{ role: "user", content: "Hi" }],
      max_tokens: 1024,
      tools: [
        {
          name: "get_weather",
          description: "Get weather for a location",
          input_schema: {
            type: "object",
            properties: {
              location: { type: "string" },
            },
            required: ["location"],
          },
        },
      ],
    }
    expect(() => validateAnthropicPayload(payload)).not.toThrow()
  })

  test("rejects tool without name", () => {
    const payload = {
      model: "claude-sonnet-4-6",
      messages: [{ role: "user", content: "Hi" }],
      max_tokens: 1024,
      tools: [
        {
          description: "No name",
          input_schema: { type: "object" },
        },
      ],
    }
    expect(() => validateAnthropicPayload(payload)).toThrow()
  })

  test("rejects tool without input_schema", () => {
    const payload = {
      model: "claude-sonnet-4-6",
      messages: [{ role: "user", content: "Hi" }],
      max_tokens: 1024,
      tools: [{ name: "get_weather", description: "Get weather" }],
    }
    expect(() => validateAnthropicPayload(payload)).toThrow()
  })
})

describe("validateAnthropicPayload – tool_choice", () => {
  const base = () => ({
    model: "claude-sonnet-4-6",
    messages: [{ role: "user", content: "Hi" }],
    max_tokens: 1024,
  })

  test("accepts tool_choice auto", () => {
    expect(() =>
      validateAnthropicPayload({
        ...base(),
        tool_choice: { type: "auto" },
      }),
    ).not.toThrow()
  })

  test("accepts tool_choice any", () => {
    expect(() =>
      validateAnthropicPayload({
        ...base(),
        tool_choice: { type: "any" },
      }),
    ).not.toThrow()
  })

  test("accepts tool_choice none", () => {
    expect(() =>
      validateAnthropicPayload({
        ...base(),
        tool_choice: { type: "none" },
      }),
    ).not.toThrow()
  })

  test("accepts tool_choice tool with name", () => {
    expect(() =>
      validateAnthropicPayload({
        ...base(),
        tool_choice: { type: "tool", name: "get_weather" },
      }),
    ).not.toThrow()
  })

  test("rejects tool_choice tool without name", () => {
    expect(() =>
      validateAnthropicPayload({
        ...base(),
        tool_choice: { type: "tool" },
      }),
    ).toThrow()
  })

  test("rejects invalid tool_choice type", () => {
    expect(() =>
      validateAnthropicPayload({
        ...base(),
        tool_choice: { type: "custom" },
      }),
    ).toThrow()
  })
})

describe("validateAnthropicPayload – thinking config", () => {
  const base = () => ({
    model: "claude-sonnet-4-6",
    messages: [{ role: "user", content: "Hi" }],
    max_tokens: 1024,
  })

  test("accepts thinking with type enabled", () => {
    expect(() =>
      validateAnthropicPayload({
        ...base(),
        thinking: { type: "enabled", budget_tokens: 10000 },
      }),
    ).not.toThrow()
  })

  test("accepts thinking with type adaptive", () => {
    expect(() =>
      validateAnthropicPayload({
        ...base(),
        thinking: { type: "adaptive" },
      }),
    ).not.toThrow()
  })

  test("rejects invalid thinking type", () => {
    expect(() =>
      validateAnthropicPayload({
        ...base(),
        thinking: { type: "custom" },
      }),
    ).toThrow()
  })

  test("rejects zero budget_tokens", () => {
    expect(() =>
      validateAnthropicPayload({
        ...base(),
        thinking: { type: "enabled", budget_tokens: 0 },
      }),
    ).toThrow()
  })

  test("rejects negative budget_tokens", () => {
    expect(() =>
      validateAnthropicPayload({
        ...base(),
        thinking: { type: "enabled", budget_tokens: -100 },
      }),
    ).toThrow()
  })
})

describe("validateAnthropicPayload – service_tier", () => {
  const base = () => ({
    model: "claude-sonnet-4-6",
    messages: [{ role: "user", content: "Hi" }],
    max_tokens: 1024,
  })

  test("accepts auto", () => {
    expect(() =>
      validateAnthropicPayload({ ...base(), service_tier: "auto" }),
    ).not.toThrow()
  })

  test("accepts standard_only", () => {
    expect(() =>
      validateAnthropicPayload({
        ...base(),
        service_tier: "standard_only",
      }),
    ).not.toThrow()
  })

  test("rejects invalid service_tier", () => {
    expect(() =>
      validateAnthropicPayload({
        ...base(),
        service_tier: "premium",
      }),
    ).toThrow()
  })
})

// ---------------------------------------------------------------------------
// validateAnthropicCountTokensPayload
// ---------------------------------------------------------------------------

describe("validateAnthropicCountTokensPayload", () => {
  test("accepts payload without max_tokens", () => {
    const payload = {
      model: "claude-sonnet-4-6",
      messages: [{ role: "user", content: "Hi" }],
    }
    expect(() => validateAnthropicCountTokensPayload(payload)).not.toThrow()
  })

  test("accepts payload with optional max_tokens", () => {
    const payload = {
      model: "claude-sonnet-4-6",
      messages: [{ role: "user", content: "Hi" }],
      max_tokens: 1024,
    }
    expect(() => validateAnthropicCountTokensPayload(payload)).not.toThrow()
  })

  test("rejects invalid max_tokens when provided", () => {
    const payload = {
      model: "claude-sonnet-4-6",
      messages: [{ role: "user", content: "Hi" }],
      max_tokens: -5,
    }
    expect(() => validateAnthropicCountTokensPayload(payload)).toThrow()
  })

  test("still requires model and messages", () => {
    expect(() => validateAnthropicCountTokensPayload({})).toThrow()
    expect(() =>
      validateAnthropicCountTokensPayload({
        model: "claude-sonnet-4-6",
      }),
    ).toThrow()
    expect(() =>
      validateAnthropicCountTokensPayload({
        messages: [{ role: "user", content: "Hi" }],
      }),
    ).toThrow()
  })

  test("validates messages and tools the same as validateAnthropicPayload", () => {
    const payload = {
      model: "claude-sonnet-4-6",
      messages: [{ role: "user", content: "Hi" }],
      tools: [{ name: "get_weather", input_schema: { type: "object" } }],
      thinking: { type: "adaptive" },
    }
    expect(() => validateAnthropicCountTokensPayload(payload)).not.toThrow()
  })
})
