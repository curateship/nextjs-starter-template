import { useRunningFor } from "@/components/video-assets/use-time-so-far"
import { timeSoFar } from "@/lib/video/export-status"

/**
 * How long a paid AI job in a window has been going, counted up while it
 * runs and gone when it ends. It counts rather than predicts: none of these
 * jobs has a measured time, and a wrong estimate is worse than none.
 */
export function TimeSoFar({ running }: { running: boolean }) {
  const ms = useRunningFor(running)
  if (ms === null) return null
  return (
    <span role="status" className="self-center text-sm text-muted-foreground tabular-nums sm:mr-auto">
      {timeSoFar(ms)}
    </span>
  )
}
