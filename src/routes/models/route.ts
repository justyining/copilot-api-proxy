import { Hono } from "hono"

import { state } from "~/lib/state"
import { cacheModels } from "~/lib/utils"

export const modelRoutes = new Hono()

modelRoutes.get("/", async (c) => {
  if (!state.models) {
    await cacheModels()
  }

  const models = state.models?.data.map((model) => ({
    id: model.id,
    object: "model",
    type: "model",
    created: 0,
    created_at: new Date(0).toISOString(),
    owned_by: model.vendor,
    display_name: model.name,
  }))

  return c.json({
    object: "list",
    data: models,
    has_more: false,
  })
})
