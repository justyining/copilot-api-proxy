import fs from "node:fs/promises"
import path from "node:path"

import { PATHS } from "./paths"

const CLEANUP_INTERVAL_MS = 300_000

let cleanupTimer: ReturnType<typeof setInterval> | undefined

/**
 * Scan the clients directory and count PIDs that are still alive.
 * Removes stale lock files for dead processes.
 */
export async function getActiveClientCount(): Promise<number> {
  let files: Array<string>
  try {
    files = await fs.readdir(PATHS.CLIENTS_DIR)
  } catch {
    return 0
  }

  let alive = 0
  for (const file of files) {
    const pid = Number.parseInt(file, 10)
    if (Number.isNaN(pid)) continue

    if (isProcessAlive(pid)) {
      alive++
    } else {
      // Clean up stale lock file
      await fs.unlink(path.join(PATHS.CLIENTS_DIR, file)).catch(() => {})
    }
  }

  return alive
}

/**
 * Start periodic cleanup. Calls onNoClients when no alive clients remain.
 */
export function startCleanup(onNoClients: () => void): void {
  if (cleanupTimer) return

  cleanupTimer = setInterval(async () => {
    const count = await getActiveClientCount()
    if (count === 0) {
      stopCleanup()
      onNoClients()
    }
  }, CLEANUP_INTERVAL_MS)
}

export function stopCleanup(): void {
  if (cleanupTimer) {
    clearInterval(cleanupTimer)
    cleanupTimer = undefined
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}
