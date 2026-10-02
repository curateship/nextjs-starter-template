import * as React from "react"
import { Link } from "@tanstack/react-router"
import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core"
import {
  arrayMove,
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { EyeIcon, EyeOffIcon, GripVerticalIcon, Trash2Icon } from "lucide-react"

import {
  DRAG_HANDLE_CLASS,
  useNavSensors,
  useSortableRow,
} from "@/components/settings/nav-editor-shared"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import type { SocialFolder } from "@/lib/trade/social/feed"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

/**
 * The cog window for the feed's folders: rename, drag into order, the eye to
 * keep one out of the panel, and delete. The markets panel's manage window
 * with a different subject, minus what creators do not have — there is no Fav
 * and no Everyone row here, because Everyone is pinned to the top of the
 * panel and cannot be moved, hidden or deleted.
 *
 * Changes save as they happen, so the window ends with one primary Done, per
 * `workspace/docs/screens/dialog-button-wording.md`. The sortable table of
 * creators themselves lives at `/social/manage`, linked from the footer.
 */
export type SocialFolderManagerActions = {
  busy: boolean
  create: (name: string) => Promise<boolean>
  rename: (folderId: string, name: string) => void
  remove: (folderId: string) => Promise<boolean>
  saveOrder: (folderIds: string[], hiddenFolderIds: string[]) => void
}

export function SocialFoldersManager({
  folders,
  open,
  onOpenChange,
  actions,
}: {
  folders: readonly SocialFolder[]
  open: boolean
  onOpenChange: (open: boolean) => void
  actions: SocialFolderManagerActions
}) {
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [deleting, setDeleting] = React.useState<SocialFolder | null>(null)
  const sensors = useNavSensors()

  const rows = [...folders].sort((left, right) => left.position - right.position)
  const hiddenIds = rows.filter((row) => row.hidden).map((row) => row.id)

  function reorder(event: DragEndEvent) {
    if (!event.over || event.active.id === event.over.id || actions.busy) return
    const from = rows.findIndex((row) => row.id === event.active.id)
    const to = rows.findIndex((row) => row.id === event.over?.id)
    if (from < 0 || to < 0) return
    actions.saveOrder(
      arrayMove(rows, from, to).map((row) => row.id),
      hiddenIds
    )
  }

  function toggleHidden(row: SocialFolder) {
    if (actions.busy) return
    actions.saveOrder(
      rows.map((one) => one.id),
      row.hidden
        ? hiddenIds.filter((id) => id !== row.id)
        : [...hiddenIds, row.id]
    )
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent variant="admin">
          <DialogHeader>
            <DialogTitle>Manage folders</DialogTitle>
            <DialogDescription>
              Rename a folder, drag the rows into the order you want, or press
              an eye to keep a folder out of the panel. A hidden or deleted
              folder never loses you a creator.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Card size="sm">
              <CardHeader>
                <CardTitle>New folder</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2">
                <CreateFolderForm busy={actions.busy} onCreate={actions.create} />
              </CardContent>
            </Card>
            <Card size="sm">
              <CardHeader>
                <CardTitle>Order</CardTitle>
                <CardDescription>
                  This is the order the panel lists them in, under Everyone. A
                  folder with a line through its eye is switched off and keeps
                  its creators.
                </CardDescription>
                <CardAction className="text-xs text-muted-foreground tabular-nums">
                  {rows.length} {rows.length === 1 ? "folder" : "folders"}
                </CardAction>
              </CardHeader>
              <CardContent className="grid gap-2">
                {rows.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No folders yet. Name the first one above.
                  </p>
                ) : (
                  <DndContext
                    id="trade-social-folders"
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={reorder}
                  >
                    <SortableContext
                      items={rows.map((row) => row.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      <div className="grid gap-2">
                        {rows.map((row) => (
                          <FolderRowManager
                            key={row.id}
                            row={row}
                            disabled={actions.busy}
                            editing={editingId === row.id}
                            onEdit={() => setEditingId(row.id)}
                            onRename={(name) => actions.rename(row.id, name)}
                            onFinishEdit={() => setEditingId(null)}
                            onToggleHidden={() => toggleHidden(row)}
                            onDelete={() => {
                              setEditingId(null)
                              setDeleting(row)
                            }}
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                )}
              </CardContent>
            </Card>
          </DialogBody>
          <DialogFooter>
            <Button asChild variant="outline" size="lg" className="mr-auto">
              <Link to="/social/manage">Manage creators</Link>
            </Button>
            <Button type="button" size="lg" onClick={() => onOpenChange(false)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(next) => !next && setDeleting(null)}
        title={`Delete ${deleting?.name ?? "folder"}?`}
        description="The folder goes; the creators in it stay tracked and keep every post."
        confirmLabel="Delete folder"
        loading={actions.busy}
        onConfirm={() => {
          if (!deleting) return
          void actions.remove(deleting.id).then((removed) => {
            if (removed) setDeleting(null)
          })
        }}
      />
    </>
  )
}

function CreateFolderForm({
  busy,
  onCreate,
}: {
  busy: boolean
  onCreate: (name: string) => Promise<boolean>
}) {
  const [name, setName] = React.useState("")
  const [attempted, setAttempted] = React.useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setAttempted(true)
    const trimmed = name.trim()
    if (!trimmed) {
      showErrorToast("Enter a folder name.")
      return
    }
    const created = await onCreate(trimmed)
    if (!created) return
    setName("")
    setAttempted(false)
  }

  return (
    <form className="grid gap-2" onSubmit={(event) => void submit(event)}>
      <Label htmlFor="new-social-folder-name">Folder name</Label>
      <div className="flex gap-2">
        <Input
          id="new-social-folder-name"
          aria-invalid={attempted && !name.trim()}
          placeholder="Trusted"
          value={name}
          maxLength={80}
          disabled={busy}
          onChange={(event) => setName(event.target.value)}
        />
        <Button type="submit" disabled={busy}>
          Create folder
        </Button>
      </div>
    </form>
  )
}

function FolderRowManager({
  row,
  disabled,
  editing,
  onEdit,
  onRename,
  onFinishEdit,
  onToggleHidden,
  onDelete,
}: {
  row: SocialFolder
  disabled: boolean
  editing: boolean
  onEdit: () => void
  onRename: (name: string) => void
  onFinishEdit: () => void
  onToggleHidden: () => void
  onDelete: () => void
}) {
  const [name, setName] = React.useState(row.name)
  const { attributes, listeners, setNodeRef, style } = useSortableRow(
    row.id,
    true
  )
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex h-10 items-center gap-2 rounded-lg px-1",
        editing && "bg-muted"
      )}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className={DRAG_HANDLE_CLASS}
        aria-label={`Reorder ${row.name}`}
        disabled={disabled}
      >
        <GripVerticalIcon className="size-4" />
      </button>
      {editing ? (
        <Input
          autoFocus
          aria-label={`Rename ${row.name}`}
          value={name}
          maxLength={80}
          disabled={disabled}
          onChange={(event) => setName(event.target.value)}
          onBlur={() => {
            if (!name.trim()) setName(row.name)
            else if (name.trim() !== row.name) onRename(name)
            onFinishEdit()
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur()
            if (event.key === "Escape") {
              setName(row.name)
              onFinishEdit()
            }
          }}
        />
      ) : (
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-3 self-stretch text-left"
          disabled={disabled}
          onClick={() => {
            setName(row.name)
            onEdit()
          }}
        >
          <span
            className={cn(
              "min-w-0 flex-1 truncate font-medium",
              row.hidden && "text-muted-foreground"
            )}
          >
            {row.name}
          </span>
          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
            {row.hidden
              ? "Hidden"
              : `${row.creatorIds.length} ${
                  row.creatorIds.length === 1 ? "creator" : "creators"
                }`}
          </span>
        </button>
      )}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={row.hidden ? `Show ${row.name}` : `Hide ${row.name}`}
            aria-pressed={row.hidden}
            disabled={disabled}
            onPointerDown={(event) => event.preventDefault()}
            onClick={onToggleHidden}
          >
            {row.hidden ? (
              <EyeOffIcon className="size-4" />
            ) : (
              <EyeIcon className="size-4" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {row.hidden ? `Show ${row.name}` : `Hide ${row.name}`}
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Delete ${row.name}`}
            disabled={disabled}
            onPointerDown={(event) => event.preventDefault()}
            onClick={onDelete}
          >
            <Trash2Icon className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{`Delete ${row.name}`}</TooltipContent>
      </Tooltip>
    </div>
  )
}
