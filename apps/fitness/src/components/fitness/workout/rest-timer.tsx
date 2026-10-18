import * as React from "react"
import { TimerIcon } from "lucide-react"

import { Button } from "@/components/ui/button"

export type RestTimerState = { endsAt: number; seconds: number; exerciseName: string } | null

/**
 * The rest countdown that starts when a set is ticked. It is a bar pinned to
 * the foot of the middle panel, where a thumb reaches it, with +30s and Skip. At zero the phone
 * buzzes and beeps once where the browser allows it, and the bar says rest is
 * over until it is dismissed or the next set starts a new one.
 */
export function RestTimer({
  timer,
  onAdd,
  onSkip,
}: {
  timer: RestTimerState
  onAdd: (seconds: number) => void
  onSkip: () => void
}) {
  const [now, setNow] = React.useState(() => Date.now())
  const announced = React.useRef<number | null>(null)

  React.useEffect(() => {
    if (!timer) return
    const tick = window.setInterval(() => {
      const at = Date.now()
      setNow(at)
      if (at >= timer.endsAt && announced.current !== timer.endsAt) {
        announced.current = timer.endsAt
        signalRestOver()
      }
    }, 250)
    return () => window.clearInterval(tick)
  }, [timer])

  if (!timer) return null
  const left = Math.max(0, Math.ceil((timer.endsAt - now) / 1000))
  const over = left === 0
  const share = timer.seconds > 0 ? Math.min(1, left / timer.seconds) : 0

  return (
    <div className="grid shrink-0 gap-2 border-t bg-background px-3 py-2">
      <div className="flex items-center gap-3">
        <TimerIcon className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <div className="min-w-0 flex-1" role="timer" aria-live="off">
          <p className="truncate text-xs text-muted-foreground">Rest after {timer.exerciseName}</p>
          <p className="text-lg font-semibold tabular-nums">{over ? "Rest over" : formatClock(left)}</p>
        </div>
        <Button type="button" variant="outline" onClick={() => onAdd(30)}>
          +30s
        </Button>
        <Button type="button" variant={over ? "default" : "ghost"} onClick={onSkip}>
          {over ? "Done" : "Skip"}
        </Button>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
        <div
          className="h-full bg-primary motion-safe:transition-[width] motion-safe:duration-200"
          style={{ width: `${share * 100}%` }}
        />
      </div>
      <span className="sr-only" aria-live="polite">
        {over ? "Rest over" : ""}
      </span>
    </div>
  )
}

function formatClock(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`
}

/** A buzz and a short beep, each only where the browser lets a page do it. */
function signalRestOver() {
  try {
    navigator.vibrate?.([200, 100, 200])
  } catch {
    // Not every browser lets a page buzz the phone.
  }
  try {
    const AudioContextClass =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioContextClass) return
    const context = new AudioContextClass()
    const tone = context.createOscillator()
    const volume = context.createGain()
    tone.frequency.value = 880
    volume.gain.value = 0.15
    tone.connect(volume)
    volume.connect(context.destination)
    tone.start()
    tone.stop(context.currentTime + 0.25)
    tone.onended = () => void context.close()
  } catch {
    // A browser that blocks sound before a tap simply stays quiet.
  }
}
