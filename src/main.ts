#!/usr/bin/env node

import { defineCommand, runMain } from "citty"

import { auth } from "./auth"
import { checkUsage } from "./check-usage"
import { debug } from "./debug"
import { runLaunch } from "./launch"
import { serve } from "./serve"

const SUBCOMMAND_NAMES = new Set(["auth", "check-usage", "debug", "__serve"])

// Decide: subcommand mode or launch mode?
// In launch mode, ALL user args go to claude — citty must never see them.
const firstPositional = process.argv.find(
  (a, i) => i >= 2 && !a.startsWith("-"),
)
const isSubcommand =
  firstPositional !== undefined && SUBCOMMAND_NAMES.has(firstPositional)

let claudeArgs: Array<string> = []
if (!isSubcommand && process.argv.length > 2) {
  claudeArgs = process.argv.splice(2)
}

const main = defineCommand({
  meta: {
    name: "claude-copilot",
    description: "GitHub Copilot API proxy for Claude Code",
  },
  args: {},
  subCommands: {
    auth,
    "check-usage": checkUsage,
    debug,
    __serve: serve,
  },
  async run() {
    if (isSubcommand) return

    await runLaunch({ claudeArgs })
  },
})

await runMain(main)
