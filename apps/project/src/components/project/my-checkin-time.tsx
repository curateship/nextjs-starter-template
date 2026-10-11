import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import { ClockIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { saveMyCheckinTime, type CheckinClock } from "@/lib/api/project/checkins"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { useSyncedDraft } from "@/lib/hooks/use-synced-draft"
import { clockLabel } from "@/lib/project/days"
import { getProjectErrorMessage } from "@/lib/project/errors"
import { showErrorToast } from "@/lib/toast/error-toast"

const TEAM_ZONE = "team"

/**
 * A person's own check-in time and time zone, shifting the team's to suit
 * their hours, on the left of My dashboard. Each field saves when it is left or picked. There is no Save
 * button. Left alone, both follow the team's.
 */
export function MyCheckinTime({ clock }: { clock: CheckinClock }) {
  const router = useRouter()
  const [run, busy] = useAsyncAction(getProjectErrorMessage)
  const [time, setTime] = useSyncedDraft(clock.time)
  const [timeInvalid, setTimeInvalid] = React.useState(false)
  const zones = React.useMemo(() => {
    const all =
      typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : []
    return clock.ownZone && !all.includes(clock.ownZone) ? [clock.ownZone, ...all] : all
  }, [clock.ownZone])

  async function save(patch: Parameters<typeof saveMyCheckinTime>[0]) {
    const ok = await run(() => saveMyCheckinTime(patch))
    if (ok) await router.invalidate()
  }

  function commitTime() {
    if (time === clock.time) return
    if (!/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(time)) {
      setTimeInvalid(true)
      showErrorToast("Pick a time like 09:00.")
      return
    }
    // Picking the team's own time goes back to following the team.
    void save({ checkinTime: time === clock.teamTime ? null : time })
  }

  const following = !clock.ownTime && !clock.ownZone

  return (
    <section className="grid gap-4" aria-labelledby="my-checkin-time-heading">
      <h3 id="my-checkin-time-heading" className="flex items-center gap-2 text-sm font-medium">
        <ClockIcon className="size-4 text-muted-foreground" aria-hidden />
        My check-in time
      </h3>
      <div className="grid gap-4">
        <p className="text-sm text-muted-foreground">
          The team checks in at {clockLabel(clock.teamTime)}, {clock.teamZone.replaceAll("_", " ")}{" "}
          time. Shift it here if your hours are different. The reminder in the bell follows
          yours.
        </p>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="my-checkin-time">My check-in time</Label>
            <Input
              id="my-checkin-time"
              type="time"
              className="w-36"
              value={time}
              aria-invalid={timeInvalid || undefined}
              onChange={(event) => {
                setTime(event.target.value)
                setTimeInvalid(false)
              }}
              onBlur={commitTime}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur()
              }}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="my-checkin-zone">My time zone</Label>
            <Select
              value={clock.ownZone ?? TEAM_ZONE}
              disabled={busy}
              onValueChange={(value) => void save({ timeZone: value === TEAM_ZONE ? null : value })}
            >
              <SelectTrigger id="my-checkin-zone" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TEAM_ZONE}>
                  The team's ({clock.teamZone.replaceAll("_", " ")})
                </SelectItem>
                {zones.map((zone) => (
                  <SelectItem key={zone} value={zone}>
                    {zone.replaceAll("_", " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        {following ? null : (
          <div>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => void save({ checkinTime: null, timeZone: null })}
            >
              Use the team's time
            </Button>
          </div>
        )}
      </div>
    </section>
  )
}
