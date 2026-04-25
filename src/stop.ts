import { defineCommand } from "citty"
import consola from "consola"

import { readPidFile, removePidFile } from "./lib/daemon"

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

async function waitForExit(pid: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (!isProcessAlive(pid)) return true
    await new Promise((r) => setTimeout(r, 100))
  }
  return false
}

export const stop = defineCommand({
  meta: {
    name: "stop",
    description: "Force stop the background proxy server",
  },
  async run() {
    const pidInfo = await readPidFile()

    if (!pidInfo) {
      consola.info("No server running (no PID file found)")
      return
    }

    if (!isProcessAlive(pidInfo.pid)) {
      consola.info("Server process already dead, cleaning up PID file")
      await removePidFile()
      return
    }

    consola.info(`Stopping server (PID ${pidInfo.pid})...`)

    try {
      process.kill(pidInfo.pid, "SIGTERM")
    } catch {
      consola.error("Failed to send SIGTERM to server process")
      await removePidFile()
      return
    }

    const exited = await waitForExit(pidInfo.pid, 5000)

    if (!exited) {
      consola.warn("Server did not exit gracefully, force killing...")
      try {
        process.kill(pidInfo.pid, "SIGKILL")
      } catch {
        // Process may have just exited
      }
    }

    await removePidFile()
    consola.success("Server stopped")
  },
})
