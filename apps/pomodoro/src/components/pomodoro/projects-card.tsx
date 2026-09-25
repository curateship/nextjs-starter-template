import * as React from "react"
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  CheckIcon,
  PlusIcon,
  SettingsIcon,
  XIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useProductAuth } from "@/lib/pomodoro/auth-state"
import type { ProjectRow, usePomodoro } from "@/lib/pomodoro/use-pomodoro"

type PomodoroApi = ReturnType<typeof usePomodoro>

/**
 * The project list on the Tasks page: create, rename and archive. A project
 * is what History splits the month's hours by, so this sits under the day's
 * plan rather than in Settings, next to the task rows that pick it.
 *
 * Archiving is not deleting. An archived project drops out of the task row's
 * picker and keeps every hour it earned in History, and bringing it back is
 * the same button the other way round.
 */
export function ProjectsCard({ pomodoro }: { pomodoro: PomodoroApi }) {
  const { authenticated } = useProductAuth()
  const [name, setName] = React.useState("")
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
          className="relative"
          onSubmit={(event) => {
            event.preventDefault()
            void pomodoro.createProject(name)
            setName("")
          }}
        >
          <PlusIcon
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={60}
            placeholder="Add a project, press Enter…"
            aria-label="New project"
            className="pl-9"
          />
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
  return (
    <div className="flex min-h-11 items-center gap-2 rounded-lg border bg-card px-2">
      {renaming ? (
        // Mounted only while renaming, so the field starts from the current
        // name every time without an effect copying the prop into state.
        <ProjectRenameForm
          project={project}
          onCancel={() => onRenamingChange(false)}
          onSave={(name) => {
            void pomodoro.renameProject(project.id, name)
            onRenamingChange(false)
          }}
        />
      ) : (
        <>
          <span className="flex-1 truncate px-1 text-sm">{project.name}</span>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onRenamingChange(true)}
            aria-label={`Rename ${project.name}`}
          >
            <SettingsIcon aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => void pomodoro.setProjectArchived(project.id, true)}
            aria-label={`Archive ${project.name}`}
          >
            <ArchiveIcon aria-hidden="true" />
          </Button>
        </>
      )}
    </div>
  )
}

function ProjectRenameForm({
  project,
  onSave,
  onCancel,
}: {
  project: ProjectRow
  onSave: (name: string) => void
  onCancel: () => void
}) {
  const [name, setName] = React.useState(project.name)
  const nameValid = Boolean(name.trim())

  return (
    <form
      className="flex flex-1 items-center gap-2 py-1.5"
      onSubmit={(event) => {
        event.preventDefault()
        if (!nameValid) return
        onSave(name)
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") onCancel()
      }}
    >
      <Input
        required
        maxLength={60}
        value={name}
        onChange={(event) => setName(event.target.value)}
        aria-label={`Name for ${project.name}`}
        autoFocus
        className="flex-1"
      />
      <Button
        type="submit"
        variant="ghost"
        size="icon-sm"
        disabled={!nameValid}
        aria-label={`Save the new name for ${project.name}`}
      >
        <CheckIcon aria-hidden="true" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={onCancel}
        aria-label={`Cancel renaming ${project.name}`}
      >
        <XIcon aria-hidden="true" />
      </Button>
    </form>
  )
}
