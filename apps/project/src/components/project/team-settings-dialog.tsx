import * as React from "react"
import { useRouter } from "@tanstack/react-router"

import { JoinLinkCard } from "@/components/project/join-link-card"
import {
  CheckinQuestionsCard,
  HolidaysCard,
  StarterTasksCard,
} from "@/components/project/team-checkin-settings"
import { SaveLine } from "@/components/project/save-line"
import { TimeZoneSelect } from "@/components/project/time-zone-select"
import { TeamLabelsCard } from "@/components/project/team-labels-card"
import { TeamStepListsCard } from "@/components/project/team-step-lists-card"
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
import type { Label as TeamLabel } from "@/lib/api/project/sorting"
import type { StepList } from "@/lib/api/project/planning"
import type { Holiday, JoinLinkState } from "@/lib/api/project/team-running"
import { updateProjectTeam, type TeamSummary } from "@/lib/api/project/teams"
import { useSyncedDraft } from "@/lib/hooks/use-synced-draft"
import { LIMITS, WEEK_DAYS } from "@/lib/project/rules"
import { useSaveLine } from "@/lib/project/use-save-line"
import { showErrorToast } from "@/lib/toast/error-toast"
import { useTeamId } from "@/lib/project/team-scope"

/**
 * The team's name, check-in time, time zone, work days, check-in boxes,
 * holidays, starter tasks, labels and step lists, in a window opened from the Team
 * dashboard. Each field saves when it is left or picked, so the window ends
 * with Done. The owner and admins edit; everyone else reads.
 */
export function TeamSettingsDialog({
  team,
  labels,
  stepLists,
  joinLink,
  holidays,
  canEdit,
  open,
  onClose,
}: {
  team: TeamSummary
  labels: TeamLabel[]
  stepLists: StepList[]
  holidays: Holiday[]
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
  const [saveState, track] = useSaveLine()

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? null : close())}>
      <DialogContent variant="admin" className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Team settings</DialogTitle>
          <DialogDescription className="flex items-center justify-between gap-2">
            {canEdit
              ? "Changes save as you make them."
              : "Only the team's owner and admins can change these."}
            <SaveLine state={saveState} />
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <TeamSettingsFields team={team} canEdit={canEdit} track={track} busy={saveState === "saving"} />
          <CheckinQuestionsCard team={team} canEdit={canEdit} track={track} />
          <HolidaysCard holidays={holidays} canEdit={canEdit} />
          {canEdit ? <StarterTasksCard team={team} track={track} /> : null}
          {joinLink && canEdit ? <JoinLinkCard state={joinLink} /> : null}
          <TeamLabelsCard labels={labels} canEdit={canEdit} />
          <TeamStepListsCard lists={stepLists} canEdit={canEdit} />
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

function TeamSettingsFields({
  team,
  canEdit,
  track,
  busy,
}: {
  team: TeamSummary
  canEdit: boolean
  /** Runs a save and shows Saving…, Saved or Not saved at the top of the window. */
  track: (work: () => Promise<unknown>) => Promise<boolean>
  busy: boolean
}) {
  const teamId = useTeamId()
  const router = useRouter()
  const [name, setName] = useSyncedDraft(team.name)
  const [checkinTime, setCheckinTime] = useSyncedDraft(team.checkinTime)
  const [nameInvalid, setNameInvalid] = React.useState(false)
  const [timeInvalid, setTimeInvalid] = React.useState(false)

  async function save(patch: Parameters<typeof updateProjectTeam>[0]) {
    const ok = await track(() => updateProjectTeam(patch, teamId))
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
      setTimeInvalid(true)
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
                aria-invalid={timeInvalid || undefined}
                onChange={(event) => {
                  setCheckinTime(event.target.value)
                  setTimeInvalid(false)
                }}
                onBlur={commitTime}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.currentTarget.blur()
                }}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="team-settings-zone">Time zone</Label>
              <TimeZoneSelect
                id="team-settings-zone"
                value={team.timeZone}
                disabled={!canEdit || busy}
                className="sm:w-fit sm:max-w-full"
                onChange={(timeZone) => void save({ timeZone })}
              />
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
