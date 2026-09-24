import * as React from "react"
import {
  ChevronDownIcon,
  FolderInputIcon,
  Loader2Icon,
  PlusIcon,
  SettingsIcon,
  Trash2Icon,
} from "lucide-react"
import { toast } from "sonner"

import {
  dashboardToolbarButtonActiveClassName,
  DashboardToolbarButton,
} from "@/components/shared/dashboard-toolbar"
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { FormDialog } from "@/components/ui/form-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  createProjectFolder,
  deleteProjectFolder,
  getProjectFolderErrorMessage,
  moveProjectsToFolder,
  renameProjectFolder,
  type ProjectFolderSummary,
} from "@/lib/api/video/project-folders"
import { plural } from "@/lib/format/plural"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"
import {
  cleanFolderName,
  NO_FOLDER,
  PROJECT_FOLDER_NAME_MAX,
} from "@/lib/video/project-folders"

/**
 * Folders on the projects list: the chips that pick one, the menu that makes,
 * renames and deletes them, and the toolbar menu that moves ticked projects.
 * A project is in one folder at most, and deleting a folder never deletes a
 * project (see `workspace/docs/project-folders.md`).
 */

function projectsWord(count: number) {
  return `${count} ${plural(count, "project")}`
}

// ------------------------------------------------------ Name window -------

/** Creates a folder when `folder` is null, renames it otherwise. */
function FolderNameDialog({
  open,
  onOpenChange,
  folder,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  folder: ProjectFolderSummary | null
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
      showErrorToast(getProjectFolderErrorMessage(error))
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
          ? await renameProjectFolder(folder.id, cleaned)
          : await createProjectFolder(cleaned)
      )
      onOpenChange(false)
    } catch (error) {
      // A taken name is the usual reason, and the server's sentence says so.
      setInvalid(true)
      showErrorToast(getProjectFolderErrorMessage(error))
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

// ------------------------------------------------------------- Chips ------

/**
 * The folder chips for the strip above the rows, plus the one button that
 * manages folders. Rename and delete act on the picked chip, so the menu never
 * needs a list of its own.
 */
export function FolderChips({
  folders,
  value,
  onChange,
  onFoldersChanged,
}: {
  folders: ProjectFolderSummary[]
  /** Absent for every project, `none`, or a folder's id. */
  value: string | undefined
  onChange: (value: string | undefined) => void
  /** A folder was made, renamed or deleted; resolves once the list reloaded. */
  onFoldersChanged: () => Promise<void>
}) {
  const [naming, setNaming] = React.useState<{
    folder: ProjectFolderSummary | null
  } | null>(null)
  const [deleting, setDeleting] = React.useState<ProjectFolderSummary | null>(
    null
  )
  const [deleteBusy, setDeleteBusy] = React.useState(false)
  const active = folders.find((folder) => folder.id === value)

  async function confirmDelete() {
    if (!deleting) return
    setDeleteBusy(true)
    dismissErrorToast()
    try {
      const { loose_count: loose } = await deleteProjectFolder(deleting.id)
      // The reload finds the picked folder gone and the route falls back to
      // every project, so nothing here has to change the address.
      await onFoldersChanged()
      toast.success(
        loose
          ? `Deleted “${deleting.name}”. Its ${projectsWord(loose)} ${plural(loose, "is", "are")} still here, in no folder.`
          : `Deleted “${deleting.name}”.`
      )
      setDeleting(null)
    } catch (error) {
      showErrorToast(getProjectFolderErrorMessage(error))
    } finally {
      setDeleteBusy(false)
    }
  }

  const options = folders.length
    ? [
        { id: undefined, label: "All" },
        { id: NO_FOLDER, label: "No folder" },
        ...folders.map((folder) => ({ id: folder.id, label: folder.name })),
      ]
    : []

  return (
    <>
      {options.map((option) => {
        const on = value === option.id
        return (
          <Button
            key={option.id ?? "all"}
            type="button"
            // The picked chip is filled the way the shell's toolbar toggles
            // are; that fill is written for the ghost style, which has no
            // dark-mode background of its own to cover it.
            variant={on ? "ghost" : "outline"}
            size="sm"
            aria-pressed={on}
            className={cn(
              "max-w-56",
              on && dashboardToolbarButtonActiveClassName
            )}
            title={option.label}
            onClick={() => onChange(option.id)}
          >
            <span className="truncate">{option.label}</span>
          </Button>
        )
      })}

      {folders.length ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Manage folders"
              title="Manage folders"
            >
              <SettingsIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuItem onSelect={() => setNaming({ folder: null })}>
              <PlusIcon />
              New folder
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {active ? (
              <>
                <DropdownMenuLabel className="truncate">
                  {active.name} · {projectsWord(active.project_count)}
                </DropdownMenuLabel>
                <DropdownMenuItem
                  onSelect={() => setNaming({ folder: active })}
                >
                  <SettingsIcon />
                  Rename
                </DropdownMenuItem>
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => setDeleting(active)}
                >
                  <Trash2Icon />
                  Delete
                </DropdownMenuItem>
              </>
            ) : (
              <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                Pick a folder to rename or delete it.
              </DropdownMenuLabel>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setNaming({ folder: null })}
        >
          <PlusIcon />
          New folder
        </Button>
      )}

      <FolderNameDialog
        open={naming !== null}
        onOpenChange={(open) => {
          if (!open) setNaming(null)
        }}
        folder={naming?.folder ?? null}
        onSaved={async (saved) => {
          await onFoldersChanged()
          toast.success(
            naming?.folder
              ? `Renamed to “${saved.name}”.`
              : `Created “${saved.name}”. Tick projects and use Move to folder to fill it.`
          )
        }}
      />

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
        title={`Delete “${deleting?.name ?? ""}”?`}
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

// ------------------------------------------------------------- Moving -----

/** One line saying what a move did, counting the ones it did not need to do. */
function describeMove(
  result: {
    moved_ids: string[]
    unchanged_ids: string[]
    skipped_ids: string[]
  },
  folder: { name: string } | null
) {
  const moved = result.moved_ids.length
  const unchanged = result.unchanged_ids.length
  const skipped = result.skipped_ids.length
  const parts: string[] = []
  if (moved) {
    parts.push(
      folder
        ? `Moved ${projectsWord(moved)} to “${folder.name}”.`
        : `Took ${projectsWord(moved)} out of ${plural(moved, "its folder", "their folders")}.`
    )
  }
  if (unchanged) {
    const were = moved
      ? `${unchanged} ${plural(unchanged, "was", "were")}`
      : unchanged === 1
        ? "That project was"
        : `All ${unchanged} were`
    parts.push(
      folder
        ? `${were} already in “${folder.name}”.`
        : `${were} already in no folder.`
    )
  }
  if (skipped) {
    parts.push(
      `${skipped} could not be moved, because ${plural(skipped, "it is", "they are")} no longer on your list.`
    )
  }
  return parts.join(" ")
}

/**
 * The toolbar menu shown while projects are ticked: one pick moves them all in
 * one request. "No folder" takes them out; "New folder" makes one and fills it
 * in the same go.
 */
export function MoveToFolderMenu({
  projectIds,
  folders,
  disabled,
  onMoved,
}: {
  projectIds: string[]
  folders: ProjectFolderSummary[]
  disabled?: boolean
  /** Folders changed; resolves once the list reloaded. */
  onMoved: () => Promise<void>
}) {
  const [busy, setBusy] = React.useState(false)
  const [creating, setCreating] = React.useState(false)

  async function move(folder: { id: string; name: string } | null) {
    const result = await moveProjectsToFolder(projectIds, folder?.id ?? null)
    await onMoved()
    toast.success(describeMove(result, folder))
  }

  async function run(folder: { id: string; name: string } | null) {
    if (busy) return
    setBusy(true)
    dismissErrorToast()
    try {
      await move(folder)
    } catch (error) {
      showErrorToast(getProjectFolderErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <DashboardToolbarButton
            type="button"
            variant="outline"
            disabled={disabled || busy}
          >
            {busy ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : (
              <FolderInputIcon className="size-4" />
            )}
            Move to folder
            <ChevronDownIcon className="size-4" />
          </DashboardToolbarButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          {folders.map((folder) => (
            <DropdownMenuItem key={folder.id} onSelect={() => void run(folder)}>
              <span className="truncate">{folder.name}</span>
            </DropdownMenuItem>
          ))}
          {folders.length ? (
            <DropdownMenuItem onSelect={() => void run(null)}>
              <span className="text-muted-foreground">No folder</span>
            </DropdownMenuItem>
          ) : null}
          {folders.length ? <DropdownMenuSeparator /> : null}
          <DropdownMenuItem onSelect={() => setCreating(true)}>
            <PlusIcon />
            New folder
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <FolderNameDialog
        open={creating}
        onOpenChange={setCreating}
        folder={null}
        onSaved={async (created) => {
          // The folder exists by now, so a failed move must not leave the
          // window open offering to create it again.
          try {
            await move(created)
          } catch (error) {
            await onMoved()
            showErrorToast(
              `Created “${created.name}”, but the projects were not moved: ${getProjectFolderErrorMessage(error)}`
            )
          }
        }}
      />
    </>
  )
}
