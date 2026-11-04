import * as React from "react"

import { useReportedSaveStatus } from "@/components/settings/use-reported-save-status"
import { useEffectBeforePaint } from "@/lib/hooks/use-effect-before-paint"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"

/**
 * An edit saves itself this long after the last keystroke. Leaving the field,
 * or pressing Enter, saves straight away.
 */
export const SAVE_DELAY_MS = 1200

/**
 * The save behind a settings card that saves itself: Email, Payments, AI
 * provider keys and Cloudflare R2. Each of them wrote these rules out by hand,
 * Email eleven times over.
 *
 *     const autoSave = useSettingsAutoSave(describeError, setStatus)
 *     onChange → autoSave.schedule("inbound", () => saveInbound(value))
 *     onBlur   → autoSave.flush("inbound", () => saveInbound(value))
 *     a switch → autoSave.run("quote", () => saveQuote(checked))
 *
 * `call` returns the card's fresh status, which goes to `apply`.
 *
 * Not the same as `useAutoSave` in lib/hooks, which keeps one draft (an email
 * or an automation being written) and saves it whole. This one saves a
 * settings card field by field.
 *
 * The rules every card kept, kept here once:
 *
 * - **One timer per field.** Typing in one box never cancels another box's
 *   pending save.
 * - **The value rides in the call, not read from state.** A timer saves exactly
 *   what was typed when it was set, so the caller builds `call` around the
 *   value it has in hand.
 * - **A flush while another save runs is scheduled again, never dropped.**
 *   Tabbing from one field straight into the next lands exactly there, and
 *   dropping it lost the edit for good.
 * - **`saving` stays set until the last save in flight ends.** Remove buttons
 *   are disabled while it is set: a delete racing a save's upsert could bring
 *   back the key that was just removed. Test buttons ignore it, because the
 *   blur that starts a save is the same click that presses Test.
 * - **Idle is reported as nothing.** The Saving…/Saved line goes through
 *   `useReportedSaveStatus`, which says why.
 * - **A failed save keeps what was typed** and says what failed in a toast.
 *
 * `onSaved` runs after a save lands. A card clearing a typed key uses it, and
 * clears the box only if it still holds what was saved, so a newer edit
 * survives and saves itself in turn.
 *
 * `run` answers whether the save landed, for a switch that puts itself back
 * when it did not.
 */
export function useSettingsAutoSave<T>(
  describeError: (error: unknown) => string,
  apply: (result: T) => void
) {
  const setSaveStatus = useReportedSaveStatus()
  // The field saving right now, for the buttons that wait on it.
  const [saving, setSaving] = React.useState<string | null>(null)
  // How many saves are in flight. A timer may fire while a flushed save still
  // runs, so there can be two, and `saving` clears only when both are done.
  const inFlight = React.useRef(0)
  const timers = React.useRef<Record<string, ReturnType<typeof setTimeout>>>(
    {}
  )

  React.useEffect(() => {
    const pending = timers.current
    return () => {
      for (const field of Object.keys(pending)) clearTimeout(pending[field])
    }
  }, [])

  // A timer set three renders ago still reports through the newest callbacks.
  const latest = React.useRef({ describeError, apply })
  useEffectBeforePaint(() => {
    latest.current = { describeError, apply }
  })

  const run = React.useCallback(
    async (field: string, call: () => Promise<T>, onSaved?: () => void) => {
      inFlight.current += 1
      setSaving(field)
      setSaveStatus("saving")
      dismissErrorToast()
      try {
        latest.current.apply(await call())
        onSaved?.()
        setSaveStatus("saved")
        return true
      } catch (error) {
        setSaveStatus("idle")
        showErrorToast(latest.current.describeError(error))
        return false
      } finally {
        inFlight.current -= 1
        if (inFlight.current === 0) setSaving(null)
      }
    },
    [setSaveStatus]
  )

  /** Forget a field's pending save, as when its box is emptied. */
  const cancel = React.useCallback((field: string) => {
    clearTimeout(timers.current[field])
  }, [])

  /** Save once the typing stops. A newer edit to the field replaces this one. */
  const schedule = React.useCallback(
    (field: string, call: () => Promise<T>, onSaved?: () => void) => {
      clearTimeout(timers.current[field])
      timers.current[field] = setTimeout(
        () => void run(field, call, onSaved),
        SAVE_DELAY_MS
      )
    },
    [run]
  )

  /** Save now, or, while another save is running, after the usual 1.2s wait. */
  const flush = React.useCallback(
    (field: string, call: () => Promise<T>, onSaved?: () => void) => {
      clearTimeout(timers.current[field])
      if (inFlight.current > 0) {
        schedule(field, call, onSaved)
        return
      }
      void run(field, call, onSaved)
    },
    [run, schedule]
  )

  return { saving, run, schedule, flush, cancel }
}
