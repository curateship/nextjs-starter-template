import { EMPTY_TERMINAL_STATE, TERMINAL_SESSIONS_STORAGE_KEY } from "@/app/constants"
import type { TerminalAgent, TerminalItem, WorkspaceTerminalState } from "@/app/types"

const ANSI_ESCAPE_PATTERN = new RegExp(`${String.fromCharCode(27)}\\[[0-9;?]*[ -/]*[@-~]`, "g")
const TERMINAL_OUTPUT_DECODER = new TextDecoder()
const TERMINAL_OUTPUT_EVENT_PREFIX = "terminal-output:"

export const TERMINAL_SCROLLBACK_LINES = 800

const AGENT_OUTPUT_PATTERN = new RegExp(
  [
    // Codex TUI: bullet lines and action verbs at line start
    "(^|\\n)\\s*(\\u2022|Ran |Edited |Updated |Thinking|Checking|Applying|Codex\\b)",
    // Claude Code TUI: tool/message bullets (\u23fa) and the busy status line,
    // which redraws "(esc to interrupt)" continuously while working
    "\\u23FA",
    "esc to interrupt",
  ].join("|")
)

// Claude Code redraws "(esc to interrupt)" continuously while working and
// prints ⏺ before every tool call; Codex prints its own name in the banner
// and while working. Both are distinctive enough to tell the agents apart.
const CLAUDE_OUTPUT_PATTERN = /⏺|esc to interrupt/
const CODEX_OUTPUT_PATTERN = /(^|\n)\s*Codex\b/

function cleanTerminalOutput(data: number[]) {
  return TERMINAL_OUTPUT_DECODER
    .decode(new Uint8Array(data))
    .replace(ANSI_ESCAPE_PATTERN, "")
}

export function looksLikeAgentOutput(data: number[]) {
  return AGENT_OUTPUT_PATTERN.test(cleanTerminalOutput(data))
}

export function detectTerminalAgent(data: number[]): TerminalAgent | undefined {
  const clean = cleanTerminalOutput(data)
  if (CLAUDE_OUTPUT_PATTERN.test(clean)) return "claude"
  if (CODEX_OUTPUT_PATTERN.test(clean)) return "codex"
  return undefined
}

export function agentResumeCommand(agent: TerminalAgent) {
  return agent === "claude" ? "claude --continue\n" : "codex resume --last\n"
}

type PersistedTerminal = {
  id: string
  name: string
  agent?: TerminalAgent
}

function isTerminalAgent(value: unknown): value is TerminalAgent {
  return value === "claude" || value === "codex"
}

function persistableTerminals(terminals: TerminalItem[]): PersistedTerminal[] {
  return terminals
    .filter((terminal) => !terminal.id.endsWith("-server"))
    .map(({ id, name, agent }) => ({ id, name, agent }))
}

export function persistTerminalSessions(states: Record<string, WorkspaceTerminalState>) {
  const persisted: Record<string, { terminals: PersistedTerminal[]; activeTerminalId: string }> = {}
  for (const [workspaceId, state] of Object.entries(states)) {
    const terminals = persistableTerminals(state.terminals)
    if (!terminals.length) continue
    const activeTerminalId = terminals.some((terminal) => terminal.id === state.activeTerminalId)
      ? state.activeTerminalId
      : terminals[0].id
    persisted[workspaceId] = { terminals, activeTerminalId }
  }
  try {
    localStorage.setItem(TERMINAL_SESSIONS_STORAGE_KEY, JSON.stringify(persisted))
  } catch {
    // Persisting sessions is best-effort; a full or blocked storage is fine.
  }
}

export function loadPersistedTerminalSessions(): Record<string, WorkspaceTerminalState> {
  let parsed: unknown
  try {
    parsed = JSON.parse(localStorage.getItem(TERMINAL_SESSIONS_STORAGE_KEY) ?? "{}")
  } catch {
    return {}
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {}

  const restored: Record<string, WorkspaceTerminalState> = {}
  for (const [workspaceId, value] of Object.entries(parsed)) {
    const state = value as { terminals?: unknown; activeTerminalId?: unknown }
    if (!Array.isArray(state.terminals)) continue

    const terminals: TerminalItem[] = []
    for (const entry of state.terminals) {
      const item = entry as { id?: unknown; name?: unknown; agent?: unknown }
      if (typeof item.id !== "string" || !item.id || typeof item.name !== "string") continue
      if (item.id.endsWith("-server")) continue
      const agent = isTerminalAgent(item.agent) ? item.agent : undefined
      terminals.push({
        id: item.id,
        name: item.name,
        agent,
        // Reopen the coding chat where it left off when the app relaunches.
        startupCommand: agent ? agentResumeCommand(agent) : undefined,
      })
    }
    if (!terminals.length) continue

    const activeTerminalId =
      typeof state.activeTerminalId === "string" &&
      terminals.some((terminal) => terminal.id === state.activeTerminalId)
        ? state.activeTerminalId
        : terminals[0].id
    restored[workspaceId] = { terminals, activeTerminalId }
  }
  return restored
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
