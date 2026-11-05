import * as React from "react"

import { useShellRuntime } from "@/components/shell/shell-layout"
import type { SaveStatus } from "@/components/shell/sticky-header/sticky-header"
import { useEffectBeforePaint } from "@/lib/hooks/use-effect-before-paint"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"

/** Same rhythm as every other auto-save in this app. */
const SAVE_DEBOUNCE_MS = 700

/**
 * A draft that saves itself 700ms after the last change, for the email editor
 * and the automation editor.
 *
 * - Saves run one at a time, in the order they were made, so rapid edits land
 *   in order. A version counter means only the newest save's answer moves the
 *   header: an older save finishing late cannot say "Saved" over a newer one.
 * - `save` may answer `false` to say it refused without failing. The draft then
 *   stays unsaved and the header goes quiet.
 * - `blockedReason` stops a save before it starts and says why in the header,
 *   for a draft that cannot be saved yet.
 * - Leaving mid-wait sends the last change rather than dropping it.
 * - The state goes in the sticky header as it is, "idle" included, and "Saved"
 *   clears itself after two seconds.
 *
 * `save`, `describeError` and `blockedReason` may be written inline: the latest
 * ones are always used.
 */
export function useAutoSave<T>(
  initial: T,
  {
    save,
    describeError,
    blockedReason,
  }: {
    save: (value: T) => Promise<unknown>
    describeError: (error: unknown) => string
    blockedReason?: (value: T) => string | null
  }
) {
  const { reportSaveStatus } = useShellRuntime()
  const [value, setValue] = React.useState(initial)
  const [saveStatus, setSaveStatus] = React.useState<SaveStatus>("idle")

  const latestRef = React.useRef(initial)
  const lastSavedRef = React.useRef(JSON.stringify(initial))
  const saveTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const saveQueueRef = React.useRef(Promise.resolve())
  const saveVersionRef = React.useRef(0)
  // Read inside the flush-on-unmount effect, which must not re-run — and so
  // must not depend on — functions that change on every render.
  const options = React.useRef({ save, describeError, blockedReason })
  useEffectBeforePaint(() => {
    options.current = { save, describeError, blockedReason }
  })

  const saveNow = React.useCallback(async () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
    const snapshot = latestRef.current
    const serialized = JSON.stringify(snapshot)
    if (serialized === lastSavedRef.current) return true
    const blocked = options.current.blockedReason?.(snapshot)
    if (blocked) {
      setSaveStatus({ blocked })
      return false
    }

    const version = saveVersionRef.current + 1
    saveVersionRef.current = version
    setSaveStatus("saving")

    const pending = saveQueueRef.current
      .catch(() => undefined)
      .then(() => options.current.save(snapshot))
    saveQueueRef.current = pending.then(
      () => undefined,
      () => undefined
    )

    try {
      const saved = await pending
      if (saved === false) {
        if (version === saveVersionRef.current) setSaveStatus("idle")
        return false
      }
      lastSavedRef.current = serialized
      if (version === saveVersionRef.current) setSaveStatus("saved")
      return true
    } catch (error) {
      if (version === saveVersionRef.current) {
        setSaveStatus("idle")
        showErrorToast(options.current.describeError(error))
      }
      return false
    }
  }, [])

  const change = React.useCallback(
    (updater: (current: T) => T) => {
      // Worked out eagerly from the ref rather than inside a functional
      // setState: the ref has to move synchronously, because the save snapshot
      // reads it, and a setState updater must stay pure — React may run it
      // twice.
      const next = updater(latestRef.current)
      latestRef.current = next
      setValue(next)
      dismissErrorToast()
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      saveTimerRef.current = setTimeout(() => {
        saveTimerRef.current = null
        void saveNow()
      }, SAVE_DEBOUNCE_MS)
    },
    [saveNow]
  )

  /** Takes a value the server already holds, throwing away the draft. */
  const reset = React.useCallback((next: T) => {
    latestRef.current = next
    lastSavedRef.current = JSON.stringify(next)
    setValue(next)
  }, [])

  /** The draft as it stands this instant, for event handlers. */
  const latest = React.useCallback(() => latestRef.current, [])

  /** True once everything on screen has been saved. */
  const isSaved = React.useCallback(
    () => JSON.stringify(latestRef.current) === lastSavedRef.current,
    []
  )

  // Flush a pending edit if the editor goes away mid-wait, so navigating off
  // cannot drop the last thing that was typed. Fire-and-forget: the editor is
  // going away.
  React.useEffect(() => {
    return () => {
      if (!saveTimerRef.current) return
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
      const snapshot = latestRef.current
      if (JSON.stringify(snapshot) === lastSavedRef.current) return
      if (options.current.blockedReason?.(snapshot)) return
      // Behind any save still on its way, so an older one cannot land last.
      const save = options.current.save
      void saveQueueRef.current
        .then(() => save(snapshot))
        .catch(() => undefined)
    }
  }, [])

  React.useEffect(() => {
    if (saveStatus !== "saved") return
    const timer = setTimeout(() => setSaveStatus("idle"), 2000)
    return () => clearTimeout(timer)
  }, [saveStatus])

  // The editors have no bar of their own, so saving shows in the sticky header
  // alongside every other auto-save. Clearing on the way out matters, or
  // "Saved" would still be sitting there on the next page.
  React.useEffect(() => {
    reportSaveStatus(saveStatus)
  }, [reportSaveStatus, saveStatus])
  React.useEffect(() => {
    return () => reportSaveStatus(null)
  }, [reportSaveStatus])

  return { value, latest, change, saveNow, reset, isSaved }
}
