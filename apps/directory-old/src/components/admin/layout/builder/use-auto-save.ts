"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import { dismissErrorToast, showErrorToast } from "@/lib/error-toast"
import { useSaveStatus, type SaveStatus } from "@/components/admin/layout/builder/save-status"

/** How long we wait after the last edit before writing it. */
export const AUTO_SAVE_DEBOUNCE_MS = 800

export type AutoSaveOutcome = { saved: true } | { saved: false; reason: string }

interface AutoSaveOptions<T> {
  /** Writes the snapshot. Return `{ saved: false, reason }` for a real failure. */
  save: (snapshot: T) => Promise<AutoSaveOutcome>
  /**
   * Return a reason to refuse the write before it is attempted — a blank name,
   * a half-typed number. The edit stays on screen and the header says why
   * instead of the change disappearing in silence.
   */
  blockedReason?: (snapshot: T) => string | null
  debounceMs?: number
}

export interface AutoSaveController<T> {
  saveStatus: SaveStatus
  isSaving: boolean
  /** For a screen that also writes on its own (a modal that saves and closes). */
  setSaveStatus: (state: SaveStatus["state"], message?: string) => void
  /** Record an edit. It is written once typing stops. */
  scheduleSave: (snapshot: T) => void
  /** Write the pending edit right now (a dialog closing, a tab switch). */
  saveNow: (snapshot?: T) => Promise<boolean>
  /** Adopt server data without triggering a save. */
  markSaved: () => void
}

/**
 * Auto-save, ported from custom-shell's shell-layout: an edit schedules a
 * debounced write that runs on a serialized queue, so rapid edits land in the
 * order they were made and a slow request can never overwrite a newer one. A
 * pending edit is flushed if the screen unmounts, and a failure reports through
 * the shared error toast.
 */
export function useAutoSave<T>({
  save,
  blockedReason,
  debounceMs = AUTO_SAVE_DEBOUNCE_MS,
}: AutoSaveOptions<T>): AutoSaveController<T> {
  const [saveStatus, setSaveStatus] = useSaveStatus()
  const [isSaving, setIsSaving] = useState(false)

  // Callbacks change identity on every render of the calling screen; keeping
  // them in refs means the timer and unmount flush always run the current one.
  const saveRef = useRef(save)
  saveRef.current = save
  const blockedReasonRef = useRef(blockedReason)
  blockedReasonRef.current = blockedReason

  const pendingRef = useRef<{ snapshot: T } | null>(null)
  const editSeqRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const queueRef = useRef<Promise<unknown>>(Promise.resolve())
  const versionRef = useRef(0)

  const cancelPendingTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const saveNow = useCallback(
    async (snapshot?: T) => {
      cancelPendingTimer()

      if (snapshot !== undefined) {
        editSeqRef.current += 1
        pendingRef.current = { snapshot }
      }

      const pending = pendingRef.current
      if (!pending) return true

      const blocked = blockedReasonRef.current?.(pending.snapshot)
      if (blocked) {
        setSaveStatus("blocked", blocked)
        return false
      }

      const seq = editSeqRef.current
      const version = versionRef.current + 1
      versionRef.current = version

      dismissErrorToast()
      setSaveStatus("saving")
      setIsSaving(true)

      const run = queueRef.current
        .catch(() => undefined)
        .then(() => saveRef.current(pending.snapshot))
      queueRef.current = run.then(
        () => undefined,
        () => undefined
      )

      try {
        const outcome = await run
        const isCurrent = version === versionRef.current

        if (!outcome.saved) {
          if (isCurrent) {
            setSaveStatus("error", outcome.reason)
            showErrorToast(outcome.reason)
          }
          return false
        }

        // Only clear the pending edit if nothing was typed while this was
        // in flight — otherwise the newer edit still needs writing.
        if (seq === editSeqRef.current) {
          pendingRef.current = null
        }
        if (isCurrent) setSaveStatus("saved")
        return true
      } catch (error) {
        console.error("Auto-save failed:", error)
        if (version === versionRef.current) {
          const reason = error instanceof Error ? error.message : "Failed to save"
          setSaveStatus("error", reason)
          showErrorToast(reason)
        }
        return false
      } finally {
        if (version === versionRef.current) setIsSaving(false)
      }
    },
    [cancelPendingTimer, setSaveStatus]
  )

  const scheduleSave = useCallback(
    (snapshot: T) => {
      editSeqRef.current += 1
      pendingRef.current = { snapshot }
      // A fresh edit means "Saved" (or a stale failure) no longer describes
      // what's on screen — say "Unsaved changes" until the write lands.
      setSaveStatus("dirty")
      cancelPendingTimer()
      timerRef.current = setTimeout(() => {
        timerRef.current = null
        void saveNow()
      }, debounceMs)
    },
    [cancelPendingTimer, debounceMs, saveNow, setSaveStatus]
  )

  const markSaved = useCallback(() => {
    cancelPendingTimer()
    pendingRef.current = null
  }, [cancelPendingTimer])

  // Flush a pending edit when the screen goes away (navigation, sign-out) so a
  // change made in the last second isn't dropped. Fire and forget — this
  // component is unmounting, so there is nothing left to report to.
  useEffect(() => {
    return () => {
      if (!timerRef.current) return
      clearTimeout(timerRef.current)
      timerRef.current = null
      const pending = pendingRef.current
      if (!pending) return
      if (blockedReasonRef.current?.(pending.snapshot)) return
      void saveRef.current(pending.snapshot).catch(() => undefined)
    }
  }, [])

  return { saveStatus, isSaving, setSaveStatus, scheduleSave, saveNow, markSaved }
}
