import consola from "consola"
import { Hono } from "hono"
import { cors } from "hono/cors"
import { logger } from "hono/logger"

import { getActiveClientCount } from "~/lib/client-registry"
import { forwardError } from "~/lib/error"
import { state } from "~/lib/state"

import { completionRoutes } from "./routes/chat-completions/route"
import { embeddingRoutes } from "./routes/embeddings/route"
import { healthRoute, readyRoute } from "./routes/health/route"
import { messageRoutes } from "./routes/messages/route"
import { modelRoutes } from "./routes/models/route"
import { tokenRoute } from "./routes/token/route"

export const server = new Hono()

server.use(logger())
server.use(cors())
server.onError(async (error, c) => forwardError(c, error))

server.get("/", (c) => c.text("Server running"))

// Health check endpoints
server.route("/health", healthRoute)
server.route("/ready", readyRoute)

server.route("/chat/completions", completionRoutes)
server.route("/models", modelRoutes)
server.route("/embeddings", embeddingRoutes)
server.route("/token", tokenRoute)

// Compatibility with tools that expect v1/ prefix
server.route("/v1/chat/completions", completionRoutes)
server.route("/v1/models", modelRoutes)
server.route("/v1/embeddings", embeddingRoutes)

// Anthropic compatible endpoints
server.route("/v1/messages", messageRoutes)

// Internal endpoints for client management
server.get("/internal/status", async (c) => {
  const clientCount = await getActiveClientCount()
  return c.json({
    pid: process.pid,
    port: state.port,
    uptime: process.uptime(),
    clients: clientCount,
  })
})

// Fallback for unknown routes / unsupported methods — log a warning so that
// unsupported client requests are visible in the proxy logs.
server.notFound((c) => {
  consola.warn(
    `Unsupported request: ${c.req.method} ${c.req.path} (no matching route)`,
  )
  return c.json(
    {
      error: {
        type: "invalid_request_error",
        message: `Unsupported endpoint: ${c.req.method} ${c.req.path}`,
      },
    },
    404,
  )
})
