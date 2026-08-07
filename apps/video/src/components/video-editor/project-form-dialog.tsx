import * as React from "react"
import { Loader2Icon } from "lucide-react"
import { toast } from "sonner"

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
import {
  createProject,
  getProjectErrorMessage,
  renameProject,
  type ProjectItem,
} from "@/lib/api/video/projects"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"

/**
 * Naming a project — on the way in, or later from its row. The only thing a
 * project has besides its timeline is its name, so this is the whole form.
 */
export function ProjectFormDialog({
  open,
  project,
  onClose,
  onCreated,
  onSaved,
}: {
  open: boolean
  /** The project being renamed, or null when making a new one. */
  project: ProjectItem | null
  onClose: () => void
  onCreated: (project: ProjectItem) => void
  onSaved: () => void
}) {
  const [name, setName] = React.useState(project?.name ?? "")
  const [saving, setSaving] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement>(null)

  // Start from the right name every time the window opens.
  const [wasOpen, setWasOpen] = React.useState(open)
  if (wasOpen !== open) {
    setWasOpen(open)
    if (open) setName(project?.name ?? "")
  }

  const dirty = name !== (project?.name ?? "")

  async function handleSave() {
    if (!name.trim()) {
      showErrorToast("A project needs a name.")
      inputRef.current?.focus()
      return
    }
    setSaving(true)
    try {
      if (project) {
        await renameProject(project.id, name)
        dismissErrorToast()
        toast.success("Project renamed.")
        onSaved()
      } else {
        const created = await createProject(name)
        dismissErrorToast()
        onCreated(created)
      }
      onClose()
    } catch (error) {
      showErrorToast(getProjectErrorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <FormDialog open={open} dirty={dirty} busy={saving} onClose={onClose}>
      {(requestClose) => (
        <DialogContent
          variant="admin"
          className="sm:max-w-lg"
          onOpenAutoFocus={(event) => {
            event.preventDefault()
            inputRef.current?.focus()
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {project ? "Rename project" : "New project"}
            </DialogTitle>
            <DialogDescription>
              {project
                ? "What this project is called in the list."
                : "It opens empty and vertical — the aspect switch changes that in one click."}
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(event) => {
              event.preventDefault()
              void handleSave()
            }}
          >
            <DialogBody>
              <Card size="sm">
                <CardHeader>
                  <CardTitle>Name</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="project-name">Project name</Label>
                    <Input
                      id="project-name"
                      ref={inputRef}
                      value={name}
                      maxLength={200}
                      aria-invalid={!name.trim() || undefined}
                      placeholder="Gym hook reel"
                      onChange={(event) => setName(event.target.value)}
                    />
                  </div>
                </CardContent>
              </Card>
            </DialogBody>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={saving}
                onClick={requestClose}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? <Loader2Icon className="animate-spin" /> : null}
                {project ? "Save changes" : "Create project"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      )}
    </FormDialog>
  )
}
