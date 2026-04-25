import consola, { type LogObject } from "consola"
import fs from "node:fs"
import path from "node:path"
import process from "node:process"

import { startCleanup, stopCleanup } from "./client-registry"
import { removePidFile, writePidFile } from "./daemon"
import { PATHS } from "./paths"
import { state } from "./state"
import { stopTokenRefresh } from "./token"

let logFd: number | undefined

/**
 * Entry point for the background proxy server (hidden `__serve` subcommand).
 * Runs the server in the background, manages PID file, and auto-shuts down
 * when all clients disconnect.
 */
export async function runDaemon(): Promise<void> {
  const port = getPortFromArgs()

  // Open log file for all output
  logFd = fs.openSync(PATHS.SERVER_LOG_PATH, "a")

  // Override consola to write to log file
  consola.setReporters([
    {
      log(logObj: LogObject) {
        const msg = `${new Date().toISOString()} [${logObj.level}] ${logObj.args.join(" ")}\n`
        if (logFd !== undefined) {
          fs.writeSync(logFd, msg)
        }
      },
    },
  ])

  consola.info(`Daemon starting on port ${port} (PID ${process.pid})`)

  // Write initial PID file (port may be 0 = random)
  await writePidFile(process.pid, port)

  // Ensure clients directory exists
  fs.mkdirSync(PATHS.CLIENTS_DIR, { recursive: true })

  // Import and run server
  const { runServer } = await import("../start")
  const httpServer = await runServer({
    port,
    verbose: false,
    accountType: "individual",
    manual: false,
    rateLimitWait: false,
    claudeCode: false,
    showToken: false,
    proxyEnv: false,
    clientMode: "claude-code",
  })

  // Get actual port from server URL (important when port=0)
  const actualPort =
    httpServer.url ? Number.parseInt(new URL(httpServer.url).port, 10) : port
  state.port = actualPort

  // Rewrite PID file with actual port
  await writePidFile(process.pid, actualPort)
  consola.info(`Daemon listening on port ${actualPort}`)

  // Start client cleanup — auto-shutdown when no clients remain
  startCleanup(() => {
    consola.info("No active clients, shutting down")
    gracefulShutdown()
  })

  // Handle signals
  process.on("SIGTERM", () => gracefulShutdown())
  process.on("SIGINT", () => gracefulShutdown())

  process.on("exit", () => {
    if (logFd !== undefined) {
      fs.closeSync(logFd)
      logFd = undefined
    }
  })
}

function getPortFromArgs(): number {
  const portIdx = process.argv.indexOf("--port")
  if (portIdx !== -1 && process.argv[portIdx + 1]) {
    const port = Number.parseInt(process.argv[portIdx + 1], 10)
    if (!Number.isNaN(port)) return port
  }
  return 4141
}

function gracefulShutdown(): void {
  stopCleanup()
  stopTokenRefresh()
  void removePidFile()

  // Remove our own client lock file if it exists
  const lockFile = path.join(PATHS.CLIENTS_DIR, String(process.pid))
  try {
    fs.unlinkSync(lockFile)
  } catch {
    // File may not exist
  }

  process.exit(0)
}
