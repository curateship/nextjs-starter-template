import * as React from "react"

import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  elapsedFocusLabel,
  elapsedSeconds,
  focusWouldBeLost,
  MODE_LABELS,
  type TimerMode,
} from "@/lib/pomodoro/timer"
import type { usePomodoro } from "@/lib/pomodoro/use-pomodoro"

type PomodoroApi = ReturnType<typeof usePomodoro>

type PendingDiscard = {
  /** Which control was pressed, so the confirmed action is the right one. */
  action: { kind: "reset" } | { kind: "mode"; mode: TimerMode }
  /**
   * The time spent, frozen when the question was asked. The countdown keeps
   * running behind the dialog, and a number that climbed while you read the
   * sentence would be a moving target.
   */
  spentSeconds: number
}

/**
 * Switching phase and pressing Reset both throw away the focus in progress,
 * and nothing is recorded for a focus that does not finish. It is the only
 * action in the app that destroys something you cannot get back, so it asks
 * first — but only when there is something to lose. A break, and a focus
 * nobody has started, change straight away.
 *
 * Both Reset buttons and the mode pills share this hook, so the question is
 * worded once.
 */
export function useDiscardFocusConfirm(pomodoro: PomodoroApi) {
  const [pending, setPending] = React.useState<PendingDiscard | null>(null)

  const requestReset = () => {
    if (!focusWouldBeLost(pomodoro.timer)) {
      pomodoro.reset()
      return
    }
    setPending({
      action: { kind: "reset" },
      spentSeconds: elapsedSeconds(pomodoro.timer),
    })
  }

  const requestMode = (mode: TimerMode) => {
    if (!focusWouldBeLost(pomodoro.timer)) {
      pomodoro.selectMode(mode)
      return
    }
    setPending({
      action: { kind: "mode", mode },
      spentSeconds: elapsedSeconds(pomodoro.timer),
    })
  }

  const confirm = () => {
    if (!pending) return
    if (pending.action.kind === "reset") pomodoro.reset()
    else pomodoro.selectMode(pending.action.mode)
    setPending(null)
  }

  const dialog = (
    <ConfirmDialog
      open={pending !== null}
      onOpenChange={(open) => {
        if (!open) setPending(null)
      }}
      title="Throw away this focus?"
      description={describeDiscard(pending, pomodoro.timer.mode)}
      confirmLabel="Throw it away"
      cancelLabel="Keep focusing"
      onConfirm={confirm}
    />
  )

  return { requestReset, requestMode, discardDialog: dialog }
}

function describeDiscard(
  pending: PendingDiscard | null,
  currentMode: TimerMode
) {
  if (!pending) return null
  const spent = elapsedFocusLabel(pending.spentSeconds)
  const target =
    pending.action.kind === "reset"
      ? "the timer goes back to the start"
      : pending.action.mode === currentMode
        ? "the focus starts again from the beginning"
        : `the timer switches to ${MODE_LABELS[pending.action.mode]}`
  return (
    `${spent} of this focus is lost and ${target}. ` +
    "A focus that does not finish counts for nothing: no session, no streak, " +
    "no task progress."
  )
}
