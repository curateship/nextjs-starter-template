import { useCallback, useEffect, useRef, useState } from "react"

import { killNativeTerminal } from "@/app/native/terminal"
import { readableError } from "@/app/path"
import {
  cleanTerminalOutput,
  detectTerminalAgent,
  loadPersistedTerminalSessions,
  looksLikeAgentOutput,
  nextTerminalName,
  persistTerminalSessions,
  terminalStateFor,
} from "@/app/terminal"
import type { WorkspaceStatus, WorkspaceTerminalState } from "@/app/types"

// How long a workspace's terminal can stay silent before we call the agent
// idle and flip the badge to "waiting". Agents stream output far more often
// than this while working, so the badge stays steady until they truly stop.
const AGENT_IDLE_TIMEOUT_MS = 2500

type UseTerminalSessionsOptions = {
  activeWorkspaceId: string
  onError: (message: string) => void
}

export function useTerminalSessions({
  activeWorkspaceId,
  onError,
}: UseTerminalSessionsOptions) {
  const [terminalTab, setTerminalTab] = useState("terminal")
  const [terminalFocusNonce, setTerminalFocusNonce] = useState(0)
  const [terminalsByWorkspace, setTerminalsByWorkspace] = useState<
    Record<string, WorkspaceTerminalState>
  >(loadPersistedTerminalSessions)
  const terminalsByWorkspaceRef = useRef(terminalsByWorkspace)
  const [workspaceStatuses, setWorkspaceStatuses] = useState<Record<string, WorkspaceStatus>>({})
  const terminalSizeRef = useRef({ cols: 80, rows: 24 })
  const workspaceStatusTimersRef = useRef<Record<string, number>>({})
  // Workspaces with an in-flight agent session. Once a workspace is in here,
  // any further terminal output keeps it "running"; it leaves only when the
  // output goes quiet (timer below) or the user sends input.
  const runningWorkspacesRef = useRef<Set<string>>(new Set())

  const activeTerminalState = terminalStateFor(activeWorkspaceId, terminalsByWorkspace)

  useEffect(() => {
    terminalsByWorkspaceRef.current = terminalsByWorkspace
    persistTerminalSessions(terminalsByWorkspace)
  }, [terminalsByWorkspace])

  const clearWorkspaceStatus = useCallback((workspaceId: string) => {
    const runningTimer = workspaceStatusTimersRef.current[workspaceId]
    if (runningTimer) window.clearTimeout(runningTimer)
    delete workspaceStatusTimersRef.current[workspaceId]
    runningWorkspacesRef.current.delete(workspaceId)

    setWorkspaceStatuses((current) => {
      if (!current[workspaceId]) return current
      const next = { ...current }
      delete next[workspaceId]
      return next
    })
  }, [])

  const handleTerminalSizeChange = useCallback((cols: number, rows: number) => {
    terminalSizeRef.current = { cols, rows }
  }, [])

  const handleTerminalOutput = useCallback(
    (workspaceId: string, terminalId: string, data: Uint8Array) => {
      if (terminalId.endsWith("-server")) return
      const item = terminalStateFor(
        workspaceId,
        terminalsByWorkspaceRef.current
      ).terminals.find((terminal) => terminal.id === terminalId)
      if (!item) return

      // A workspace becomes "running" only when we see a real agent marker
      // (⏺ / "esc to interrupt" / the Codex banner). But an agent's spinner and
      // token stream keep redrawing without re-emitting that marker every chunk,
      // so once a session is running we let ANY further output keep it alive.
      // This is what stops the badge from flapping running↔waiting mid-work.
      // Once it's running AND the terminal's agent is known, the bytes have
      // nothing left to tell us — skip the decode+regex scan entirely and just
      // keep the session alive.
      const alreadyRunning = runningWorkspacesRef.current.has(workspaceId)
      if (!alreadyRunning || !item.agent) {
        const clean = cleanTerminalOutput(data)
        const hasAgentMarker = looksLikeAgentOutput(clean)
        if (!hasAgentMarker && !alreadyRunning) return

        if (hasAgentMarker && !item.agent) {
          const agent = detectTerminalAgent(clean)
          if (agent) {
            setTerminalsByWorkspace((current) => {
              const state = terminalStateFor(workspaceId, current)
              const target = state.terminals.find((terminal) => terminal.id === terminalId)
              if (!target || target.agent === agent) return current
              return {
                ...current,
                [workspaceId]: {
                  ...state,
                  terminals: state.terminals.map((terminal) =>
                    terminal.id === terminalId ? { ...terminal, agent } : terminal
                  ),
                },
              }
            })
          }
        }
      }

      runningWorkspacesRef.current.add(workspaceId)
      setWorkspaceStatuses((current) =>
        current[workspaceId] === "running"
          ? current
          : { ...current, [workspaceId]: "running" }
      )
      const currentTimer = workspaceStatusTimersRef.current[workspaceId]
      if (currentTimer) window.clearTimeout(currentTimer)
      workspaceStatusTimersRef.current[workspaceId] = window.setTimeout(() => {
        runningWorkspacesRef.current.delete(workspaceId)
        setWorkspaceStatuses((current) => ({ ...current, [workspaceId]: "waiting" }))
        delete workspaceStatusTimersRef.current[workspaceId]
      }, AGENT_IDLE_TIMEOUT_MS)
    },
    []
  )

  const handleTerminalInput = useCallback(
    (workspaceId: string, terminalId: string) => {
      if (terminalId.endsWith("-server")) return
      clearWorkspaceStatus(workspaceId)
    },
    [clearWorkspaceStatus]
  )

  useEffect(() => {
    const timers = workspaceStatusTimersRef.current
    return () => Object.values(timers).forEach(window.clearTimeout)
  }, [])

  function focusTerminal() {
    setTerminalTab("terminal")
    setTerminalFocusNonce((current) => current + 1)
  }

  function addTerminal(
    workspaceId = activeWorkspaceId,
    options: { id?: string; name?: string; startupCommand?: string } = {}
  ) {
    if (!workspaceId) return null

    const state = terminalStateFor(workspaceId, terminalsByWorkspace)
    const existing = options.id
      ? state.terminals.find((terminal) => terminal.id === options.id)
      : undefined

    if (existing) {
      selectTerminal(workspaceId, existing.id)
      return existing
    }

    const name = nextTerminalName(state.terminals)
    const terminal = {
      id: options.id ?? `${workspaceId}-terminal-${Date.now()}`,
      name: options.name ?? name,
      startupCommand: options.startupCommand,
    }

    setTerminalsByWorkspace((current) => {
      const currentState = terminalStateFor(workspaceId, current)
      return {
        ...current,
        [workspaceId]: {
          terminals: [...currentState.terminals, terminal],
          activeTerminalId: terminal.id,
        },
      }
    })
    focusTerminal()
    return terminal
  }

  function selectTerminal(workspaceId: string, terminalId: string) {
    setTerminalsByWorkspace((current) => {
      const state = terminalStateFor(workspaceId, current)
      return {
        ...current,
        [workspaceId]: {
          terminals: state.terminals,
          activeTerminalId: terminalId,
        },
      }
    })
    focusTerminal()
  }

  function closeTerminal(workspaceId: string, terminalId: string) {
    const state = terminalStateFor(workspaceId, terminalsByWorkspace)
    const closingIndex = state.terminals.findIndex((terminal) => terminal.id === terminalId)
    const nextTerminals = state.terminals.filter((terminal) => terminal.id !== terminalId)
    const nextActiveTerminalId =
      state.activeTerminalId === terminalId
        ? nextTerminals[Math.min(closingIndex, nextTerminals.length - 1)]?.id ?? ""
        : state.activeTerminalId

    setTerminalsByWorkspace((current) => ({
      ...current,
      [workspaceId]: {
        terminals: nextTerminals,
        activeTerminalId: nextActiveTerminalId,
      },
    }))
    terminalsByWorkspaceRef.current = {
      ...terminalsByWorkspaceRef.current,
      [workspaceId]: {
        terminals: nextTerminals,
        activeTerminalId: nextActiveTerminalId,
      },
    }
    if (nextTerminals.every((terminal) => terminal.id.endsWith("-server"))) {
      clearWorkspaceStatus(workspaceId)
    }
    void killNativeTerminal(terminalId).catch((error) =>
      onError(readableError(error))
    )
  }

  const pruneWorkspaceTerminals = useCallback((validWorkspaceIds: string[]) => {
    const valid = new Set(validWorkspaceIds)
    setTerminalsByWorkspace((current) => {
      const stale = Object.keys(current).filter((workspaceId) => !valid.has(workspaceId))
      if (!stale.length) return current
      const next = { ...current }
      stale.forEach((workspaceId) => delete next[workspaceId])
      return next
    })
  }, [])

  function removeWorkspaceTerminals(workspaceId: string) {
    clearWorkspaceStatus(workspaceId)
    const nextTerminalStates = { ...terminalsByWorkspaceRef.current }
    delete nextTerminalStates[workspaceId]
    terminalsByWorkspaceRef.current = nextTerminalStates

    setTerminalsByWorkspace((current) => {
      const next = { ...current }
      delete next[workspaceId]
      return next
    })
  }

  function getTerminalSize() {
    return terminalSizeRef.current
  }

  return {
    activeTerminalState,
    addTerminal,
    closeTerminal,
    focusTerminal,
    getTerminalSize,
    handleTerminalInput,
    handleTerminalOutput,
    handleTerminalSizeChange,
    pruneWorkspaceTerminals,
    removeWorkspaceTerminals,
    selectTerminal,
    setTerminalTab,
    terminalFocusNonce,
    terminalTab,
    terminalsByWorkspace,
    workspaceStatuses,
  }
}
