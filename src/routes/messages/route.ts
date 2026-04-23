import { Hono } from "hono"

import { handleCountTokens } from "./count-tokens-handler"
import { handleCompletion } from "./handler"

export const messageRoutes = new Hono()

messageRoutes.post("/", (c) => handleCompletion(c))
messageRoutes.post("/count_tokens", (c) => handleCountTokens(c))
