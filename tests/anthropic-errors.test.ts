import { describe, test, expect } from "bun:test"

import {
  APIError,
  HTTPError,
  createAuthenticationError,
  createInternalError,
  createInvalidRequestError,
  createRateLimitError,
  createServiceUnavailableError,
  createTimeoutError,
  createValidationError,
  forwardError,
} from "~/lib/error"

// ---------------------------------------------------------------------------
// APIError construction
// ---------------------------------------------------------------------------

describe("APIError", () => {
  test("stores type, message, and statusCode", () => {
    const err = new APIError("validation_error", "bad input", 422)
    expect(err.type).toBe("validation_error")
    expect(err.message).toBe("bad input")
    expect(err.statusCode).toBe(422)
    expect(err.name).toBe("APIError")
    expect(err).toBeInstanceOf(Error)
  })
})

// ---------------------------------------------------------------------------
// Factory functions
// ---------------------------------------------------------------------------

describe("Error factory functions", () => {
  test("createValidationError returns correct error", () => {
    const err = createValidationError("temperature must be between 0 and 1")
    expect(err.type).toBe("validation_error")
    expect(err.statusCode).toBe(422)
    expect(err.message).toBe("temperature must be between 0 and 1")
  })

  test("createInvalidRequestError returns correct error", () => {
    const err = createInvalidRequestError("model: required field missing")
    expect(err.type).toBe("invalid_request_error")
    expect(err.statusCode).toBe(400)
  })

  test("createAuthenticationError returns correct error", () => {
    const err = createAuthenticationError()
    expect(err.type).toBe("authentication_error")
    expect(err.statusCode).toBe(401)
    expect(err.message).toContain("token")
  })

  test("createRateLimitError returns correct error", () => {
    const err = createRateLimitError()
    expect(err.type).toBe("rate_limit_error")
    expect(err.statusCode).toBe(429)
  })

  test("createRateLimitError accepts custom message", () => {
    const err = createRateLimitError("Slow down")
    expect(err.message).toBe("Slow down")
  })

  test("createServiceUnavailableError returns correct error", () => {
    const err = createServiceUnavailableError()
    expect(err.type).toBe("service_unavailable")
    expect(err.statusCode).toBe(503)
  })

  test("createTimeoutError returns correct error", () => {
    const err = createTimeoutError()
    expect(err.type).toBe("timeout_error")
    expect(err.statusCode).toBe(504)
  })

  test("createInternalError returns correct error", () => {
    const err = createInternalError()
    expect(err.type).toBe("internal_error")
    expect(err.statusCode).toBe(500)
  })
})

// ---------------------------------------------------------------------------
// forwardError – produces Anthropic-compatible JSON error shape
// ---------------------------------------------------------------------------

describe("forwardError", () => {
  function mockContext(): any {
    return {
      json(body: unknown, status: number) {
        return { body, status }
      },
    }
  }

  test("handles APIError with correct shape", async () => {
    const c = mockContext()
    const err = createValidationError("bad field")

    const result = await forwardError(c, err)

    expect(result.status).toBe(422)
    expect(result.body).toEqual({
      error: {
        type: "validation_error",
        message: "bad field",
      },
    })
  })

  test("handles authentication APIError", async () => {
    const c = mockContext()
    const err = createAuthenticationError("Token expired")

    const result = await forwardError(c, err)

    expect(result.status).toBe(401)
    expect(result.body).toEqual({
      error: {
        type: "authentication_error",
        message: "Token expired",
      },
    })
  })

  test("handles HTTPError with 401", async () => {
    const c = mockContext()
    const response = new Response("Unauthorized", { status: 401 })
    const err = new HTTPError("upstream error", response)

    const result = await forwardError(c, err)

    expect(result.status).toBe(401)
    expect(result.body.error.type).toBe("authentication_error")
  })

  test("handles HTTPError with 429", async () => {
    const c = mockContext()
    const response = new Response("Too many requests", { status: 429 })
    const err = new HTTPError("rate limited", response)

    const result = await forwardError(c, err)

    expect(result.status).toBe(429)
    expect(result.body.error.type).toBe("rate_limit_error")
  })

  test("handles HTTPError with 503", async () => {
    const c = mockContext()
    const response = new Response("Service unavailable", { status: 503 })
    const err = new HTTPError("unavailable", response)

    const result = await forwardError(c, err)

    expect(result.status).toBe(503)
    expect(result.body.error.type).toBe("service_unavailable")
  })

  test("handles HTTPError with 504", async () => {
    const c = mockContext()
    const response = new Response("Gateway timeout", { status: 504 })
    const err = new HTTPError("timeout", response)

    const result = await forwardError(c, err)

    expect(result.status).toBe(504)
    expect(result.body.error.type).toBe("timeout_error")
  })

  test("handles HTTPError with 400", async () => {
    const c = mockContext()
    const response = new Response("Bad request", { status: 400 })
    const err = new HTTPError("bad request", response)

    const result = await forwardError(c, err)

    expect(result.status).toBe(400)
    expect(result.body.error.type).toBe("invalid_request_error")
  })

  test("handles HTTPError with 422", async () => {
    const c = mockContext()
    const response = new Response("Unprocessable", { status: 422 })
    const err = new HTTPError("validation", response)

    const result = await forwardError(c, err)

    expect(result.status).toBe(422)
    expect(result.body.error.type).toBe("validation_error")
  })

  test("handles HTTPError with JSON error body", async () => {
    const c = mockContext()
    const response = new Response(
      JSON.stringify({ error: "model not found" }),
      { status: 404 },
    )
    const err = new HTTPError("not found", response)

    const result = await forwardError(c, err)

    expect(result.status).toBe(404)
    expect(result.body.error).toBeDefined()
  })

  test("handles generic Error", async () => {
    const c = mockContext()
    const err = new Error("Something unexpected")

    const result = await forwardError(c, err)

    expect(result.status).toBe(500)
    expect(result.body).toEqual({
      error: {
        type: "internal_error",
        message: "Something unexpected",
      },
    })
  })

  test("handles non-Error thrown value", async () => {
    const c = mockContext()
    const result = await forwardError(c, "string error")

    expect(result.status).toBe(500)
    expect(result.body.error.type).toBe("internal_error")
  })
})

// ---------------------------------------------------------------------------
// Error response format matches Anthropic spec
// ---------------------------------------------------------------------------

describe("Error response format matches Anthropic spec", () => {
  function mockContext(): any {
    return {
      json(body: unknown, status: number) {
        return { body, status }
      },
    }
  }

  // Per error-codes.md:
  // 400 - invalid_request_error
  // 401 - authentication_error
  // 429 - rate_limit_error
  // 500 - internal error
  // 503 - service_unavailable
  // 504 - timeout_error

  test("400 maps to invalid_request_error", async () => {
    const c = mockContext()
    const err = createInvalidRequestError("Missing model field")
    const result = await forwardError(c, err)
    expect(result.status).toBe(400)
    expect(result.body.error.type).toBe("invalid_request_error")
    expect(typeof result.body.error.message).toBe("string")
  })

  test("401 maps to authentication_error", async () => {
    const c = mockContext()
    const err = createAuthenticationError("Invalid token")
    const result = await forwardError(c, err)
    expect(result.status).toBe(401)
    expect(result.body.error.type).toBe("authentication_error")
  })

  test("422 maps to validation_error", async () => {
    const c = mockContext()
    const err = createValidationError("temperature: must be between 0 and 1")
    const result = await forwardError(c, err)
    expect(result.status).toBe(422)
    expect(result.body.error.type).toBe("validation_error")
  })

  test("429 maps to rate_limit_error", async () => {
    const c = mockContext()
    const err = createRateLimitError()
    const result = await forwardError(c, err)
    expect(result.status).toBe(429)
    expect(result.body.error.type).toBe("rate_limit_error")
  })

  test("500 maps to internal_error", async () => {
    const c = mockContext()
    const err = createInternalError("Unexpected failure")
    const result = await forwardError(c, err)
    expect(result.status).toBe(500)
    expect(result.body.error.type).toBe("internal_error")
  })

  test("503 maps to service_unavailable", async () => {
    const c = mockContext()
    const err = createServiceUnavailableError("Copilot down")
    const result = await forwardError(c, err)
    expect(result.status).toBe(503)
    expect(result.body.error.type).toBe("service_unavailable")
  })

  test("504 maps to timeout_error", async () => {
    const c = mockContext()
    const err = createTimeoutError("Request timed out")
    const result = await forwardError(c, err)
    expect(result.status).toBe(504)
    expect(result.body.error.type).toBe("timeout_error")
  })

  test("all error responses have { error: { type, message } } shape", async () => {
    const c = mockContext()
    const errors = [
      createInvalidRequestError("test"),
      createAuthenticationError("test"),
      createValidationError("test"),
      createRateLimitError("test"),
      createServiceUnavailableError("test"),
      createTimeoutError("test"),
      createInternalError("test"),
    ]

    for (const err of errors) {
      const result = await forwardError(c, err)
      expect(result.body).toHaveProperty("error")
      expect(result.body.error).toHaveProperty("type")
      expect(result.body.error).toHaveProperty("message")
      expect(typeof result.body.error.type).toBe("string")
      expect(typeof result.body.error.message).toBe("string")
    }
  })
})
