import * as React from "react"

import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import {
  START_DELAYS,
  START_DELAY_LABELS,
  type StartDelay,
} from "@/lib/pomodoro/room-countdown"
import type { RoomSnapshotClient } from "@/lib/pomodoro/room-clock-store"

/**
 * The parts of a room's clock that the ring on the room page and the header's
 * room dropdowns both draw (rooms task 03). One copy, so the two can never
 * show a different time or offer the host different buttons.
 */

type Room = RoomSnapshotClient["room"]

export type RoomHostActionClient =
  | "start_focus"
  | "start_break"
  | "next_phase"
  | "close"
  | "cancel_start"

/**
 * Seconds left until a time the server set: the end of the room's phase, or
 * the end of a "Starting in" countdown. Null when there is none (a waiting
 * room with no countdown).
 */
function useRoomSecondsLeft(phaseEndsAt: Date | string | null) {
  const endsAtTime = phaseEndsAt ? new Date(phaseEndsAt).getTime() : null
  const [now, setNow] = React.useState(() => Date.now())
  React.useEffect(() => {
    if (!endsAtTime) return
    setNow(Date.now())
    const interval = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(interval)
  }, [endsAtTime])
  if (!endsAtTime) return null
  return Math.max(0, Math.ceil((endsAtTime - now) / 1000))
}

/** "25:00", the way the ring writes a number of seconds. */
export function clockText(totalSeconds: number) {
  return `${String(Math.floor(totalSeconds / 60)).padStart(2, "0")}:${String(totalSeconds % 60).padStart(2, "0")}`
}

/**
 * What the room's clock reads now. A room with no clock running shows the
 * focus length, the way the ring does.
 */
export function useRoomClockReading(room: Room) {
  const secondsLeft = useRoomSecondsLeft(room.phaseEndsAt)
  // "Starting in": a countdown the host began from waiting (9 Oct 2026).
  const countdownLeft = useRoomSecondsLeft(room.phase === "waiting" ? room.startingAt : null)
  return {
    secondsLeft,
    countdownLeft,
    counting: countdownLeft !== null,
    shownSeconds: countdownLeft ?? secondsLeft ?? room.focusMinutes * 60,
  }
}

const roomPhaseNames: Record<string, string> = {
  waiting: "Waiting",
  focus: "Focus",
  short: "Short break",
  long: "Long break",
}

/** "Focus", "Short break", "Waiting" or "Starting in". */
export function roomPhaseName(room: Room, counting: boolean) {
  return counting ? "Starting in" : (roomPhaseNames[room.phase] ?? room.phase)
}

/** What a refused host action says, wherever it was pressed. */
export function roomActionErrorMessage(cause: unknown) {
  return cause instanceof Error && cause.message.includes("ROOM_HOST_REQUIRED")
    ? "Only the host can control the room."
    : "The room could not be updated."
}

/** The round outline buttons inside the ring, matching the timer's. */
export const ringIconButtonClass =
  "bg-transparent text-muted-foreground hover:bg-transparent hover:text-foreground dark:border-border dark:bg-transparent dark:hover:bg-transparent"

/**
 * The buttons that move the room on, for its host: Start in 5 seconds while
 * waiting, Start now and Cancel while counting down, Start break in a focus,
 * Start focus in a break, and Next phase whenever the room is running. There
 * is no pause, because rooms have none.
 *
 * `size` is "lg" in the ring and "sm" in the header's dropdown.
 */
export function RoomHostButtons({
  room,
  counting,
  pending,
  onAction,
  size = "lg",
}: {
  room: Room
  counting: boolean
  pending: boolean
  onAction: (action: RoomHostActionClient) => void
  size?: "lg" | "sm"
}) {
  const primary = cn("rounded-full", size === "lg" && "px-5")
  // The ring's see-through outline belongs on the ring's own picture; in a
  // dropdown it read as switched off, so there it is the plain outline.
  const secondary = cn("rounded-full", size === "lg" && ringIconButtonClass)
  return (
    <>
      {room.phase === "focus" ? (
        <Button size={size} className={primary} disabled={pending} onClick={() => onAction("start_break")}>
          Start break
        </Button>
      ) : counting ? (
        <>
          <Button size={size} className={primary} disabled={pending} onClick={() => onAction("start_focus")}>
            Start now
          </Button>
          <Button
            variant="outline"
            size={size}
            className={secondary}
            disabled={pending}
            onClick={() => onAction("cancel_start")}
          >
            Cancel
          </Button>
        </>
      ) : (
        <Button size={size} className={primary} disabled={pending} onClick={() => onAction("start_focus")}>
          {room.phase === "waiting"
            ? `Start in ${START_DELAY_LABELS[room.startDelaySeconds as StartDelay] ?? "5 seconds"}`
            : "Start focus"}
        </Button>
      )}
      {room.phase !== "waiting" ? (
        <Button
          variant="outline"
          size={size}
          className={secondary}
          disabled={pending}
          onClick={() => onAction("next_phase")}
        >
          Next phase
        </Button>
      ) : null}
    </>
  )
}

/** The countdown a host's Start begins, saved the moment it is picked. */
export function RoomCountdownField({
  startDelaySeconds,
  disabled,
  onDelay,
}: {
  startDelaySeconds: number
  disabled: boolean
  onDelay: (seconds: StartDelay) => void
}) {
  const id = React.useId()
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>Countdown before a focus</Label>
      <Select
        value={String(startDelaySeconds)}
        disabled={disabled}
        onValueChange={(value) => onDelay(Number(value) as StartDelay)}
      >
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {START_DELAYS.map((seconds) => (
            <SelectItem key={seconds} value={String(seconds)}>
              {START_DELAY_LABELS[seconds]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
