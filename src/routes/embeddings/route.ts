import { Hono } from "hono"

import {
  createEmbeddings,
  type EmbeddingRequest,
} from "~/services/copilot/create-embeddings"

export const embeddingRoutes = new Hono()

embeddingRoutes.post("/", async (c) => {
  const payload = await c.req.json<EmbeddingRequest>()
  const response = await createEmbeddings(payload)
  return c.json(response)
})
