import { useCallback, useEffect, useRef, useState } from "react"

import { killNativeTerminal } from "@/app/native/terminal"
import { readableError } from "@/app/path"
import {
  looksLikeAgentOutput,
  nextTerminalName,
  terminalStateFor,
} from "@/app/terminal"
import type { WorkspaceStatus, WorkspaceTerminalState } from "@/app/types"

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
  >({})
  const terminalsByWorkspaceRef = useRef<Record<string, WorkspaceTerminalState>>({})
  const [workspaceStatuses, setWorkspaceStatuses] = useState<Record<string, WorkspaceStatus>>({})
  const terminalSizeRef = useRef({ cols: 80, rows: 24 })
  const workspaceStatusTimersRef = useRef<Record<string, number>>({})

  const activeTerminalState = terminalStateFor(activeWorkspaceId, terminalsByWorkspace)

  useEffect(() => {
    terminalsByWorkspaceRef.current = terminalsByWorkspace
  }, [terminalsByWorkspace])

  const clearWorkspaceStatus = useCallback((workspaceId: string) => {
    const runningTimer = workspaceStatusTimersRef.current[workspaceId]
    if (runningTimer) window.clearTimeout(runningTimer)
    delete workspaceStatusTimersRef.current[workspaceId]

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
    (workspaceId: string, terminalId: string, data: number[]) => {
      if (terminalId.endsWith("-server")) return
      const terminalExists = terminalStateFor(
        workspaceId,
        terminalsByWorkspaceRef.current
      ).terminals.some((terminal) => terminal.id === terminalId)
      if (!terminalExists) return
      if (!looksLikeAgentOutput(data)) return
      setWorkspaceStatuses((current) =>
        current[workspaceId] === "running"
          ? current
          : { ...current, [workspaceId]: "running" }
      )
      const currentTimer = workspaceStatusTimersRef.current[workspaceId]
      if (currentTimer) window.clearTimeout(currentTimer)
      workspaceStatusTimersRef.current[workspaceId] = window.setTimeout(() => {
        setWorkspaceStatuses((current) => ({ ...current, [workspaceId]: "waiting" }))
        delete workspaceStatusTimersRef.current[workspaceId]
      }, 2500)
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
    removeWorkspaceTerminals,
    selectTerminal,
    setTerminalTab,
    terminalFocusNonce,
    terminalTab,
    terminalsByWorkspace,
    workspaceStatuses,
  }
}
