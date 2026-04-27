import { spawn } from "node:child_process"
import fs from "node:fs/promises"
import path from "node:path"

import { PATHS, ensurePaths } from "./paths"

interface PidInfo {
  pid: number
  port: number
  startedAt: number
}

const READY_TIMEOUT_MS = 15_000
const READY_POLL_INTERVAL_MS = 200

export async function readPidFile(): Promise<PidInfo | null> {
  try {
    const content = await fs.readFile(PATHS.SERVER_PID_PATH)
    return JSON.parse(content) as PidInfo
  } catch {
    return null
  }
}

export async function writePidFile(pid: number, port: number): Promise<void> {
  await fs.writeFile(
    PATHS.SERVER_PID_PATH,
    JSON.stringify({ pid, port, startedAt: Date.now() }),
  )
}

export async function removePidFile(): Promise<void> {
  await fs.unlink(PATHS.SERVER_PID_PATH).catch(() => {})
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

async function isServerHealthy(port: number): Promise<boolean> {
  try {
    const res = await fetch(`http://localhost:${port}/health`)
    return res.ok
  } catch {
    return false
  }
}

async function isServerReady(port: number): Promise<boolean> {
  try {
    const res = await fetch(`http://localhost:${port}/ready`)
    return res.ok
  } catch {
    return false
  }
}

/**
 * Spawn the server as a detached background process on a random port.
 * The server re-executes the same entry point with the hidden `__serve` subcommand.
 * Returns the actual port assigned by the OS.
 */
export async function spawnServer(): Promise<number> {
  await ensurePaths()

  const args = [process.argv[1], "__serve", "--port", "0"]

  const child = spawn(process.execPath, args, {
    detached: true,
    stdio: "ignore",
    env: { ...process.env },
  })

  child.unref()

  const pid = child.pid
  if (pid === undefined) {
    throw new Error("Failed to spawn background server: no pid")
  }
  // Wait for PID file to appear with the actual port
  const deadline = Date.now() + READY_TIMEOUT_MS
  while (Date.now() < deadline) {
    const pidInfo = await readPidFile()
    if (
      pidInfo
      && pidInfo.pid === pid
      && pidInfo.port !== 0 // Verify server is ready
      && (await isServerReady(pidInfo.port))
    ) {
      return pidInfo.port
    }
    await new Promise((r) => setTimeout(r, READY_POLL_INTERVAL_MS))
  }

  throw new Error(
    `Server failed to become ready within ${READY_TIMEOUT_MS / 1000}s`,
  )
}

/**
 * Ensure a background server is running. Reuses existing one if healthy.
 * Returns the server port.
 */
export async function ensureServer(): Promise<number> {
  const pidInfo = await readPidFile()

  if (pidInfo) {
    const alive = isProcessAlive(pidInfo.pid)
    if (alive && (await isServerHealthy(pidInfo.port))) {
      return pidInfo.port
    }

    // Stale PID file
    await removePidFile()
  }

  return spawnServer()
}

/**
 * Register this client by writing a lock file with the current PID.
 * The PID survives exec(), so it remains valid for the claude process.
 */
export async function registerClient(): Promise<void> {
  await fs.mkdir(PATHS.CLIENTS_DIR, { recursive: true })
  const lockFile = path.join(PATHS.CLIENTS_DIR, String(process.pid))
  await fs.writeFile(lockFile, "")
}

/**
 * Remove this client's lock file.
 */
export async function deregisterClient(): Promise<void> {
  const lockFile = path.join(PATHS.CLIENTS_DIR, String(process.pid))
  await fs.unlink(lockFile).catch(() => {})
}
