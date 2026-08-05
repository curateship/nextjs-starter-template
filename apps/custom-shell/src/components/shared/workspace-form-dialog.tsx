"use client"

import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import { Loader2Icon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { FieldLabel } from "@/components/ui/field-label"
import { FormDialog } from "@/components/ui/form-dialog"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  createWorkspace,
  getWorkspaceErrorMessage,
  updateWorkspace,
  type WorkspaceItem,
} from "@/lib/api/workspaces"
import { iconMeta, renderShellIcon, type IconKey } from "@/lib/custom-shell"
import { dismissErrorToast, showErrorToast } from "@/lib/error-toast"
import { useAsyncAction } from "@/lib/use-async-action"

/** What the picker starts on before anything is chosen. */
const defaultIcon = "briefcaseBusiness" satisfies IconKey

type WorkspaceDraft = {
  name: string
  icon: IconKey
}

function draftFor(workspace: WorkspaceItem | null): WorkspaceDraft {
  return workspace
    ? { name: workspace.name, icon: workspace.icon }
    : { name: "", icon: defaultIcon }
}

/**
 * The one window for making or renaming a workspace.
 *
 * Both ways in — the sidebar switcher's "New workspace" and the Workspaces
 * page toolbar — open this, so the two are the same window rather than two
 * lookalikes that drift apart. It owns the typing, the save and the messages;
 * a caller only says whether it is open and, when editing, which workspace.
 */
export function WorkspaceFormDialog({
  open,
  editing = null,
  onClose,
}: {
  open: boolean
  /** The workspace being renamed, or null to make a new one. */
  editing?: WorkspaceItem | null
  onClose: () => void
}) {
  const router = useRouter()
  const [draft, setDraft] = React.useState<WorkspaceDraft>(() =>
    draftFor(editing)
  )
  const [run, saving] = useAsyncAction(getWorkspaceErrorMessage)
  const [nameInvalid, setNameInvalid] = React.useState(false)
  const nameInputRef = React.useRef<HTMLInputElement>(null)
  const fieldId = React.useId()
  const nameId = `${fieldId}-name`
  const iconId = `${fieldId}-icon`

  // Opening is a fresh start: the window shows the workspace it was just
  // handed, never whatever the last one it opened for was left holding.
  const [wasOpen, setWasOpen] = React.useState(open)
  if (wasOpen !== open) {
    setWasOpen(open)
    if (open) {
      setDraft(draftFor(editing))
      setNameInvalid(false)
    }
  }

  // A failure from somewhere else never expires on its own, so clear it as the
  // window opens rather than leaving a stale red toast over a fresh form.
  React.useEffect(() => {
    if (open) dismissErrorToast()
  }, [open])

  const opened = draftFor(editing)
  const dirty = draft.name !== opened.name || draft.icon !== opened.icon

  async function save() {
    const name = draft.name.trim()
    if (!name) {
      setNameInvalid(true)
      showErrorToast("Workspace name is required")
      return
    }

    setNameInvalid(false)
    await run(async () => {
      if (editing) {
        await updateWorkspace(editing.id, name, draft.icon)
      } else {
        await createWorkspace(name, draft.icon)
      }
      await router.invalidate()
      toast.success(editing ? "Workspace updated." : "Workspace created.")
      onClose()
    })
  }

  return (
    <FormDialog open={open} dirty={dirty} busy={saving} onClose={onClose}>
      {(requestClose) => (
        <DialogContent
          variant="admin"
          // A new workspace opens with the cursor in the Name box so you can
          // just type. Renaming an existing one keeps the window's normal
          // focus, since landing in a filled field invites a stray edit.
          onOpenAutoFocus={(event) => {
            if (editing) return
            event.preventDefault()
            nameInputRef.current?.focus()
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit workspace" : "New workspace"}
            </DialogTitle>
            <DialogDescription>
              Choose the name and icon shown in the workspace switcher.
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(event) => {
              event.preventDefault()
              void save()
            }}
          >
            <DialogBody>
              <Card size="sm">
                <CardHeader>
                  <CardTitle>Workspace</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                    <div className="grid gap-2">
                      <FieldLabel
                        htmlFor={iconId}
                        hint="Sits next to the name in the sidebar switcher. A favicon, once one is uploaded, shows instead."
                      >
                        Icon
                      </FieldLabel>
                      <Select
                        value={draft.icon}
                        disabled={saving}
                        onValueChange={(value) =>
                          setDraft((current) => ({
                            ...current,
                            icon: value as IconKey,
                          }))
                        }
                      >
                        <SelectTrigger id={iconId} className="w-full sm:w-fit">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(iconMeta).map(([icon, meta]) => (
                            <SelectItem key={icon} value={icon}>
                              {renderShellIcon(icon as IconKey)}
                              {meta.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2 sm:flex-1">
                      <FieldLabel
                        htmlFor={nameId}
                        hint="What this workspace is called everywhere in the app."
                      >
                        Name
                      </FieldLabel>
                      <Input
                        id={nameId}
                        ref={nameInputRef}
                        value={draft.name}
                        disabled={saving}
                        aria-invalid={nameInvalid || undefined}
                        onChange={(event) => {
                          // Drop the red ring the moment the field is answered,
                          // rather than leaving it on a field that now has a name.
                          if (event.target.value.trim()) setNameInvalid(false)
                          setDraft((current) => ({
                            ...current,
                            name: event.target.value,
                          }))
                        }}
                      />
                    </div>
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
                {saving ? <Loader2Icon className="size-4 animate-spin" /> : null}
                {editing ? "Save changes" : "Create workspace"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      )}
    </FormDialog>
  )
}
