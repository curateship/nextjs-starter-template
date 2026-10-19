import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import { Loader2Icon } from "lucide-react"

import { ProjectColorSelect } from "@/components/project/project-form-fields"
import { ProjectDot } from "@/components/project/task-bits"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ErrorRow } from "@/components/ui/error-row"
import { FieldLabel } from "@/components/ui/field-label"
import { FormDialog } from "@/components/ui/form-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { LoadingRow } from "@/components/ui/loading-row"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { createNewProject, loadTemplates, type TemplateRow } from "@/lib/api/project/projects"
import { taskCount } from "@/lib/project/templates"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { getProjectErrorMessage } from "@/lib/project/errors"
import { LIMITS, type ProjectColor } from "@/lib/project/rules"
import { showErrorToast } from "@/lib/toast/error-toast"

const EMPTY = "empty"

type TemplatesState =
  | { state: "loading" }
  | { state: "error"; error: string; retry: () => void }
  | { state: "ready"; rows: TemplateRow[] }

/**
 * The team's templates, read each time the window opens so a new one shows at
 * once. The site admin's are the picked team's, so nothing loads until one is.
 */
function useTemplates(open: boolean, needsTeam: boolean, teamId: string): TemplatesState {
  // Kept with the team they belong to, so another team's never show while its own load.
  const [loaded, setLoaded] = React.useState<{ teamId: string; rows: TemplateRow[] } | null>(null)
  const [error, setError] = React.useState("")
  const [tries, setTries] = React.useState(0)
  React.useEffect(() => {
    if (!open || (needsTeam && !teamId)) return
    let live = true
    loadTemplates(teamId || undefined).then(
      (next) => {
        if (!live) return
        setLoaded({ teamId, rows: next })
        setError("")
      },
      (failure: unknown) => {
        if (live) setError(getProjectErrorMessage(failure))
      }
    )
    return () => {
      live = false
    }
  }, [open, tries, needsTeam, teamId])
  if (error) {
    const retry = () => {
      setError("")
      setTries((n) => n + 1)
    }
    return { state: "error", error, retry }
  }
  if (needsTeam && !teamId) return { state: "ready", rows: [] }
  if (!loaded || loaded.teamId !== teamId) return { state: "loading" }
  return { state: "ready", rows: loaded.rows }
}

/**
 * `teams` is every team, for the site admin, who picks which one the project
 * is in (Tyler, 19 Oct 2026); it starts on `startTeamId`, or on the only team.
 * Anyone else has one team and no choice, so they get an empty list.
 */
export function NewProjectDialog({
  open,
  onClose,
  teams = [],
  startTeamId = null,
}: {
  open: boolean
  onClose: () => void
  teams?: { id: string; name: string }[]
  startTeamId?: string | null
}) {
  const navigate = useNavigate()
  const [name, setName] = React.useState("")
  const [color, setColor] = React.useState<ProjectColor>("blue")
  const [description, setDescription] = React.useState("")
  const [templateId, setTemplateId] = React.useState(EMPTY)
  const firstTeam = startTeamId ?? (teams.length === 1 ? teams[0].id : "")
  const [teamId, setTeamId] = React.useState(firstTeam)
  // Each opening starts on the filter's team, which may have changed since.
  const [openedOn, setOpenedOn] = React.useState(firstTeam)
  if (open && openedOn !== firstTeam) {
    setOpenedOn(firstTeam)
    setTeamId(firstTeam)
  }
  const [invalid, setInvalid] = React.useState(false)
  const [teamInvalid, setTeamInvalid] = React.useState(false)
  const [run, saving] = useAsyncAction(getProjectErrorMessage)
  const needsTeam = teams.length > 0
  const templates = useTemplates(open, needsTeam, teamId)
  const template = templates.state === "ready" ? templates.rows.find((row) => row.id === templateId) : undefined
  const dirty = Boolean(name.trim() || description.trim() || templateId !== EMPTY)

  function close() {
    setName("")
    setColor("blue")
    setDescription("")
    setTemplateId(EMPTY)
    setTeamId(firstTeam)
    setInvalid(false)
    setTeamInvalid(false)
    onClose()
  }

  async function create() {
    if (needsTeam && !teamId) {
      setTeamInvalid(true)
      showErrorToast("Pick the team the project is in.")
      return
    }
    if (!name.trim()) {
      setInvalid(true)
      showErrorToast("Give the project a name.")
      return
    }
    let projectId = ""
    const ok = await run(async () => {
      projectId = (
        await createNewProject(
          { name, color, description, templateId: template ? template.id : null },
          teamId || undefined
        )
      ).id
    }, "Project created.")
    if (!ok) return
    close()
    await navigate({ to: "/projects/$projectId", params: { projectId } })
  }

  return (
    <FormDialog open={open} dirty={dirty} busy={saving} onClose={close}>
      {(requestClose) => (
        <DialogContent variant="admin" className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New project</DialogTitle>
            <DialogDescription>
              You'll be the project's first member. Add teammates from its settings.
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(event) => {
              event.preventDefault()
              void create()
            }}
          >
            <DialogBody>
              <Card size="sm">
                <CardHeader>
                  <CardTitle>Project</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4">
                  {needsTeam ? (
                    <div className="grid gap-2">
                      <Label htmlFor="new-project-team">Team</Label>
                      <Select
                        value={teamId}
                        onValueChange={(next) => {
                          setTeamId(next)
                          setTeamInvalid(false)
                          // Templates are a team's own, so a pick from another team goes.
                          setTemplateId(EMPTY)
                        }}
                      >
                        <SelectTrigger
                          id="new-project-team"
                          className="w-full sm:w-fit"
                          aria-invalid={teamInvalid || undefined}
                        >
                          <SelectValue placeholder="Pick a team" />
                        </SelectTrigger>
                        <SelectContent>
                          {teams.map((team) => (
                            <SelectItem key={team.id} value={team.id}>
                              {team.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : null}
                  <div className="grid gap-2">
                    <FieldLabel
                      htmlFor="new-project-template"
                      hint="A template brings its colour, description, sections, milestones and tasks. Every task starts To do, with nobody assigned and no dates."
                    >
                      Start from
                    </FieldLabel>
                    {templates.state === "loading" ? (
                      <LoadingRow label="Loading templates…" />
                    ) : templates.state === "error" ? (
                      <ErrorRow message={templates.error} onRetry={templates.retry} />
                    ) : (
                      <Select value={templateId} onValueChange={setTemplateId}>
                        <SelectTrigger id="new-project-template" className="w-full sm:w-fit">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={EMPTY}>An empty project</SelectItem>
                          {templates.rows.map((row) => (
                            <SelectItem key={row.id} value={row.id}>
                              <ProjectDot color={row.color} />
                              {row.name} · {taskCount(row)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    {templates.state === "ready" && templates.rows.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        {needsTeam && !teamId
                          ? "Pick a team to see its templates."
                          : "No templates yet. Save one from any project's settings."}
                      </p>
                    ) : null}
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="new-project-name">Name</Label>
                    <Input
                      id="new-project-name"
                      value={name}
                      maxLength={LIMITS.projectName}
                      aria-invalid={invalid || undefined}
                      onChange={(event) => {
                        setName(event.target.value)
                        setInvalid(false)
                      }}
                    />
                  </div>
                  {template ? null : (
                    <>
                      <div className="grid gap-2">
                        <Label htmlFor="new-project-color">Colour</Label>
                        <ProjectColorSelect id="new-project-color" value={color} onChange={setColor} />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="new-project-description">Description</Label>
                        <Textarea
                          id="new-project-description"
                          value={description}
                          maxLength={LIMITS.projectDescription}
                          onChange={(event) => setDescription(event.target.value)}
                        />
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={requestClose} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? <Loader2Icon className="size-4 animate-spin" /> : null}
                Create project
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      )}
    </FormDialog>
  )
}
