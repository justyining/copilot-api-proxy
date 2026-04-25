import { defineCommand } from "citty"

import { runDaemon } from "./lib/daemon-server"

export const serve = defineCommand({
  meta: {
    name: "__serve",
    description:
      "Internal: run the proxy server as a background process. Do not invoke directly — use the default command or `start` instead.",
  },
  args: {
    port: {
      type: "string",
      default: "0",
      description: "Port to listen on (0 = random)",
    },
  },
  async run() {
    await runDaemon()
  },
})
