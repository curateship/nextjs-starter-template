import { EMPTY_TERMINAL_STATE } from "@/app/constants"
import type { TerminalItem, WorkspaceTerminalState } from "@/app/types"

const ANSI_ESCAPE_PATTERN = new RegExp(`${String.fromCharCode(27)}\\[[0-9;?]*[ -/]*[@-~]`, "g")
const TERMINAL_OUTPUT_DECODER = new TextDecoder()
const TERMINAL_OUTPUT_EVENT_PREFIX = "terminal-output:"

export const TERMINAL_SCROLLBACK_LINES = 3000

export function looksLikeAgentOutput(data: number[]) {
  const clean = TERMINAL_OUTPUT_DECODER
    .decode(new Uint8Array(data))
    .replace(ANSI_ESCAPE_PATTERN, "")
  return /(^|\n)\s*(\u2022|Ran |Edited |Updated |Thinking|Checking|Applying|Codex\b)/.test(clean)
}

export function terminalOutputEvent(terminalId: string) {
  return `${TERMINAL_OUTPUT_EVENT_PREFIX}${terminalId}`
}

export function terminalStateFor(
  workspaceId: string,
  source: Record<string, WorkspaceTerminalState>
) {
  return workspaceId ? source[workspaceId] ?? EMPTY_TERMINAL_STATE : EMPTY_TERMINAL_STATE
}

export function nextTerminalName(terminals: TerminalItem[]) {
  const used = new Set(
    terminals
      .map((terminal) => terminal.name.match(/^Terminal (\d+)$/)?.[1])
      .filter((value): value is string => Boolean(value))
      .map(Number)
  )
  let index = 1
  while (used.has(index)) index += 1
  return `Terminal ${index}`
}

export function nextFrame() {
  return new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => resolve())
  })
}
