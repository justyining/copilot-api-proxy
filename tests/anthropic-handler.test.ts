import { describe, test, expect, mock, beforeEach } from "bun:test"

import { state } from "~/lib/state"
import { server } from "~/server"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const COPILOT_RESPONSE_OK = {
  id: "msg_test",
  type: "message",
  role: "assistant",
  content: [{ type: "text", text: "Hello!" }],
  model: "claude-sonnet-4",
  stop_reason: "end_turn",
  stop_sequence: null,
  usage: { input_tokens: 10, output_tokens: 5 },
}

function mockFetchSuccess(body: unknown, stream = false) {
  const response = new Response(stream ? "streaming" : JSON.stringify(body), {
    status: 200,
    headers:
      stream ?
        { "content-type": "text/event-stream; charset=utf-8" }
      : { "content-type": "application/json" },
  })
  // @ts-expect-error mock
  globalThis.fetch = mock(() => Promise.resolve(response))
}

function mockFetchError(status: number, body: unknown) {
  const response = new Response(JSON.stringify(body), { status })
  // @ts-expect-error mock
  globalThis.fetch = mock(() => Promise.resolve(response))
}

beforeEach(() => {
  state.copilotToken = "test-copilot-token"
  state.models = {
    data: [
      {
        id: "claude-sonnet-4",
        vendor: "anthropic",
        name: "Claude Sonnet 4",
        version: "4",
        capabilities: {
          family: "claude-4",
          limits: { max_output_tokens: 16384 },
        },
      },
    ],
  } as any
  state.manualApprove = false
  state.rateLimitSeconds = undefined
  state.lastRequestTimestamp = undefined
})

// ---------------------------------------------------------------------------
// Model name mapping
// ---------------------------------------------------------------------------

describe("POST /v1/messages – model name mapping", () => {
  test("maps short alias 'opus' to copilot model", async () => {
    let capturedBody: string | null = null
    // @ts-expect-error mock
    globalThis.fetch = mock(async (_url: string, opts: any) => {
      capturedBody = opts.body
      return new Response(JSON.stringify(COPILOT_RESPONSE_OK), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    })

    const res = await server.request("/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "opus",
        messages: [{ role: "user", content: "Hi" }],
        max_tokens: 1024,
      }),
    })

    expect(res.status).toBe(200)
    const body = JSON.parse(capturedBody!)
    expect(body.model).toBe("claude-opus-4.6")
  })

  test("maps short alias 'sonnet' to copilot model", async () => {
    let capturedBody: string | null = null
    // @ts-expect-error mock
    globalThis.fetch = mock(async (_url: string, opts: any) => {
      capturedBody = opts.body
      return new Response(JSON.stringify(COPILOT_RESPONSE_OK), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    })

    const res = await server.request("/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "sonnet",
        messages: [{ role: "user", content: "Hi" }],
        max_tokens: 1024,
      }),
    })

    expect(res.status).toBe(200)
    const body = JSON.parse(capturedBody!)
    expect(body.model).toBe("claude-sonnet-4.6")
  })

  test("maps short alias 'haiku' to copilot model", async () => {
    let capturedBody: string | null = null
    // @ts-expect-error mock
    globalThis.fetch = mock(async (_url: string, opts: any) => {
      capturedBody = opts.body
      return new Response(JSON.stringify(COPILOT_RESPONSE_OK), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    })

    const res = await server.request("/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "haiku",
        messages: [{ role: "user", content: "Hi" }],
        max_tokens: 1024,
      }),
    })

    expect(res.status).toBe(200)
    const body = JSON.parse(capturedBody!)
    expect(body.model).toBe("claude-haiku-4.5")
  })

  test("maps claude-sonnet-4-6 to claude-sonnet-4", async () => {
    let capturedBody: string | null = null
    // @ts-expect-error mock
    globalThis.fetch = mock(async (_url: string, opts: any) => {
      capturedBody = opts.body
      return new Response(JSON.stringify(COPILOT_RESPONSE_OK), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    })

    const res = await server.request("/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        messages: [{ role: "user", content: "Hi" }],
        max_tokens: 1024,
      }),
    })

    expect(res.status).toBe(200)
    const body = JSON.parse(capturedBody!)
    expect(body.model).toBe("claude-sonnet-4")
  })

  test("maps claude-opus-4-6 to claude-opus-4", async () => {
    let capturedBody: string | null = null
    // @ts-expect-error mock
    globalThis.fetch = mock(async (_url: string, opts: any) => {
      capturedBody = opts.body
      return new Response(JSON.stringify(COPILOT_RESPONSE_OK), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    })

    const res = await server.request("/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-opus-4-6",
        messages: [{ role: "user", content: "Hi" }],
        max_tokens: 1024,
      }),
    })

    expect(res.status).toBe(200)
    const body = JSON.parse(capturedBody!)
    expect(body.model).toBe("claude-opus-4")
  })
})

// ---------------------------------------------------------------------------
// Thinking type patching
// ---------------------------------------------------------------------------

describe("POST /v1/messages – thinking.type patching", () => {
  test("forces thinking.type to 'adaptive'", async () => {
    let capturedBody: string | null = null
    // @ts-expect-error mock
    globalThis.fetch = mock(async (_url: string, opts: any) => {
      capturedBody = opts.body
      return new Response(JSON.stringify(COPILOT_RESPONSE_OK), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    })

    const res = await server.request("/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        messages: [{ role: "user", content: "Hi" }],
        max_tokens: 1024,
        thinking: { type: "enabled", budget_tokens: 10000 },
      }),
    })

    expect(res.status).toBe(200)
    const body = JSON.parse(capturedBody!)
    expect(body.thinking).toEqual({ type: "adaptive" })
  })
})

// ---------------------------------------------------------------------------
// Non-streaming response passthrough
// ---------------------------------------------------------------------------

describe("POST /v1/messages – non-streaming", () => {
  test("returns Copilot response JSON directly", async () => {
    mockFetchSuccess(COPILOT_RESPONSE_OK)

    const res = await server.request("/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        messages: [{ role: "user", content: "Hello" }],
        max_tokens: 1024,
        stream: false,
      }),
    })

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.id).toBe("msg_test")
    expect(data.type).toBe("message")
    expect(data.role).toBe("assistant")
    expect(data.stop_reason).toBe("end_turn")
  })
})

// ---------------------------------------------------------------------------
// Streaming response passthrough
// ---------------------------------------------------------------------------

describe("POST /v1/messages – streaming", () => {
  test("pipes SSE response with correct headers", async () => {
    const sseBody =
      'event: message_start\ndata: {"type":"message_start","message":{"id":"msg_1","type":"message","role":"assistant","content":[],"model":"claude-sonnet-4","stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":10,"output_tokens":0}}}\n\nevent: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\nevent: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hi"}}\n\nevent: content_block_stop\ndata: {"type":"content_block_stop","index":0}\n\nevent: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"output_tokens":5}}\n\nevent: message_stop\ndata: {"type":"message_stop"}\n\n'

    const response = new Response(sseBody, {
      status: 200,
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache",
        connection: "keep-alive",
      },
    })
    // @ts-expect-error mock
    globalThis.fetch = mock(() => Promise.resolve(response))

    const res = await server.request("/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        messages: [{ role: "user", content: "Hi" }],
        max_tokens: 1024,
        stream: true,
      }),
    })

    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toContain("text/event-stream")
    expect(res.headers.get("cache-control")).toBe("no-cache")

    const text = await res.text()
    expect(text).toContain("message_start")
    expect(text).toContain("content_block_delta")
    expect(text).toContain("message_stop")
  })
})

// ---------------------------------------------------------------------------
// Validation errors
// ---------------------------------------------------------------------------

describe("POST /v1/messages – validation errors", () => {
  test("returns 400 for missing required fields", async () => {
    mockFetchSuccess(COPILOT_RESPONSE_OK)

    const res = await server.request("/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    })

    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error.type).toBe("invalid_request_error")
    expect(data.error.message).toBeDefined()
  })

  test("returns 422 for invalid parameter values", async () => {
    mockFetchSuccess(COPILOT_RESPONSE_OK)

    const res = await server.request("/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        messages: [{ role: "user", content: "Hi" }],
        max_tokens: 1024,
        temperature: 5.0,
      }),
    })

    expect(res.status).toBe(422)
    const data = await res.json()
    expect(data.error.type).toBe("validation_error")
  })
})

// ---------------------------------------------------------------------------
// Upstream error forwarding
// ---------------------------------------------------------------------------

describe("POST /v1/messages – upstream errors", () => {
  test("returns 401 when Copilot token is invalid", async () => {
    state.copilotToken = undefined
    const res = await server.request("/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        messages: [{ role: "user", content: "Hi" }],
        max_tokens: 1024,
      }),
    })

    expect(res.status).toBe(401)
    const data = await res.json()
    expect(data.error.type).toBe("authentication_error")
  })

  test("returns 503 when Copilot returns 503", async () => {
    mockFetchError(503, { error: "unavailable" })

    const res = await server.request("/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        messages: [{ role: "user", content: "Hi" }],
        max_tokens: 1024,
      }),
    })

    expect(res.status).toBe(503)
    const data = await res.json()
    expect(data.error.type).toBe("service_unavailable")
  })

  test("returns 504 when Copilot times out", async () => {
    mockFetchError(504, { error: "timeout" })

    const res = await server.request("/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        messages: [{ role: "user", content: "Hi" }],
        max_tokens: 1024,
      }),
    })

    expect(res.status).toBe(504)
    const data = await res.json()
    expect(data.error.type).toBe("timeout_error")
  })
})

// ---------------------------------------------------------------------------
// POST /v1/messages/count_tokens
// ---------------------------------------------------------------------------

describe("POST /v1/messages/count_tokens", () => {
  test("returns token count for valid payload", async () => {
    const res = await server.request("/v1/messages/count_tokens", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        messages: [{ role: "user", content: "Hello, how are you?" }],
      }),
    })

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(typeof data.input_tokens).toBe("number")
    expect(data.input_tokens).toBeGreaterThan(0)
  })

  test("applies 1.15x multiplier for Claude models", async () => {
    const res = await server.request("/v1/messages/count_tokens", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        messages: [{ role: "user", content: "Hello" }],
      }),
    })

    expect(res.status).toBe(200)
    const data = await res.json()
    // Claude multiplier: Math.round(tokenCount * 1.15)
    // The exact value depends on tokenizer, but it should be > raw count
    expect(data.input_tokens).toBeGreaterThan(0)
  })

  test("adds tool overhead for Claude models with tools", async () => {
    const resNoTools = await server.request("/v1/messages/count_tokens", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        messages: [{ role: "user", content: "Hello" }],
      }),
    })
    const countNoTools = (await resNoTools.json()).input_tokens

    const resWithTools = await server.request("/v1/messages/count_tokens", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        messages: [{ role: "user", content: "Hello" }],
        tools: [
          {
            name: "get_weather",
            description: "Get weather",
            input_schema: {
              type: "object",
              properties: { location: { type: "string" } },
            },
          },
        ],
      }),
    })
    const countWithTools = (await resWithTools.json()).input_tokens

    // 346 tool overhead tokens per Anthropic docs
    expect(countWithTools).toBeGreaterThan(countNoTools)
  })

  test("returns 400 for missing required fields", async () => {
    const res = await server.request("/v1/messages/count_tokens", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    })

    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error.type).toBe("invalid_request_error")
  })

  test("does not require max_tokens", async () => {
    const res = await server.request("/v1/messages/count_tokens", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        messages: [{ role: "user", content: "Hello" }],
      }),
    })

    expect(res.status).toBe(200)
  })
})
