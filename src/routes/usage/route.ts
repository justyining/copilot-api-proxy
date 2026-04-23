import { Hono } from "hono"

import { state } from "~/lib/state"
import { getCopilotUsage } from "~/services/github/get-copilot-usage"

export const usageRoute = new Hono()

usageRoute.get("/", async (c) => {
  const usage = await getCopilotUsage()
  return c.json({
    ...usage,
    quotaFromHeaders: state.quotaInfo ?? null,
  })
})
