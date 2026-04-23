import consola from "consola"

import type { State } from "./state"

import { createRateLimitError } from "./error"
import { sleep } from "./utils"

let mutex: Promise<void> = Promise.resolve()

export async function checkRateLimit(state: State) {
  const previousMutex = mutex
  let release!: () => void
  mutex = new Promise<void>((resolve) => {
    release = resolve
  })
  await previousMutex

  try {
    if (state.rateLimitSeconds === undefined) return

    const now = Date.now()

    if (!state.lastRequestTimestamp) {
      state.lastRequestTimestamp = now
      return
    }

    const elapsedSeconds = (now - state.lastRequestTimestamp) / 1000

    if (elapsedSeconds > state.rateLimitSeconds) {
      state.lastRequestTimestamp = now
      return
    }

    const waitTimeSeconds = Math.ceil(state.rateLimitSeconds - elapsedSeconds)

    if (!state.rateLimitWait) {
      consola.warn(
        `Rate limit exceeded. Need to wait ${waitTimeSeconds} more seconds.`,
      )
      throw createRateLimitError(
        `Rate limit exceeded. Please wait ${waitTimeSeconds} seconds before making another request.`,
      )
    }

    const waitTimeMs = waitTimeSeconds * 1000
    consola.warn(
      `Rate limit reached. Waiting ${waitTimeSeconds} seconds before proceeding...`,
    )
    await sleep(waitTimeMs)
    consola.info("Rate limit wait completed, proceeding with request")
    // eslint-disable-next-line require-atomic-updates -- protected by mutex
    state.lastRequestTimestamp = Date.now()
  } finally {
    release()
  }
}
