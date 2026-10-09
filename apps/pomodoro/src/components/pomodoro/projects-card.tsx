import * as React from "react"
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  GlobeIcon,
  Loader2Icon,
  LockIcon,
  PlusIcon,
} from "lucide-react"

import { PanelCard } from "@/components/pomodoro/panel-card"
import { SettingsWindow } from "@/components/pomodoro/settings-window"
import { Button } from "@/components/ui/button"
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
import { formatFocusDuration } from "@/lib/pomodoro/focus-history"
import { projectInitial, projectToneIndex } from "@/lib/pomodoro/project-initial"
import { cn } from "@/lib/utils"
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

  const [showArchived, setShowArchived] = React.useState(false)

  if (!authenticated) return null

  return (
    <PanelCard
      label={`Projects · ${live.length}`}
      aside={
        archived.length ? (
          <Button
            variant="outline"
            size="sm"
            className="rounded-full"
            aria-expanded={showArchived}
            onClick={() => setShowArchived((open) => !open)}
          >
            Archived · {archived.length}
          </Button>
        ) : null
      }
    >
      {!pomodoro.projects.length ? (
        <p className="text-sm text-muted-foreground">
          Put tasks in a project and History tells you where the month went.
        </p>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {live.map((project) => (
          <ProjectTile
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
          className="flex min-h-36 flex-col gap-3 rounded-[18px] border-2 border-dashed border-[rgba(var(--p-fg-rgb),0.14)] p-5"
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
            setName((current) => (current === submitted ? "" : current))
            setNameProblem("")
          }}
        >
          <Label
            htmlFor="new-project-name"
            className="flex items-center gap-2 text-base font-semibold"
          >
            <PlusIcon className="size-4" aria-hidden="true" />
            New project
          </Label>
          <div className="relative">
            <Input
              id="new-project-name"
              value={name}
              onChange={(event) => {
                setName(event.target.value)
                setNameProblem("")
              }}
              maxLength={60}
              placeholder="Name it, press Enter"
              aria-invalid={nameProblem ? true : undefined}
              aria-describedby={nameProblem ? "new-project-problem" : undefined}
              className="h-10"
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
      </div>
      {showArchived && archived.length ? (
        <section className="flex flex-col gap-3 border-t pt-5">
          <h4 className="font-mono text-[11px] font-normal uppercase tracking-[0.2em] text-muted-foreground">
            Archived
          </h4>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {archived.map((project) => (
              <div
                key={project.id}
                className="flex items-center gap-3 rounded-[18px] border p-4 text-muted-foreground"
              >
                <ProjectInitial name={project.name} muted />
                <span className="flex-1 truncate">{project.name}</span>
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
          </div>
        </section>
      ) : null}
    </PanelCard>
  )
}

/** The coloured square on a project card, in the Pomoder palette. */
const INITIAL_TONES = [
  "bg-sky-400/15 text-sky-300",
  "bg-amber-400/15 text-amber-300",
  "bg-emerald-400/15 text-emerald-300",
  "bg-violet-400/15 text-violet-300",
  "bg-[color:var(--p-accent)]/15 text-[var(--p-accent)]",
]

function ProjectInitial({ name, muted }: { name: string; muted?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid size-10 shrink-0 place-items-center rounded-xl text-lg font-bold",
        muted ? "bg-muted text-muted-foreground" : INITIAL_TONES[projectToneIndex(name)]
      )}
    >
      {projectInitial(name)}
    </span>
  )
}

/**
 * One live project as a card: its initial and name, the public switch, the
 * edit window and Archive along the top, and its tasks and hours along the
 * foot, with the target bar when it has one.
 */
function ProjectTile({
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
    <article
      aria-label={project.name}
      className="flex min-h-36 flex-col gap-4 rounded-[18px] border bg-[rgba(var(--p-canvas-rgb),0.35)] p-5"
    >
      <div className="flex items-center gap-3">
        <ProjectInitial name={project.name} />
        <strong className="min-w-0 flex-1 truncate text-lg">
          {project.name}
        </strong>
        <div className="flex shrink-0 items-center">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() =>
              void pomodoro.setProjectPublic(project.id, !project.isPublic)
            }
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
            {/* Mounted only while the window is open, so the fields start
                from the saved values every time without an effect copying
                them. */}
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
      </div>
      <div className="mt-auto flex flex-col gap-2">
        {progress ? (
          <TargetBar projectName={project.name} progress={progress} />
        ) : null}
        <small className="font-mono text-xs text-muted-foreground">
          {project.taskCount} {project.taskCount === 1 ? "task" : "tasks"} ·{" "}
          {formatFocusDuration(project.focusSeconds)} focused
        </small>
      </div>
    </article>
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
    <div className="flex flex-col gap-1">
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
