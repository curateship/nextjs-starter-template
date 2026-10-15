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

/** The team's templates, read each time the window opens so a new one shows at once. */
function useTemplates(open: boolean): TemplatesState {
  const [rows, setRows] = React.useState<TemplateRow[] | null>(null)
  const [error, setError] = React.useState("")
  const [tries, setTries] = React.useState(0)
  React.useEffect(() => {
    if (!open) return
    let live = true
    loadTemplates().then(
      (next) => {
        if (!live) return
        setRows(next)
        setError("")
      },
      (failure: unknown) => {
        if (live) setError(getProjectErrorMessage(failure))
      }
    )
    return () => {
      live = false
    }
  }, [open, tries])
  if (error) {
    const retry = () => {
      setError("")
      setTries((n) => n + 1)
    }
    return { state: "error", error, retry }
  }
  if (!rows) return { state: "loading" }
  return { state: "ready", rows }
}

export function NewProjectDialog({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const navigate = useNavigate()
  const [name, setName] = React.useState("")
  const [color, setColor] = React.useState<ProjectColor>("blue")
  const [description, setDescription] = React.useState("")
  const [templateId, setTemplateId] = React.useState(EMPTY)
  const [invalid, setInvalid] = React.useState(false)
  const [run, saving] = useAsyncAction(getProjectErrorMessage)
  const templates = useTemplates(open)
  const template = templates.state === "ready" ? templates.rows.find((row) => row.id === templateId) : undefined
  const dirty = Boolean(name.trim() || description.trim() || templateId !== EMPTY)

  function close() {
    setName("")
    setColor("blue")
    setDescription("")
    setTemplateId(EMPTY)
    setInvalid(false)
    onClose()
  }

  async function create() {
    if (!name.trim()) {
      setInvalid(true)
      showErrorToast("Give the project a name.")
      return
    }
    let projectId = ""
    const ok = await run(async () => {
      projectId = (
        await createNewProject({ name, color, description, templateId: template ? template.id : null })
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
                        No templates yet. Save one from any project's settings.
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
