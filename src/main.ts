#!/usr/bin/env node

import { defineCommand, runMain } from "citty"

import { auth } from "./auth"
import { checkUsage } from "./check-usage"
import { debug } from "./debug"
import { runLaunch } from "./launch"
import { start } from "./lib/start-command"
import { serve } from "./serve"
import { stop } from "./stop"

const SUBCOMMAND_NAMES = new Set([
  "auth",
  "start",
  "check-usage",
  "debug",
  "stop",
  "__serve",
])

const main = defineCommand({
  meta: {
    name: "claude-copilot",
    description: "GitHub Copilot API proxy for Claude Code",
  },
  args: {
    foreground: {
      alias: "f",
      type: "boolean",
      default: false,
      description: "Run in foreground mode (don't exec claude, for debugging)",
    },
  },
  subCommands: {
    auth,
    start,
    "check-usage": checkUsage,
    debug,
    stop,
    __serve: serve,
  },
  async run({ args, rawArgs }) {
    // citty also runs the parent's run() after a matched subcommand's run();
    // skip the launch flow in that case.
    const firstPositional = rawArgs.find((a) => !a.startsWith("-"))
    if (firstPositional && SUBCOMMAND_NAMES.has(firstPositional)) {
      return
    }

    await runLaunch({ foreground: args.foreground })
  },
})

await runMain(main)
