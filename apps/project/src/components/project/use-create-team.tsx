import * as React from "react"
import { useRouter } from "@tanstack/react-router"

import { TimeZoneSelect } from "@/components/project/time-zone-select"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { createProjectTeam } from "@/lib/api/project/teams"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { browserTimeZone } from "@/lib/project/days"
import { getProjectErrorMessage } from "@/lib/project/errors"
import { LIMITS } from "@/lib/project/rules"
import { showErrorToast } from "@/lib/toast/error-toast"

const subscribeNever = () => () => {}

/**
 * Starts a team: its name and time zone, shared by the "Start a team" card
 * and the picker's New team window. The site admin runs it without being on
 * it, and the team picker moves to it.
 */
export function useCreateTeam(onDone?: () => void) {
  const router = useRouter()
  const [name, setName] = React.useState("")
  const [invalid, setInvalid] = React.useState(false)
  // The server has no visitor's zone, so the box reads UTC there and while the
  // page wakes up, then the browser's own zone. Reading the browser's zone
  // straight away made the server's HTML and the browser's differ (React 418).
  const ownZone = React.useSyncExternalStore(subscribeNever, browserTimeZone, () => "UTC")
  const [pickedZone, setTimeZone] = React.useState<string | null>(null)
  const timeZone = pickedZone ?? ownZone
  const [run, busy] = useAsyncAction(getProjectErrorMessage)

  async function create(event?: React.FormEvent) {
    event?.preventDefault()
    if (!name.trim()) {
      setInvalid(true)
      showErrorToast("Give the team a name.")
      return
    }
    const ok = await run(() => createProjectTeam({ name, timeZone }), "Team created.")
    if (!ok) return
    setName("")
    await router.invalidate()
    onDone?.()
  }

  const fields = (
    <>
      <div className="grid gap-2">
        <Label htmlFor="team-name">Team name</Label>
        <Input
          id="team-name"
          value={name}
          maxLength={LIMITS.teamName}
          aria-invalid={invalid || undefined}
          placeholder="Acme"
          onChange={(event) => {
            setName(event.target.value)
            setInvalid(false)
          }}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="team-time-zone">Time zone</Label>
        <TimeZoneSelect id="team-time-zone" value={timeZone} onChange={setTimeZone} className="sm:w-72" />
      </div>
    </>
  )

  return { fields, create, busy, dirty: Boolean(name.trim()) }
}

