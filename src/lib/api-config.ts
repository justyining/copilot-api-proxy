import { randomUUID } from "node:crypto"

import type { ClientMode, State } from "./state"

// Version constants — update when VSCode Copilot / Claude Code updates
const CLAUDE_CODE_VERSION = "2.1.98"
const API_VERSION = "2025-10-01"

// AB experiment context placeholder (extracted from real VSCode Copilot traffic)
const AB_EXPERIMENT_CONTEXT =
  "vsliv368:30146709;binariesv615:30325510;65e36911:30811543;nativeloc1:31344060;7d05f481:31481097;cg8ef616:31481098;copilot_t_ci:31333650;pythonrdcb7:31342333;6518g693:31463988;aj953862:31281341;b6b4d950:31327385;6abeh943:31336334;envsactivate1:31464700;cloudbuttont:31379625;upload-service:31384080;3efgi100_wstrepl:31403338;839jf696:31457053;use-responses-api:31390855;je187915:31401257;ec5jj548:31422691;cp_cls_c_966_ss:31454199;inlinechat_v2_hd992725:31499106;c3h7c220:31478652;30h21147:31435638;ge8j1254_inline_auto_hint_haiku:31490510;38bie571_auto:31478678;cp_cls_c_1081:31454833;ia-use-proxy-models-svc:31452481;test_treatment2:31471001;c9b86496:31447327;control_6dc23131:31497324;h17fi823:31466946;ei9d7968:31496641;534a6447:31496642;hg17d649:31458077;nes-extended-on:31455476;8hig5102:31480529;67jbj424:31495046;cpptoolsoff-v2:31475362;i2gc6536:31499202;30450953:31499301;ghj88844:31499326;23c7c724:31491644;client_tst_t:31495907;ddid_c:31478207;hmra_i5g22:31500360;getcmakediagnosticson:31489824;ja75b849:31495667;nes-perm-reb-0:31490411;pro_large_t:31499376;cp_cls_c_1082:31491634;719di409_sum_t:31499347;logging_enabled_new:31498466;db5d2638:31499441;output_1x:31496637;748c7209:31497895;"

interface ModeConfig {
  userAgent: string
}

function getModeConfig(mode: ClientMode): ModeConfig {
  switch (mode) {
    case "claude-code": {
      return {
        userAgent: `vscode_claude_code/${CLAUDE_CODE_VERSION} (external`,
      }
    }
    case "codex": {
      return {
        userAgent: "vscode_codex_cli/0.1.0",
      }
    }
    default: {
      return {
        userAgent: `vscode_claude_code/${CLAUDE_CODE_VERSION} (external`,
      }
    }
  }
}

// Simple headers for GitHub OAuth/device-code flows (not Copilot API)
export const standardHeaders = () => ({
  "content-type": "application/json",
  accept: "application/json",
})

export const copilotBaseUrl = (state: State) =>
  state.accountType === "individual" ?
    "https://api.githubcopilot.com"
  : `https://api.${state.accountType}.githubcopilot.com`

export interface CopilotHeadersOptions {
  state: State
  vision?: boolean
  intent?: string
  interactionType?: string
  initiator?: "user" | "agent"
}

export function copilotHeaders(
  options: CopilotHeadersOptions,
): Record<string, string> {
  const { state, vision, initiator } = options
  const modeConfig = getModeConfig(state.clientMode)

  const headers: Record<string, string> = {
    Authorization: `Bearer ${state.copilotToken}`,
    "content-type": "application/json",
    "editor-device-id": state.deviceId ?? "",
    "editor-plugin-version": `copilot-chat/${state.copilotVersion}`,
    "editor-version": `vscode/${state.vsCodeVersion}`,
    "openai-intent": options.intent ?? "conversation-panel",
    "user-agent": modeConfig.userAgent,
    "vscode-abexpcontext": AB_EXPERIMENT_CONTEXT,
    "vscode-machineid": state.machineId ?? "",
    "vscode-sessionid": state.sessionId ?? "",
    "x-agent-task-id": randomUUID(),
    "x-copilot-client-exp-assignment-context": AB_EXPERIMENT_CONTEXT,
    "x-github-api-version": API_VERSION,
    "x-interaction-id": randomUUID(),
    "x-interaction-type": options.interactionType ?? "conversation-panel",
    "x-request-id": randomUUID(),
    "x-vscode-user-agent-library-version": "electron-fetch",
    "sec-fetch-site": "none",
    "sec-fetch-mode": "no-cors",
    "sec-fetch-dest": "empty",
    "accept-encoding": "gzip",
    priority: "u=4",
  }

  if (initiator) {
    headers["x-initiator"] = initiator
  }

  if (state.clientMode === "claude-code") {
    headers["anthropic-beta"] = "interleaved-thinking-2025-05-14"
  }

  if (vision) {
    headers["copilot-vision-request"] = "true"
  }

  return headers
}

export const GITHUB_API_BASE_URL = "https://api.github.com"

export function githubHeaders(state: State): Record<string, string> {
  const modeConfig = getModeConfig(state.clientMode)

  return {
    "content-type": "application/json",
    authorization: `token ${state.githubToken}`,
    "editor-version": `vscode/${state.vsCodeVersion}`,
    "editor-plugin-version": `copilot-chat/${state.copilotVersion}`,
    "user-agent": modeConfig.userAgent,
    "x-github-api-version": API_VERSION,
    "x-vscode-user-agent-library-version": "electron-fetch",
  }
}

export const GITHUB_BASE_URL = "https://github.com"
export const GITHUB_CLIENT_ID = "Iv1.b507a08c87ecfe98"
export const GITHUB_APP_SCOPES = ["read:user"].join(" ")
