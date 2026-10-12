import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import { Loader2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
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
  getDeleteProjectErrorMessage,
  getProjectErrorMessage,
  makeProject,
  removeProject,
} from "@/lib/api/social/projects"
import { showErrorToast } from "@/lib/toast/error-toast"

export type ProjectDialog =
  | null
  | { kind: "new" }
  | { kind: "delete"; project: { id: string; name: string } }

/**
 * The two windows the Projects dashboard opens: a new project, which asks
 * only for its name, and deleting one, which the server refuses while the
 * project still holds accounts or keywords.
 */
export function ProjectDialogs({
  dialog,
  onClose,
}: {
  dialog: ProjectDialog
  onClose: () => void
}) {
  const navigate = useNavigate()
  const [deleting, setDeleting] = React.useState(false)

  return (
    <>
      <NewProjectDialog
        open={dialog?.kind === "new"}
        onClose={onClose}
        onCreated={async (projectId) => {
          onClose()
          await navigate({ to: "/admin/projects/$projectId", params: { projectId } })
        }}
      />
      <ConfirmDialog
        open={dialog?.kind === "delete"}
        onOpenChange={(open) => {
          if (!open) onClose()
        }}
        title={dialog?.kind === "delete" ? `Delete ${dialog.project.name}?` : "Delete project?"}
        description="Only an empty project can be deleted. Take its accounts out and remove its keywords first. Nothing else is deleted with it."
        confirmLabel="Delete project"
        loading={deleting}
        onConfirm={async () => {
          if (dialog?.kind !== "delete") return
          setDeleting(true)
          try {
            await removeProject(dialog.project.id)
            onClose()
            await navigate({ to: "/admin/projects" })
          } catch (error) {
            showErrorToast(getDeleteProjectErrorMessage(error))
          } finally {
            setDeleting(false)
          }
        }}
      />
    </>
  )
}

export function NewProjectDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: (projectId: string) => Promise<void>
}) {
  const [name, setName] = React.useState("")
  const [invalid, setInvalid] = React.useState(false)
  const [saving, setSaving] = React.useState(false)

  async function create() {
    if (!name.trim()) {
      setInvalid(true)
      showErrorToast("Give the project a name first.")
      return
    }
    setSaving(true)
    try {
      const { id } = await makeProject(name.trim())
      setName("")
      setInvalid(false)
      await onCreated(id)
    } catch (error) {
      showErrorToast(getProjectErrorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <FormDialog
      open={open}
      dirty={Boolean(name.trim())}
      busy={saving}
      onClose={() => {
        setName("")
        setInvalid(false)
        onClose()
      }}
    >
      {(requestClose) => (
        <DialogContent variant="admin">
          <DialogHeader>
            <DialogTitle>New project</DialogTitle>
            <DialogDescription>
              One thing you promote. Its description, accounts and keywords go on
              the Projects dashboard once it is made.
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
                  <CardTitle>The project</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="new-project-name">Name</Label>
                    <Input
                      id="new-project-name"
                      value={name}
                      maxLength={120}
                      placeholder="My product"
                      aria-invalid={invalid || undefined}
                      onChange={(event) => {
                        setName(event.target.value)
                        setInvalid(false)
                      }}
                    />
                  </div>
                </CardContent>
              </Card>
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="outline" disabled={saving} onClick={requestClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? <Loader2Icon className="animate-spin" /> : null}
                Create project
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      )}
    </FormDialog>
  )
}
