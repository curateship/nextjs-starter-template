import { useCallback, useEffect, useRef, useState } from "react"

export type SaveStatusState = "idle" | "dirty" | "saving" | "saved" | "error"

export interface SaveStatus {
  state: SaveStatusState
  message?: string
  updatedAt: number | null
}

export type VisibleSaveStatusState = Exclude<SaveStatusState, "idle">
export type VisibleSaveStatus = SaveStatus & { state: VisibleSaveStatusState }

const SAVE_STATUS_LABELS: Record<SaveStatusState, string> = {
  idle: "",
  dirty: "Unsaved changes",
  saving: "Saving...",
  saved: "Saved",
  error: "Save failed",
}

const SAVED_STATUS_CLEAR_MS = 3000
export const IDLE_SAVE_STATUS: SaveStatus = { state: "idle", updatedAt: null }

export function createSaveStatus(
  state: SaveStatusState,
  message?: string,
  updatedAt: number | null = state === "idle" ? null : Date.now()
): SaveStatus {
  return { state, message, updatedAt }
}

export function getSaveStatusLabel(status: SaveStatus | null | undefined) {
  return status ? SAVE_STATUS_LABELS[status.state] : ""
}

export function isSaveStatusVisible(status: SaveStatus | null | undefined): status is VisibleSaveStatus {
  return Boolean(status && status.state !== "idle")
}

export function hasSaveableChange(currentValue: unknown, nextValue: unknown) {
  return JSON.stringify(currentValue) !== JSON.stringify(nextValue)
}

export function useSaveStatus() {
  const [saveStatus, setSaveStatus] = useState<SaveStatus>(IDLE_SAVE_STATUS)
  const clearSavedTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  const setStatus = useCallback((state: SaveStatusState, message?: string) => {
    if (clearSavedTimeout.current) {
      clearTimeout(clearSavedTimeout.current)
      clearSavedTimeout.current = null
    }

    const nextStatus = createSaveStatus(state, message)
    setSaveStatus(nextStatus)

    if (state === "saved") {
      clearSavedTimeout.current = setTimeout(() => {
        setSaveStatus((currentStatus) => (
          currentStatus.state === "saved" && currentStatus.updatedAt === nextStatus.updatedAt
            ? IDLE_SAVE_STATUS
            : currentStatus
        ))
        clearSavedTimeout.current = null
      }, SAVED_STATUS_CLEAR_MS)
    }
  }, [])

  useEffect(() => () => {
    if (clearSavedTimeout.current) {
      clearTimeout(clearSavedTimeout.current)
    }
  }, [])

  return [saveStatus, setStatus] as const
}
