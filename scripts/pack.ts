import { execSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"

const ROOT = path.resolve(import.meta.dirname, "..")
const PACKAGES_DIR = path.join(ROOT, "packages")
const OUT_DIR = path.join(ROOT, "dist-packages")
const PKG_PATH = path.join(ROOT, "package.json")

interface Target {
  name: string
  description: string
  bin: string
  clientMode: string
  homepage?: string
  author?: string
  repository?: string | Record<string, string>
  bugs?: string | Record<string, string>
}

interface PackageJson {
  name: string
  version: string
  description: string
  bin: Record<string, string>
  homepage?: string
  author?: string
  repository?: string | Record<string, string>
  bugs?: string | Record<string, string>
  scripts?: Record<string, string>
  devDependencies?: Record<string, string>
  "simple-git-hooks"?: Record<string, string>
  "lint-staged"?: Record<string, string>
}

function loadTarget(name: string): Target {
  const file = path.join(PACKAGES_DIR, `${name}.json`)
  const base = JSON.parse(fs.readFileSync(file)) as Target

  const localFile = path.join(PACKAGES_DIR, `${name}.local.json`)
  try {
    const local = JSON.parse(fs.readFileSync(localFile)) as Partial<Target>
    return { ...base, ...local }
  } catch {
    return base
  }
}

function getAllTargets(): Array<string> {
  return fs
    .readdirSync(PACKAGES_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(".json", ""))
}

function pack(targetName: string): string {
  const target = loadTarget(targetName)
  const originalPkg = fs.readFileSync(PKG_PATH, "utf8")

  try {
    const pkg = JSON.parse(originalPkg) as PackageJson
    pkg.name = target.name
    pkg.description = target.description
    pkg.bin = { [target.bin]: "./dist/main.js" }

    if ("homepage" in target) pkg.homepage = target.homepage
    if ("author" in target) pkg.author = target.author
    if ("repository" in target) pkg.repository = target.repository
    if ("bugs" in target) pkg.bugs = target.bugs

    delete pkg.scripts
    delete pkg.devDependencies
    delete pkg["simple-git-hooks"]
    delete pkg["lint-staged"]

    fs.writeFileSync(PKG_PATH, JSON.stringify(pkg, null, 2))

    const output = execSync("npm pack --ignore-scripts", {
      cwd: ROOT,
      encoding: "utf8",
    }).trim()

    fs.mkdirSync(OUT_DIR, { recursive: true })

    const src = path.join(ROOT, output)
    const dest = path.join(OUT_DIR, output)
    fs.renameSync(src, dest)

    return dest
  } finally {
    fs.writeFileSync(PKG_PATH, originalPkg)
  }
}

const arg = process.argv[2]

if (!arg) {
  console.error("Usage: bun run scripts/pack.ts <target> | --all")
  process.exit(1)
}

execSync("bun run build", { cwd: ROOT, stdio: "inherit" })

if (arg === "--all") {
  for (const name of getAllTargets()) {
    const dest = pack(name)
    console.log(dest)
  }
} else {
  const dest = pack(arg)
  console.log(dest)
}
