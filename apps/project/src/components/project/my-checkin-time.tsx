import * as React from "react"
import { useRouter } from "@tanstack/react-router"

import { SaveLine } from "@/components/project/save-line"
import { TimeZoneSelect } from "@/components/project/time-zone-select"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { saveMyCheckinTime, type CheckinClock } from "@/lib/api/project/checkins"
import { useSyncedDraft } from "@/lib/hooks/use-synced-draft"
import { clockLabel } from "@/lib/project/days"
import { useSaveLine } from "@/lib/project/use-save-line"
import { showErrorToast } from "@/lib/toast/error-toast"

const TEAM_ZONE = "team"

/**
 * A person's own check-in time and time zone, shifting the team's to suit
 * their hours, on the left of My dashboard. Each field saves when it is left or picked. There is no Save
 * button. Left alone, both follow the team's.
 */
export function MyCheckinTime({ clock }: { clock: CheckinClock }) {
  const router = useRouter()
  const [saveState, track] = useSaveLine()
  const busy = saveState === "saving"
  const [time, setTime] = useSyncedDraft(clock.time)
  const [timeInvalid, setTimeInvalid] = React.useState(false)
  const pinned = React.useMemo(
    () => [{ value: TEAM_ZONE, label: `The team's (${clock.teamZone.replaceAll("_", " ")})` }],
    [clock.teamZone]
  )

  async function save(patch: Parameters<typeof saveMyCheckinTime>[0]) {
    const ok = await track(() => saveMyCheckinTime(patch))
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
    // Its name is the card around it in My settings, so only the save sign is here.
    <section className="grid gap-4" aria-label="My check-in time">
      <SaveLine state={saveState} className="justify-self-end empty:hidden" />
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
            <TimeZoneSelect
              id="my-checkin-zone"
              value={clock.ownZone ?? TEAM_ZONE}
              pinned={pinned}
              teamZone={clock.teamZone}
              disabled={busy}
              onChange={(value) => void save({ timeZone: value === TEAM_ZONE ? null : value })}
            />
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
