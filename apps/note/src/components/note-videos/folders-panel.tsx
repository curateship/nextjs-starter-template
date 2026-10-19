import * as React from "react"
import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core"
import { arrayMove, SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { FolderIcon, GripVerticalIcon, PlusIcon, SettingsIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"

import {
  DRAG_HANDLE_CLASS,
  useNavSensors,
  useSortableRow,
} from "@/components/settings/nav-editor-shared"
import { DashboardCardTitleHeader } from "@/components/shared/dashboard-card-header"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  createNoteFolder,
  deleteNoteFolder,
  getFolderErrorMessage,
  renameNoteFolder,
  reorderNoteFolders,
} from "@/lib/api/note/folders"
import { plural } from "@/lib/format/plural"
import { focusRing } from "@/lib/layout/focus-ring"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"
import {
  cleanFolderName,
  FOLDER_NAME_MAX,
  NO_FOLDER,
  type FolderScope,
  type NoteFolder,
  type NoteFolderList,
} from "@/lib/note/videos"

/**
 * The left panel: "All videos" and "No folder" at the top, then the person's
 * folders in the order they dragged them. Clicking a row narrows the middle
 * panel in place; clicking the picked row again widens it back to everything.
 *
 * A flat list, and a video sits in one folder at most. Deleting a folder
 * leaves its videos on the list in no folder, and the confirmation says so.
 */
export function FoldersPanel({
  list,
  scope,
  onPick,
  onChanged,
  onDeleted,
}: {
  list: NoteFolderList
  scope: FolderScope
  onPick: (scope: FolderScope) => void
  /** The server's fresh list after a folder was made, renamed or moved. */
  onChanged: (list: NoteFolderList) => void
  /** A folder went; its videos are in no folder now. */
  onDeleted: (folderId: string, list: NoteFolderList) => void
}) {
  const sensors = useNavSensors()
  const [naming, setNaming] = React.useState(false)
  const [newName, setNewName] = React.useState("")
  const [newInvalid, setNewInvalid] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [renamingId, setRenamingId] = React.useState<string | null>(null)
  const [deleting, setDeleting] = React.useState<NoteFolder | null>(null)
  const [deleteBusy, setDeleteBusy] = React.useState(false)

  /**
   * The order on screen. A drag moves it at once and the save follows; a
   * refused save puts it back. A new list from the server replaces it.
   */
  const [order, setOrder] = React.useState({ from: list, folders: list.folders })
  if (order.from !== list) setOrder({ from: list, folders: list.folders })
  const folders = order.folders

  async function createFolder(event: React.FormEvent) {
    event.preventDefault()
    if (busy) return
    let cleaned: string
    try {
      cleaned = cleanFolderName(newName)
    } catch (error) {
      setNewInvalid(true)
      showErrorToast(getFolderErrorMessage(error))
      return
    }
    setBusy(true)
    dismissErrorToast()
    try {
      onChanged(await createNoteFolder(cleaned))
      setNewName("")
      setNaming(false)
    } catch (error) {
      setNewInvalid(true)
      showErrorToast(getFolderErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  async function rename(folder: NoteFolder, name: string): Promise<boolean> {
    dismissErrorToast()
    try {
      onChanged(await renameNoteFolder(folder.id, name))
      return true
    } catch (error) {
      showErrorToast(getFolderErrorMessage(error))
      return false
    }
  }

  async function confirmDelete() {
    if (!deleting) return
    setDeleteBusy(true)
    dismissErrorToast()
    try {
      const { looseCount, folders: fresh } = await deleteNoteFolder(deleting.id)
      onDeleted(deleting.id, fresh)
      toast.success(
        looseCount
          ? `Deleted “${deleting.name}”. Its ${looseCount} ${plural(looseCount, "video")} ${plural(looseCount, "is", "are")} still here, in no folder.`
          : `Deleted “${deleting.name}”.`
      )
      setDeleting(null)
    } catch (error) {
      showErrorToast(getFolderErrorMessage(error))
    } finally {
      setDeleteBusy(false)
    }
  }

  async function onDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const from = folders.findIndex((folder) => folder.id === active.id)
    const to = folders.findIndex((folder) => folder.id === over.id)
    if (from < 0 || to < 0) return
    const before = folders
    const moved = arrayMove(folders, from, to)
    setOrder((current) => ({ ...current, folders: moved }))
    try {
      onChanged(await reorderNoteFolders(moved.map((folder) => folder.id)))
    } catch (error) {
      setOrder((current) => ({ ...current, folders: before }))
      showErrorToast(getFolderErrorMessage(error))
    }
  }

  return (
    <>
      <DashboardCardTitleHeader
        icon={<FolderIcon />}
        title="Folders"
        action={
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant={naming ? "secondary" : "ghost"}
                size="icon"
                aria-label="New folder"
                aria-pressed={naming}
                onClick={() => {
                  setNaming((shown) => !shown)
                  setNewInvalid(false)
                }}
              >
                <PlusIcon />
              </Button>
            </TooltipTrigger>
            <TooltipContent>New folder</TooltipContent>
          </Tooltip>
        }
      />
      {naming ? (
        <form className="grid shrink-0 gap-2 border-b p-3" onSubmit={(event) => void createFolder(event)}>
          <Label htmlFor="note-new-folder">Folder name</Label>
          <div className="flex gap-2">
            <Input
              id="note-new-folder"
              autoFocus
              placeholder="Pricing"
              value={newName}
              maxLength={FOLDER_NAME_MAX}
              aria-invalid={newInvalid || undefined}
              onChange={(event) => {
                setNewName(event.target.value)
                setNewInvalid(false)
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  setNaming(false)
                  setNewName("")
                  setNewInvalid(false)
                }
              }}
            />
            <Button type="submit" disabled={busy}>
              Create folder
            </Button>
          </div>
        </form>
      ) : null}
      <ScrollArea className="min-h-0 flex-1">
        <ScopeRow
          name="All videos"
          count={list.allCount}
          selected={scope === undefined}
          onPick={() => onPick(undefined)}
        />
        <ScopeRow
          name="No folder"
          count={list.noFolderCount}
          selected={scope === NO_FOLDER}
          onPick={() => onPick(scope === NO_FOLDER ? undefined : NO_FOLDER)}
        />
        {folders.length ? (
          <DndContext
            // A fixed id, so the drag description's id is the same on the
            // server and in the browser. Left to count, the two disagree.
            id="note-video-folders"
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={(event) => void onDragEnd(event)}
          >
            <SortableContext items={folders.map((folder) => folder.id)} strategy={verticalListSortingStrategy}>
              <ul aria-label="Folders">
                {folders.map((folder) => (
                  <FolderRow
                    key={folder.id}
                    folder={folder}
                    selected={scope === folder.id}
                    renaming={renamingId === folder.id}
                    onPick={() => onPick(scope === folder.id ? undefined : folder.id)}
                    onStartRename={() => setRenamingId(folder.id)}
                    onStopRename={() => setRenamingId(null)}
                    onRename={(name) => rename(folder, name)}
                    onDelete={() => setDeleting(folder)}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        ) : (
          <p className="px-4 py-6 text-center text-xs text-muted-foreground">
            No folders yet. The + above makes one, and a video's menu moves it in.
          </p>
        )}
      </ScrollArea>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
        title={`Delete “${deleting?.name ?? ""}”?`}
        description={
          deleting?.videoCount
            ? `The ${deleting.videoCount} ${plural(deleting.videoCount, "video")} in it ${plural(deleting.videoCount, "stays", "stay")} on your list, in no folder. Only the folder goes.`
            : "It is empty, so nothing else changes."
        }
        confirmLabel="Delete folder"
        loading={deleteBusy}
        onConfirm={() => void confirmDelete()}
      />
    </>
  )
}

function ScopeRow({
  name,
  count,
  selected,
  onPick,
}: {
  name: string
  count: number
  selected: boolean
  onPick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onPick}
      className={cn(
        "flex h-9 w-full items-center gap-2 border-b px-3 text-left text-sm font-medium",
        selected ? "bg-muted" : "hover:bg-muted/50",
        focusRing
      )}
    >
      <span className="min-w-0 flex-1 truncate">{name}</span>
      <span className="text-xs font-normal text-muted-foreground tabular-nums">{count}</span>
    </button>
  )
}

function FolderRow({
  folder,
  selected,
  renaming,
  onPick,
  onStartRename,
  onStopRename,
  onRename,
  onDelete,
}: {
  folder: NoteFolder
  selected: boolean
  renaming: boolean
  onPick: () => void
  onStartRename: () => void
  onStopRename: () => void
  onRename: (name: string) => Promise<boolean>
  onDelete: () => void
}) {
  const { attributes, listeners, setNodeRef, style } = useSortableRow(folder.id)
  const [draft, setDraft] = React.useState(folder.name)
  const [invalid, setInvalid] = React.useState(false)
  const [saving, setSaving] = React.useState(false)

  function startRename() {
    setDraft(folder.name)
    setInvalid(false)
    onStartRename()
  }

  async function commit() {
    if (saving) return
    let cleaned: string
    try {
      cleaned = cleanFolderName(draft)
    } catch {
      setInvalid(true)
      return
    }
    if (cleaned === folder.name) {
      onStopRename()
      return
    }
    setSaving(true)
    const saved = await onRename(cleaned)
    setSaving(false)
    if (saved) onStopRename()
    // A clash keeps the box open and red, with what was typed still in it.
    else setInvalid(true)
  }

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex h-9 items-center gap-1 border-b pr-1.5 pl-1",
        selected ? "bg-muted" : "hover:bg-muted/50"
      )}
    >
      <button
        type="button"
        aria-label={`Reorder ${folder.name}`}
        className={cn(DRAG_HANDLE_CLASS, "size-6 shrink-0")}
        {...attributes}
        {...listeners}
      >
        <GripVerticalIcon className="size-3.5" />
      </button>
      {renaming ? (
        <Input
          autoFocus
          value={draft}
          maxLength={FOLDER_NAME_MAX}
          disabled={saving}
          aria-label={`New name for ${folder.name}`}
          aria-invalid={invalid || undefined}
          className="min-w-0 flex-1"
          onChange={(event) => {
            setDraft(event.target.value)
            setInvalid(false)
          }}
          onBlur={() => void commit()}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault()
              void commit()
            }
            if (event.key === "Escape") {
              event.preventDefault()
              setInvalid(false)
              onStopRename()
            }
          }}
        />
      ) : (
        <button
          type="button"
          aria-pressed={selected}
          onClick={onPick}
          className={cn(
            "flex h-full min-w-0 flex-1 items-center gap-2 rounded-sm px-1 text-left text-sm font-medium",
            focusRing
          )}
        >
          <span className="min-w-0 flex-1 truncate">{folder.name}</span>
          <span className="text-xs font-normal text-muted-foreground tabular-nums">
            {folder.videoCount}
          </span>
        </button>
      )}
      <RowButton label={`Rename ${folder.name}`} onClick={startRename}>
        <SettingsIcon />
      </RowButton>
      <RowButton label={`Delete ${folder.name}`} onClick={onDelete}>
        <Trash2Icon />
      </RowButton>
    </li>
  )
}

function RowButton({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button type="button" variant="ghost" size="icon-xs" aria-label={label} onClick={onClick}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}
