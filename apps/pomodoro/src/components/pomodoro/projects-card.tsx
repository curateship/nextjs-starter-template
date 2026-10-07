import * as React from "react"
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  GlobeIcon,
  Loader2Icon,
  LockIcon,
  PlusIcon,
} from "lucide-react"

import { SettingsWindow } from "@/components/pomodoro/settings-window"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { InlineError } from "@/components/ui/inline-error"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Meter } from "@/components/ui/meter"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useProductAuth } from "@/lib/pomodoro/auth-state"
import {
  TARGET_HOURS_MAX,
  targetPeriodLabels,
  targetPeriods,
  targetProgressLabel,
  type ProjectTarget,
  type TargetPeriod,
} from "@/lib/pomodoro/project-targets"
import type {
  ProjectRow,
  ProjectTargetProgress,
  usePomodoro,
} from "@/lib/pomodoro/use-pomodoro"

type PomodoroApi = ReturnType<typeof usePomodoro>

/**
 * The project list on the Tasks page: create, rename and archive. A project
 * is what History splits the month's hours by, so this sits under the day's
 * plan rather than in Settings, next to the task rows that pick it.
 *
 * Archiving is not deleting. An archived project drops out of the task row's
 * picker and keeps every hour it earned in History, and bringing it back is
 * the same button the other way round.
 *
 * A project may carry an hours target for each week or each month, set in
 * its edit row. A bar under the row then reads "4h of 10h this week".
 *
 * The globe button is what lets a project's name and hours appear on a
 * public profile. Every project starts private and only a press here changes
 * that, because a project name is often a client's name and publishing one
 * by accident is the kind of mistake that loses somebody work.
 */
export function ProjectsCard({ pomodoro }: { pomodoro: PomodoroApi }) {
  const { authenticated } = useProductAuth()
  const [name, setName] = React.useState("")
  // A refusal about the name, shown under the box it was typed in. The box
  // keeps the name until the server has accepted it.
  const [nameProblem, setNameProblem] = React.useState("")
  const [creating, setCreating] = React.useState(false)
  const [renamingId, setRenamingId] = React.useState<string | null>(null)
  const live = pomodoro.projects.filter((project) => !project.archivedAt)
  const archived = pomodoro.projects.filter((project) => project.archivedAt)

  if (!authenticated) return null

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Projects</CardTitle>
        <span className="text-xs text-muted-foreground">
          {live.length} {live.length === 1 ? "project" : "projects"}
        </span>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {!pomodoro.projects.length ? (
          <p className="text-sm text-muted-foreground">
            Put tasks in a project and History tells you where the month went.
          </p>
        ) : null}
        {live.map((project) => (
          <ProjectRowItem
            key={project.id}
            project={project}
            pomodoro={pomodoro}
            renaming={renamingId === project.id}
            onRenamingChange={(renaming) =>
              setRenamingId(renaming ? project.id : null)
            }
          />
        ))}
        <form
          className="flex flex-col gap-2"
          onSubmit={async (event) => {
            event.preventDefault()
            if (creating) return
            setCreating(true)
            const submitted = name
            const result = await pomodoro.createProject(submitted)
            setCreating(false)
            if (!result.created) {
              setNameProblem(result.nameProblem ?? "")
              return
            }
            // Anything typed while the request was out is a new name, not
            // the one just saved, so only the saved one is cleared.
            setName((current) => (current === submitted ? "" : current))
            setNameProblem("")
          }}
        >
          <div className="relative">
            <PlusIcon
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              value={name}
              onChange={(event) => {
                setName(event.target.value)
                setNameProblem("")
              }}
              maxLength={60}
              placeholder="Add a project, press Enter…"
              aria-label="New project"
              aria-invalid={nameProblem ? true : undefined}
              aria-describedby={nameProblem ? "new-project-problem" : undefined}
              className="pl-9"
            />
            {creating ? (
              <Loader2Icon
                aria-label="Creating the project"
                className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground"
              />
            ) : null}
          </div>
          {nameProblem ? (
            <InlineError id="new-project-problem">{nameProblem}</InlineError>
          ) : null}
        </form>
        {archived.length ? (
          <section className="flex flex-col gap-1.5">
            <h3 className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Archived
            </h3>
            {archived.map((project) => (
              <div
                key={project.id}
                className="flex min-h-10 items-center gap-3 rounded-lg border bg-card/50 px-3"
              >
                <span className="flex-1 truncate text-sm text-muted-foreground">
                  {project.name}
                </span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() =>
                    void pomodoro.setProjectArchived(project.id, false)
                  }
                  aria-label={`Bring ${project.name} back`}
                >
                  <ArchiveRestoreIcon aria-hidden="true" />
                </Button>
              </div>
            ))}
          </section>
        ) : null}
      </CardContent>
    </Card>
  )
}

function ProjectRowItem({
  project,
  pomodoro,
  renaming,
  onRenamingChange,
}: {
  project: ProjectRow
  pomodoro: PomodoroApi
  renaming: boolean
  onRenamingChange: (renaming: boolean) => void
}) {
  const progress = pomodoro.projectTargets.find(
    (entry) => entry.projectId === project.id
  )
  return (
    <div className="flex flex-col rounded-lg border bg-card">
      <div className="flex min-h-9 items-center gap-2 px-2">
        <span className="flex-1 truncate px-1 text-sm">{project.name}</span>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() =>
            void pomodoro.setProjectPublic(project.id, !project.isPublic)
          }
          // The state is in the icon and in the name of the button, never
          // in colour alone.
          aria-pressed={project.isPublic}
          aria-label={
            project.isPublic
              ? `Stop showing ${project.name} on your public profile`
              : `Show ${project.name} on your public profile`
          }
          title={
            project.isPublic ? "On your public profile" : "Private to you"
          }
        >
          {project.isPublic ? (
            <GlobeIcon aria-hidden="true" />
          ) : (
            <LockIcon aria-hidden="true" className="text-muted-foreground" />
          )}
        </Button>
        <SettingsWindow
          label={`Edit ${project.name}`}
          open={renaming}
          onOpenChange={onRenamingChange}
        >
          {/* Mounted only while the window is open, so the fields start from
              the saved values every time without an effect copying them. */}
          <ProjectRenameForm
            project={project}
            onCancel={() => onRenamingChange(false)}
            onSave={async (name, target) => {
              if (await pomodoro.renameProject(project.id, name, target))
                onRenamingChange(false)
            }}
          />
        </SettingsWindow>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => void pomodoro.setProjectArchived(project.id, true)}
          aria-label={`Archive ${project.name}`}
        >
          <ArchiveIcon aria-hidden="true" />
        </Button>
      </div>
      {progress ? (
        <TargetBar projectName={project.name} progress={progress} />
      ) : null}
    </div>
  )
}

/**
 * "4h of 10h this week" over a bar. Past the target the bar stays full and
 * the words carry the rest, so 12h of 10h reads as 12h rather than as a bar
 * that overflows its box.
 */
export function TargetBar({
  projectName,
  progress,
}: {
  projectName: string
  progress: ProjectTargetProgress
}) {
  const label = targetProgressLabel(
    progress.focusSeconds,
    progress.targetHours,
    progress.targetPeriod
  )
  return (
    <div className="flex flex-col gap-1 px-3 pb-2">
      <small className="font-mono text-[10px] text-muted-foreground">
        {label}
      </small>
      <Meter
        size="sm"
        label={`${projectName} against its target`}
        value={progress.focusSeconds}
        max={progress.targetHours * 3_600}
        valueText={label}
      />
    </div>
  )
}

/**
 * The project's editor, inside the window its settings button opens: the
 * name, and under it the hours target. A blank hours box is
 * no target, and the period only counts once there are hours to go with it,
 * so a project can never be saved with half a target.
 */
function ProjectRenameForm({
  project,
  onSave,
  onCancel,
}: {
  project: ProjectRow
  onSave: (name: string, target: ProjectTarget | null) => Promise<void>
  onCancel: () => void
}) {
  const id = React.useId()
  const [name, setName] = React.useState(project.name)
  const [hours, setHours] = React.useState(
    project.targetHours === null ? "" : String(project.targetHours)
  )
  const [period, setPeriod] = React.useState<TargetPeriod>(
    project.targetPeriod ?? "week"
  )
  const [saving, setSaving] = React.useState(false)
  const nameValid = Boolean(name.trim())
  const parsedHours = hours.trim() === "" ? null : Number(hours)
  const hoursValid =
    parsedHours === null ||
    (Number.isInteger(parsedHours) &&
      parsedHours >= 1 &&
      parsedHours <= TARGET_HOURS_MAX)

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={async (event) => {
        event.preventDefault()
        if (saving || !nameValid || !hoursValid) return
        setSaving(true)
        await onSave(
          name,
          parsedHours === null ? null : { hours: parsedHours, period }
        )
        // A successful save closes the window and unmounts this form; a
        // failed one keeps the typed values for another press.
        setSaving(false)
      }}
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-name`}>Name</Label>
        <Input
          id={`${id}-name`}
          required
          maxLength={60}
          value={name}
          onChange={(event) => setName(event.target.value)}
          aria-invalid={!nameValid || undefined}
          autoFocus
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-hours`}>Target hours</Label>
        <div className="flex items-center gap-2">
          <Input
            id={`${id}-hours`}
            type="number"
            min={1}
            max={TARGET_HOURS_MAX}
            step={1}
            value={hours}
            placeholder="None"
            onChange={(event) => setHours(event.target.value)}
            aria-invalid={!hoursValid || undefined}
            className="w-20"
          />
          <Select
            value={period}
            onValueChange={(value) => setPeriod(value as TargetPeriod)}
            disabled={parsedHours === null}
          >
            <SelectTrigger
              className="text-xs"
              aria-label={`How often ${project.name}'s target resets`}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {targetPeriods.map((value) => (
                <SelectItem key={value} value={value}>
                  {targetPeriodLabels[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {hoursValid ? (
          <small className="text-xs text-muted-foreground">
            Leave it blank for no target.
          </small>
        ) : (
          <small role="alert" className="text-xs text-destructive">
            A whole number of hours from 1 to {TARGET_HOURS_MAX}.
          </small>
        )}
      </div>
      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="submit"
          size="sm"
          disabled={saving || !nameValid || !hoursValid}
          aria-label={`Save changes to ${project.name}`}
        >
          {saving ? (
            <Loader2Icon className="animate-spin" aria-hidden="true" />
          ) : null}
          Save changes
        </Button>
      </div>
    </form>
  )
}
