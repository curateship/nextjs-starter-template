import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import { Loader2Icon } from "lucide-react"

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
import { FormDialog } from "@/components/ui/form-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { copyOfProject } from "@/lib/api/project/projects"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { getProjectErrorMessage } from "@/lib/project/errors"
import { LIMITS } from "@/lib/project/rules"
import { showErrorToast } from "@/lib/toast/error-toast"

/** "Copy of Website launch", cut to fit the name's limit. */
const startingName = (name: string) => `Copy of ${name}`.slice(0, LIMITS.projectName)

/**
 * Copy project: a new project with the old one's tasks and steps, ready for
 * the next job of the same kind. It asks only for the new name, which starts
 * as "Copy of …", selected, so typing replaces it and Copy works at once.
 */
export function CopyProjectDialog({
  project,
  open,
  onClose,
}: {
  project: { id: string; name: string }
  open: boolean
  onClose: () => void
}) {
  const navigate = useNavigate()
  const [name, setName] = React.useState(() => startingName(project.name))
  const [invalid, setInvalid] = React.useState(false)
  const [run, busy] = useAsyncAction(getProjectErrorMessage)

  // Each opening starts on "Copy of …", even after the project was renamed.
  const [wasOpen, setWasOpen] = React.useState(open)
  if (wasOpen !== open) {
    setWasOpen(open)
    if (open) {
      setName(startingName(project.name))
      setInvalid(false)
    }
  }

  function close() {
    setInvalid(false)
    onClose()
  }

  async function copy() {
    const next = name.trim()
    if (!next) {
      setInvalid(true)
      showErrorToast("Give the new project a name.")
      return
    }
    let id = ""
    const ok = await run(async () => {
      id = (await copyOfProject(project.id, next)).id
    }, "Project copied.")
    if (!ok) return
    close()
    await navigate({ to: "/projects/$projectId", params: { projectId: id } })
  }

  return (
    <FormDialog
      open={open}
      dirty={name !== startingName(project.name)}
      busy={busy}
      onClose={close}
    >
      {(requestClose) => (
        <DialogContent variant="admin" className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Copy {project.name}</DialogTitle>
            <DialogDescription>
              The copy gets the same tasks, steps and tags, all To do, with nobody
              assigned and no dates. You'll be its only member.
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(event) => {
              event.preventDefault()
              void copy()
            }}
          >
            <DialogBody>
              <Card size="sm">
                <CardHeader>
                  <CardTitle>New project</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-2">
                  <Label htmlFor="copy-project-name">Name</Label>
                  <Input
                    id="copy-project-name"
                    value={name}
                    maxLength={LIMITS.projectName}
                    autoFocus
                    onFocus={(event) => event.currentTarget.select()}
                    aria-invalid={invalid || undefined}
                    onChange={(event) => {
                      setName(event.target.value)
                      setInvalid(false)
                    }}
                  />
                </CardContent>
              </Card>
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={requestClose} disabled={busy}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
                Copy project
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      )}
    </FormDialog>
  )
}
