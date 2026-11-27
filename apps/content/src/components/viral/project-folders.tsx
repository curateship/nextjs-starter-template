import * as React from "react"
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
import type { ViralFolderSummary } from "@/lib/api/viral/viral-projects"
import { plural } from "@/lib/format/plural"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"
import { cleanFolderName, PROJECT_FOLDER_NAME_MAX } from "@/lib/viral/project-folders"

/**
 * Folders on the projects list: the dropdown that picks one and makes, renames
 * and deletes them, and the toolbar menu that moves ticked projects.
 * A project is in one folder at most, and deleting a folder never deletes a
 * project (see `workspace/docs/project-folders.md`).
 */

function projectsWord(count: number) {
  return `${count} ${plural(count, "project")}`
}

/**
 * The folder doors a list uses. The editor's projects and Viral's projects
 * keep separate folders, so each list hands its own set to these menus.
 */
export type FolderApi = {
  create: (name: string) => Promise<{ id: string; name: string }>
  rename: (folderId: string, name: string) => Promise<{ id: string; name: string }>
  remove: (folderId: string) => Promise<{ loose_count: number }>
  move: (
    projectIds: string[],
    folderId: string | null
  ) => Promise<{
    moved_ids: string[]
    unchanged_ids: string[]
    skipped_ids: string[]
  }>
  errorMessage: (error: unknown) => string
}

// ------------------------------------------------------ Name window -------

/** Creates a folder when `folder` is null, renames it otherwise. */
function FolderNameDialog({
  api,
  open,
  onOpenChange,
  folder,
  onSaved,
}: {
  api: FolderApi
  open: boolean
  onOpenChange: (open: boolean) => void
  folder: ViralFolderSummary | null
  /** Handed the saved folder; the window closes once this settles. */
  onSaved: (saved: { id: string; name: string }) => Promise<void>
}) {
  const [name, setName] = React.useState("")
  const [invalid, setInvalid] = React.useState(false)
  const [busy, setBusy] = React.useState(false)

  const [wasOpen, setWasOpen] = React.useState(false)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setName(folder?.name ?? "")
      setInvalid(false)
    }
  }

  async function submit() {
    if (busy) return
    let cleaned: string
    try {
      cleaned = cleanFolderName(name)
    } catch (error) {
      setInvalid(true)
      showErrorToast(api.errorMessage(error))
      return
    }
    if (folder && cleaned === folder.name) {
      onOpenChange(false)
      return
    }
    setBusy(true)
    dismissErrorToast()
    try {
      await onSaved(
        folder
          ? await api.rename(folder.id, cleaned)
          : await api.create(cleaned)
      )
      onOpenChange(false)
    } catch (error) {
      // A taken name is the usual reason, and the server's sentence says so.
      setInvalid(true)
      showErrorToast(api.errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <FormDialog
      open={open}
      dirty={name.trim() !== (folder?.name ?? "")}
      busy={busy}
      onClose={() => onOpenChange(false)}
    >
      {(requestClose) => (
        <DialogContent variant="admin" className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{folder ? "Rename folder" : "New folder"}</DialogTitle>
            <DialogDescription>
              {folder
                ? "The projects in it stay exactly as they are."
                : "Groups projects on this list, one folder per client or series. Only you see it."}
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(event) => {
              event.preventDefault()
              void submit()
            }}
          >
            <DialogBody>
              <Card size="sm">
                <CardHeader>
                  <CardTitle>Folder</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="project-folder-name">Name</Label>
                    <Input
                      id="project-folder-name"
                      autoFocus
                      maxLength={PROJECT_FOLDER_NAME_MAX}
                      value={name}
                      placeholder="Client A"
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
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={requestClose}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? <Loader2Icon className="animate-spin" /> : null}
                {folder ? "Save changes" : "Create folder"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      )}
    </FormDialog>
  )
}

// -------------------------------------------------------------- Menu ------

/**
 * The folder windows the Folders block on the Viral dashboard's left page
 * opens (task features/03): New folder and Rename from its ⋮ and a folder
 * row's ⋯, and Delete, which asks first and says what happens to the
 * projects inside. They were the folder dropdown's on the old Projects page
 * (Tyler, 17 Oct 2026).
 */
export function FolderWindows({
  api,
  naming,
  onNamingChange,
  deleting,
  onDeletingChange,
  onFoldersChanged,
}: {
  api: FolderApi
  /** The folder being renamed, `{ folder: null }` for New folder, or null when the window is shut. */
  naming: { folder: ViralFolderSummary | null } | null
  onNamingChange: (naming: { folder: ViralFolderSummary | null } | null) => void
  deleting: ViralFolderSummary | null
  onDeletingChange: (folder: ViralFolderSummary | null) => void
  /** A folder was made, renamed or deleted; resolves once the counts are read again. */
  onFoldersChanged: (gone?: string) => Promise<void>
}) {
  const [deleteBusy, setDeleteBusy] = React.useState(false)
  async function confirmDelete() {
    if (!deleting) return
    setDeleteBusy(true)
    dismissErrorToast()
    try {
      await api.remove(deleting.id)
      await onFoldersChanged(deleting.id)
      onDeletingChange(null)
    } catch (error) {
      showErrorToast(api.errorMessage(error))
    } finally {
      setDeleteBusy(false)
    }
  }
  return (
    <>
      <FolderNameDialog
        api={api}
        open={naming !== null}
        onOpenChange={(open) => {
          if (!open) onNamingChange(null)
        }}
        folder={naming?.folder ?? null}
        onSaved={async () => {
          await onFoldersChanged()
        }}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) onDeletingChange(null)
        }}
        title={`Delete "${deleting?.name ?? ""}"?`}
        description={
          deleting?.project_count
            ? `The ${projectsWord(deleting.project_count)} in it ${plural(deleting.project_count, "stays", "stay")} on your list, in no folder. Only the folder goes.`
            : "It is empty, so nothing else changes."
        }
        confirmLabel="Delete folder"
        loading={deleteBusy}
        onConfirm={() => void confirmDelete()}
      />
    </>
  )
}
