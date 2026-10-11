import * as React from "react"
import { useRouter } from "@tanstack/react-router"

import { JoinLinkCard } from "@/components/project/join-link-card"
import { TeamLabelsCard } from "@/components/project/team-labels-card"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { Label as TeamLabel } from "@/lib/api/project/sorting"
import type { JoinLinkState } from "@/lib/api/project/team-running"
import { updateProjectTeam, type TeamSummary } from "@/lib/api/project/teams"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { useSyncedDraft } from "@/lib/hooks/use-synced-draft"
import { getProjectErrorMessage } from "@/lib/project/errors"
import { LIMITS, WEEK_DAYS } from "@/lib/project/rules"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * The team's name, check-in time, time zone, work days and labels, in a window opened
 * from the Team dashboard. Each field saves when it is left or picked, so the
 * window ends with Done. The owner and admins edit; everyone else reads.
 */
export function TeamSettingsDialog({
  team,
  labels,
  joinLink,
  canEdit,
  open,
  onClose,
}: {
  team: TeamSummary
  labels: TeamLabel[]
  /** Null for anyone who doesn't run the team. */
  joinLink: JoinLinkState | null
  canEdit: boolean
  open: boolean
  onClose: () => void
}) {
  // Fields save when they are left, so the one being typed in is left first:
  // Escape or a click outside would otherwise close the window over it.
  function close() {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? null : close())}>
      <DialogContent variant="admin" className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Team settings</DialogTitle>
          <DialogDescription>
            {canEdit
              ? "Changes save as you make them."
              : "Only the team's owner and admins can change these."}
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <TeamSettingsFields team={team} canEdit={canEdit} />
          {joinLink && canEdit ? <JoinLinkCard state={joinLink} /> : null}
          <TeamLabelsCard labels={labels} canEdit={canEdit} />
        </DialogBody>
        <DialogFooter>
          <Button type="button" onClick={close}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function TeamSettingsFields({ team, canEdit }: { team: TeamSummary; canEdit: boolean }) {
  const router = useRouter()
  const [name, setName] = useSyncedDraft(team.name)
  const [checkinTime, setCheckinTime] = useSyncedDraft(team.checkinTime)
  const [nameInvalid, setNameInvalid] = React.useState(false)
  const [run, busy] = useAsyncAction(getProjectErrorMessage)
  const zones = React.useMemo(() => {
    const all =
      typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : []
    return all.includes(team.timeZone) ? all : [team.timeZone, ...all]
  }, [team.timeZone])

  async function save(patch: Parameters<typeof updateProjectTeam>[0]) {
    const ok = await run(() => updateProjectTeam(patch))
    if (ok) await router.invalidate()
  }

  function commitName() {
    const next = name.trim()
    if (next === team.name) return
    if (!next) {
      setNameInvalid(true)
      showErrorToast("The team name can't be empty.")
      return
    }
    void save({ name: next })
  }

  function commitTime() {
    if (checkinTime === team.checkinTime) return
    if (!/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(checkinTime)) {
      setCheckinTime(team.checkinTime)
      showErrorToast("Pick a time like 09:00.")
      return
    }
    void save({ checkinTime })
  }

  function toggleDay(day: number, on: boolean) {
    const next = on ? [...team.workDays, day] : team.workDays.filter((d) => d !== day)
    if (next.length === 0) {
      showErrorToast("Pick at least one work day.")
      return
    }
    void save({ workDays: next })
  }

  return (
    <>
      <Card size="sm">
        <CardHeader>
          <CardTitle>Team</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="team-settings-name">Team name</Label>
            <Input
              id="team-settings-name"
              value={name}
              maxLength={LIMITS.teamName}
              disabled={!canEdit}
              aria-invalid={nameInvalid || undefined}
              onChange={(event) => {
                setName(event.target.value)
                setNameInvalid(false)
              }}
              onBlur={commitName}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur()
              }}
            />
          </div>
        </CardContent>
      </Card>
      <Card size="sm">
        <CardHeader>
          <CardTitle>Check-in schedule</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="team-settings-checkin">Daily check-in time</Label>
              <Input
                id="team-settings-checkin"
                type="time"
                className="w-full sm:w-36"
                value={checkinTime}
                disabled={!canEdit}
                onChange={(event) => setCheckinTime(event.target.value)}
                onBlur={commitTime}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.currentTarget.blur()
                }}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="team-settings-zone">Time zone</Label>
              <Select
                value={team.timeZone}
                onValueChange={(timeZone) => void save({ timeZone })}
                disabled={!canEdit || busy}
              >
                <SelectTrigger id="team-settings-zone" className="w-full sm:w-fit">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {zones.map((zone) => (
                    <SelectItem key={zone} value={zone}>
                      {zone.replaceAll("_", " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <fieldset className="grid gap-2">
            <legend className="mb-2 text-sm font-medium">Work days</legend>
            {WEEK_DAYS.map(({ day, short }) => {
              const id = `team-day-${day}`
              return (
                <div key={day} className="flex items-center gap-2">
                  <Checkbox
                    id={id}
                    checked={team.workDays.includes(day)}
                    disabled={!canEdit || busy}
                    onCheckedChange={(checked) => toggleDay(day, checked === true)}
                  />
                  <Label htmlFor={id} className="font-normal">
                    {short}
                  </Label>
                </div>
              )
            })}
          </fieldset>
        </CardContent>
      </Card>
    </>
  )
}
