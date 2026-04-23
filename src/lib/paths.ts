import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

const APP_DIR = path.join(os.homedir(), ".local", "share", "copilot-api")

const GITHUB_TOKEN_PATH = path.join(APP_DIR, "github_token")
const DEVICE_ID_PATH = path.join(APP_DIR, "device_id")
const MACHINE_ID_PATH = path.join(APP_DIR, "machine_id")

export const PATHS = {
  APP_DIR,
  GITHUB_TOKEN_PATH,
  DEVICE_ID_PATH,
  MACHINE_ID_PATH,
}

export async function ensurePaths(): Promise<void> {
  await fs.mkdir(PATHS.APP_DIR, { recursive: true })
  await ensureFile(PATHS.GITHUB_TOKEN_PATH)
  await ensureFile(PATHS.DEVICE_ID_PATH)
  await ensureFile(PATHS.MACHINE_ID_PATH)
}

async function ensureFile(filePath: string): Promise<void> {
  try {
    await fs.access(filePath, fs.constants.W_OK)
  } catch {
    await fs.writeFile(filePath, "")
    await fs.chmod(filePath, 0o600)
  }
}
