import { Hono } from "hono"

import { handleCompletion } from "./handler"

export const completionRoutes = new Hono()

completionRoutes.post("/", (c) => handleCompletion(c))
