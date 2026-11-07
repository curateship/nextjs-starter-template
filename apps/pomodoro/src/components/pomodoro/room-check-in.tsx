import * as React from "react"
import { CheckIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { answerCheckIn } from "@/lib/api/pomodoro/rooms"
import { roomRefusalSentence } from "@/lib/pomodoro/room-join"
import type { RoomSnapshotClient } from "@/lib/pomodoro/room-clock-store"
import { showErrorToast } from "@/lib/toast/error-toast"

type RoomCheckInAnswer = NonNullable<RoomSnapshotClient["members"][number]["checkIn"]>

/**
 * "Did you finish?" under the room's ring, in the break after a focus
 * (Tyler's pick, 7 Nov 2026). Two buttons in the page, never a window, so the
 * break counts down whatever you do with it, and ignoring it leaves no mark.
 * Your answer shows beside your name for everyone in the room until the next
 * focus starts. It never ticks a task off (Tyler: only mark the check-in).
 *
 * Somebody who joined during the break was not in the focus, so they are not
 * asked.
 */
export function RoomCheckIn({ snapshot }: { snapshot: RoomSnapshotClient }) {
  const { room } = snapshot
  const me = snapshot.members.find((member) => member.mine)
  // The press shows at once; the room's next snapshot then agrees with it.
  const [sent, setSent] = React.useState<{
    sequence: number
    answer: RoomCheckInAnswer
  } | null>(null)
  const [pending, setPending] = React.useState(false)
  const onBreak = room.phase === "short" || room.phase === "long"
  const wasInTheFocus =
    me !== undefined &&
    room.phaseStartedAt !== null &&
    new Date(me.joinedAt).getTime() <= new Date(room.phaseStartedAt).getTime()
  if (!onBreak || !wasInTheFocus) return null
  const answer =
    sent?.sequence === room.sequence ? sent.answer : (me?.checkIn ?? null)

  const choose = async (next: RoomCheckInAnswer) => {
    if (pending || next === answer) return
    const sequence = room.sequence
    const previous = sent
    setSent({ sequence, answer: next })
    setPending(true)
    try {
      await answerCheckIn(room.slug, next === "finished")
    } catch (cause) {
      setSent(previous)
      showErrorToast(
        roomRefusalSentence(cause) ??
          (cause instanceof Error && cause.message.includes("ROOM_NOT_ON_BREAK")
            ? "The break is over, so the check-in has closed."
            : "Your answer could not be saved. Press it again.")
      )
    } finally {
      setPending(false)
    }
  }

  return (
    <div
      role="group"
      aria-label="Did you finish?"
      className="flex flex-wrap items-center justify-center gap-2"
    >
      <span className="text-sm text-muted-foreground">Did you finish?</span>
      <Button
        size="sm"
        variant={answer === "finished" ? "default" : "outline"}
        className="rounded-full"
        aria-pressed={answer === "finished"}
        onClick={() => void choose("finished")}
      >
        {answer === "finished" ? <CheckIcon aria-hidden="true" /> : null}
        Finished
      </Button>
      <Button
        size="sm"
        variant={answer === "not_yet" ? "default" : "outline"}
        className="rounded-full"
        aria-pressed={answer === "not_yet"}
        onClick={() => void choose("not_yet")}
      >
        Not yet
      </Button>
    </div>
  )
}

/** The answer beside a name in the room's people list. */
export function RoomCheckInMark({ answer }: { answer: RoomCheckInAnswer }) {
  return (
    // The words stay the text colour: the light theme's green is under 4.5:1
    // on white at this size, so only the tick is green.
    <span
      className={cn(
        "flex items-center gap-1 text-xs",
        answer === "finished" ? "text-foreground" : "text-muted-foreground"
      )}
    >
      {answer === "finished" ? (
        <CheckIcon className="size-3 text-[var(--p-success)]" aria-hidden="true" />
      ) : null}
      {answer === "finished" ? "Finished" : "Not yet"}
    </span>
  )
}
