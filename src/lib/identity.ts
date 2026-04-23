import { randomBytes, randomUUID } from "node:crypto"
import fs from "node:fs/promises"

import { PATHS } from "~/lib/paths"

export async function loadOrCreateDeviceId(): Promise<string> {
  const stored = (await fs.readFile(PATHS.DEVICE_ID_PATH, "utf8")).trim()
  if (stored) return stored

  const id = randomUUID()
  await fs.writeFile(PATHS.DEVICE_ID_PATH, id)
  await fs.chmod(PATHS.DEVICE_ID_PATH, 0o600)
  return id
}

export async function loadOrCreateMachineId(): Promise<string> {
  const stored = (await fs.readFile(PATHS.MACHINE_ID_PATH, "utf8")).trim()
  if (stored) return stored

  const id = randomBytes(32).toString("hex")
  await fs.writeFile(PATHS.MACHINE_ID_PATH, id)
  await fs.chmod(PATHS.MACHINE_ID_PATH, 0o600)
  return id
}

export function generateSessionId(): string {
  return `${randomUUID()}${Date.now()}`
}
