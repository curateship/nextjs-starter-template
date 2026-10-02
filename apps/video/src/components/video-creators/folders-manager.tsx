import * as React from "react"
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import {
  CREATOR_FOLDER_NAME_MAX,
  type CreatorFolder,
} from "@/lib/video/creators"

/**
 * The cog window: rename a folder, drag the folders into order, keep one out
 * of the panel with the eye, or delete it.
 *
 * Changes save as they happen, so the window ends with one Done rather than a
 * Save. Deleting a folder keeps the creators in it — only the grouping goes —
 * and the confirmation says so, because "delete" on a folder of people reads
 * like it might take the people.
 */

export type FolderManagerActions = {
  busy: boolean
  rename: (folderId: string, name: string) => void
  remove: (folderId: string) => Promise<boolean>
  saveOrder: (folderIds: string[], hiddenFolderIds: string[]) => void
}

export function FoldersManager({
  folders,
  open,
  onOpenChange,
  actions,
}: {
  folders: readonly CreatorFolder[]
  open: boolean
  onOpenChange: (open: boolean) => void
  actions: FolderManagerActions
}) {
  const sensors = useNavSensors()
  const [deleting, setDeleting] = React.useState<CreatorFolder | null>(null)
  const [removing, setRemoving] = React.useState(false)

  const ordered = React.useMemo(
    () => [...folders].sort((left, right) => left.position - right.position),
    [folders]
  )

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const from = ordered.findIndex((folder) => folder.id === active.id)
    const to = ordered.findIndex((folder) => folder.id === over.id)
    if (from < 0 || to < 0) return
    const moved = arrayMove(ordered, from, to)
    actions.saveOrder(
      moved.map((folder) => folder.id),
      moved.filter((folder) => folder.hidden).map((folder) => folder.id)
    )
  }

  function toggleHidden(folder: CreatorFolder) {
    const hidden = ordered
      .filter((one) =>
        one.id === folder.id ? !one.hidden : one.hidden
      )
      .map((one) => one.id)
    actions.saveOrder(
      ordered.map((one) => one.id),
      hidden
    )
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent variant="admin">
          <DialogHeader>
            <DialogTitle>Folders</DialogTitle>
            <DialogDescription>
              Drag them into the order you want them down the panel. The eye
              keeps one out of the panel without losing who is in it.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            {ordered.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No folders yet. The folder button beside a creator makes one.
              </p>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={onDragEnd}
              >
                <SortableContext
                  items={ordered.map((folder) => folder.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="grid gap-2">
                    {ordered.map((folder) => (
                      <FolderRow
                        key={folder.id}
                        folder={folder}
                        busy={actions.busy}
                        onRename={(name) => actions.rename(folder.id, name)}
                        onToggleHidden={() => toggleHidden(folder)}
                        onDelete={() => setDeleting(folder)}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}
          </DialogBody>
          <DialogFooter>
            <Button onClick={() => onOpenChange(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(shown) => {
          if (!shown) setDeleting(null)
        }}
        title={`Delete ${deleting?.name ?? "this folder"}?`}
        description="The creators in it stay on your list and keep their videos. Only the folder goes."
        confirmLabel="Delete folder"
        loading={removing}
        onConfirm={async () => {
          if (!deleting) return
          setRemoving(true)
          const went = await actions.remove(deleting.id)
          setRemoving(false)
          if (went) setDeleting(null)
        }}
      />
    </>
  )
}

function FolderRow({
  folder,
  busy,
  onRename,
  onToggleHidden,
  onDelete,
}: {
  folder: CreatorFolder
  busy: boolean
  onRename: (name: string) => void
  onToggleHidden: () => void
  onDelete: () => void
}) {
  const { attributes, listeners, setNodeRef, style } = useSortableRow(folder.id)
  const [name, setName] = React.useState(folder.name)

  // A rename landing from elsewhere replaces what is in the box, unless this
  // is the box being typed in.
  React.useEffect(() => setName(folder.name), [folder.name])

  function commit() {
    const tidied = name.trim()
    if (!tidied || tidied === folder.name) {
      setName(folder.name)
      return
    }
    onRename(tidied)
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 rounded-md border p-2"
    >
      <button
        type="button"
        aria-label={`Reorder ${folder.name}`}
        className={cn(DRAG_HANDLE_CLASS, "shrink-0")}
        {...attributes}
        {...listeners}
      >
        <GripVerticalIcon className="size-4" />
      </button>
      <Input
        value={name}
        maxLength={CREATOR_FOLDER_NAME_MAX}
        disabled={busy}
        aria-label={`Name of ${folder.name}`}
        onChange={(event) => setName(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur()
          if (event.key === "Escape") setName(folder.name)
        }}
      />
      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
        {folder.creatorIds.length}
      </span>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label={folder.hidden ? "Show in panel" : "Hide from panel"}
            aria-pressed={folder.hidden}
            onClick={onToggleHidden}
          >
            {folder.hidden ? <EyeOffIcon /> : <EyeIcon />}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {folder.hidden ? "Show in panel" : "Hide from panel"}
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label={`Delete ${folder.name}`}
            onClick={onDelete}
          >
            <Trash2Icon />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Delete folder</TooltipContent>
      </Tooltip>
    </div>
  )
}
