import * as React from "react"
import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  type DragMoveEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core"
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable"
import {
  ArchiveIcon,
  ChevronRightIcon,
  ClockIcon,
  FileUpIcon,
  FolderIcon,
  FolderInputIcon,
  FolderPlusIcon,
  GripVerticalIcon,
  LayoutTemplateIcon,
  ListPlusIcon,
  PlusIcon,
  SettingsIcon,
  Trash2Icon,
} from "lucide-react"
import { toast } from "sonner"

import { FolderSelect } from "@/components/note-notes/folder-select"
import { IconPicker, NoteIcon } from "@/components/note-notes/note-icon"
import { DRAG_HANDLE_CLASS, useNavSensors, useSortableRow } from "@/components/settings/nav-editor-shared"
import { DashboardCardTitleHeader } from "@/components/shared/dashboard-card-header"
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { getNotesErrorMessage } from "@/lib/api/note/notes"
import {
  createNotesFolder,
  moveNotesFolder,
  trashNotesFolder,
  updateNotesFolder,
} from "@/lib/api/note/notes-folders"
import { plural } from "@/lib/format/plural"
import { focusRing } from "@/lib/layout/focus-ring"
import { useEffectBeforePaint } from "@/lib/hooks/use-effect-before-paint"
import {
  cleanFolderName,
  folderAndBelow,
  NOTES_FOLDER_NAME_MAX,
  noteTitle,
  TRASH_DAYS,
  type NoteCard,
  type NoteFolder,
  type NoteFolderTree,
  type NoteScope,
} from "@/lib/note/notes/notes"
import { dropProjection, folderRows } from "@/lib/note/notes/tree"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

/** How far a folder sits in for each level, and how far a drag must go sideways to change level. */
const INDENT = 16
const COLLAPSED_KEY = "note-notes-collapsed-folders"

type FolderPanelActions = {
  onPick: (scope: NoteScope) => void
  onOpenNote: (id: string) => void
  onTreeChanged: (tree: NoteFolderTree) => void
  onFields: (folder: NoteFolder) => void
  onTemplates: (folder: NoteFolder) => void
  onImport: (folder: NoteFolder) => void
  /** A folder went to Trash with what was in it. */
  onTrashed: (folderIds: Set<string>, tree: NoteFolderTree) => void
}

/**
 * The left panel. Recently opened on top, then All notes and Loose notes,
 * then the folders as a tree, then Archived and Trash at the foot.
 *
 * A folder is dragged by its handle: up and down to reorder, and to the
 * right to put it inside the folder above (dnd-kit's sortable tree). "Move
 * into…" in its menu does the same without a mouse. Deleting a folder sends
 * it, the folders inside and every note in them to Trash together (Tyler,
 * 18 Oct 2026).
 */
export function NotesFoldersPanel({
  tree,
  recent,
  scope,
  openId,
  actions,
}: {
  tree: NoteFolderTree
  recent: NoteCard[]
  scope: NoteScope
  openId: string | null
  actions: FolderPanelActions
}) {
  const sensors = useNavSensors()
  const [collapsed, setCollapsed] = useRememberedSet(COLLAPSED_KEY)
  const [naming, setNaming] = React.useState<{ parentId: string | null } | null>(null)
  const [newName, setNewName] = React.useState("")
  const [newInvalid, setNewInvalid] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [renamingId, setRenamingId] = React.useState<string | null>(null)
  const [deleting, setDeleting] = React.useState<NoteFolder | null>(null)
  const [movingInto, setMovingInto] = React.useState<NoteFolder | null>(null)
  const [drag, setDrag] = React.useState<{ activeId: string; overId: string; offset: number } | null>(null)

  /** The tree on screen. A drag moves it at once; a refused save puts it back. */
  const [shown, setShown] = React.useState({ from: tree, folders: tree.folders })
  if (shown.from !== tree) setShown({ from: tree, folders: tree.folders })
  const folders = shown.folders

  // While a folder is dragged, what is inside it rides along out of sight.
  const hidden = React.useMemo(() => {
    const out = new Set(collapsed)
    if (drag) out.add(drag.activeId)
    return out
  }, [collapsed, drag])
  const rows = folderRows(folders, hidden)
  const flat = rows.map((row) => ({ id: row.folder.id, parentId: row.folder.parentId, depth: row.depth }))
  const projection = drag ? dropProjection(flat, drag.activeId, drag.overId, drag.offset, INDENT) : null

  async function run(work: () => Promise<NoteFolderTree | void>, success?: string) {
    setBusy(true)
    dismissErrorToast()
    try {
      const fresh = await work()
      if (fresh) actions.onTreeChanged(fresh)
      if (success) toast.success(success)
      return true
    } catch (error) {
      showErrorToast(getNotesErrorMessage(error))
      return false
    } finally {
      setBusy(false)
    }
  }

  async function create(event: React.FormEvent) {
    event.preventDefault()
    if (!naming || busy) return
    let name: string
    try {
      name = cleanFolderName(newName)
    } catch (error) {
      setNewInvalid(true)
      showErrorToast(getNotesErrorMessage(error))
      return
    }
    const parentId = naming.parentId
    const ok = await run(async () => (await createNotesFolder(name, parentId)).tree)
    if (ok) {
      setNaming(null)
      setNewName("")
      if (parentId) setCollapsed(parentId, false)
    } else setNewInvalid(true)
  }

  function onDragStart(event: DragStartEvent) {
    const id = String(event.active.id)
    setDrag({ activeId: id, overId: id, offset: 0 })
  }
  function onDragMove(event: DragMoveEvent) {
    setDrag((current) => (current ? { ...current, offset: event.delta.x } : current))
  }
  function onDragOver(event: DragOverEvent) {
    const over = event.over ? String(event.over.id) : null
    setDrag((current) => (current && over ? { ...current, overId: over } : current))
  }
  async function onDragEnd(event: DragEndEvent) {
    const landing = drag && event.over ? dropProjection(flat, drag.activeId, String(event.over.id), event.delta.x, INDENT) : null
    const activeId = drag?.activeId
    setDrag(null)
    if (!landing || !activeId) return
    const folder = folders.find((each) => each.id === activeId)
    if (!folder) return
    const samePlace =
      folder.parentId === landing.parentId &&
      siblingsOf(folders, landing.parentId).map((each) => each.id).join() === landing.orderedIds.join()
    if (samePlace) return
    const before = folders
    // The screen moves first and comes back if the save is refused.
    setShown((current) => ({
      ...current,
      folders: current.folders.map((each) => {
        const at = landing.orderedIds.indexOf(each.id)
        if (each.id === activeId) return { ...each, parentId: landing.parentId, position: at }
        return at >= 0 ? { ...each, position: at } : each
      }),
    }))
    const ok = await run(() => moveNotesFolder(activeId, landing.parentId, landing.orderedIds))
    if (!ok) setShown((current) => ({ ...current, folders: before }))
    else if (landing.parentId) setCollapsed(landing.parentId, false)
  }

  async function confirmDelete() {
    if (!deleting) return
    const folder = deleting
    const below = folderAndBelow(folders, folder.id)
    await run(async () => {
      const result = await trashNotesFolder(folder.id)
      actions.onTrashed(below, result.tree)
      setDeleting(null)
      toast.success(
        result.notes || result.folders > 1
          ? `Moved “${folder.name}” to Trash with ${describeContents(result.notes, result.folders - 1)}.`
          : `Moved “${folder.name}” to Trash.`
      )
    })
  }

  const deletingBelow = deleting ? folderAndBelow(folders, deleting.id) : null
  const deletingNotes = deleting
    ? folders.filter((each) => deletingBelow?.has(each.id)).reduce((sum, each) => sum + each.noteCount, 0)
    : 0

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
                variant={naming?.parentId === null ? "secondary" : "ghost"}
                size="icon"
                aria-label="New folder"
                aria-pressed={naming?.parentId === null}
                onClick={() => {
                  setNaming((current) => (current?.parentId === null ? null : { parentId: null }))
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
        <form className="grid shrink-0 gap-2 border-b p-3" onSubmit={(event) => void create(event)}>
          <Label htmlFor="note-notes-new-folder">
            {naming.parentId ? `New folder inside “${folders.find((each) => each.id === naming.parentId)?.name}”` : "Folder name"}
          </Label>
          <div className="flex gap-2">
            <Input
              id="note-notes-new-folder"
              autoFocus
              placeholder="Books"
              value={newName}
              maxLength={NOTES_FOLDER_NAME_MAX}
              aria-invalid={newInvalid || undefined}
              onChange={(event) => {
                setNewName(event.target.value)
                setNewInvalid(false)
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  setNaming(null)
                  setNewName("")
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
        {recent.length ? (
          <section aria-label="Recently opened" className="border-b py-1">
            <h3 className="flex items-center gap-1.5 px-3 pt-1 pb-0.5 text-xs font-medium text-muted-foreground">
              <ClockIcon aria-hidden className="size-3.5" />
              Recently opened
            </h3>
            <ul>
              {recent.map((note) => (
                <li key={note.id}>
                  <button
                    type="button"
                    aria-current={openId === note.id || undefined}
                    onClick={() => actions.onOpenNote(note.id)}
                    className={cn(
                      "flex h-8 w-full items-center gap-2 px-3 text-left text-sm hover:bg-muted/50 aria-[current]:bg-muted",
                      focusRing
                    )}
                  >
                    <NoteIcon icon={note.icon} className="text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{noteTitle(note.title)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <ScopeRow name="All notes" count={tree.counts.all} selected={scope === "all"} onPick={() => actions.onPick("all")} />
        <ScopeRow
          name="Loose notes"
          count={tree.counts.loose}
          selected={scope === "loose"}
          onPick={() => actions.onPick(scope === "loose" ? "all" : "loose")}
        />

        {rows.length ? (
          <DndContext
            id="note-notes-folders"
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={onDragStart}
            onDragMove={onDragMove}
            onDragOver={onDragOver}
            onDragEnd={(event) => void onDragEnd(event)}
            onDragCancel={() => setDrag(null)}
          >
            <SortableContext items={rows.map((row) => row.folder.id)} strategy={verticalListSortingStrategy}>
              <ul aria-label="Folders">
                {rows.map((row) => (
                  <FolderRow
                    key={row.folder.id}
                    folder={row.folder}
                    depth={drag?.activeId === row.folder.id && projection ? projection.depth : row.depth}
                    hasChildren={row.hasChildren}
                    arrowSlot={rows.some((each) => each.hasChildren)}
                    open={!collapsed.has(row.folder.id)}
                    selected={scope === row.folder.id}
                    renaming={renamingId === row.folder.id}
                    onToggle={() => setCollapsed(row.folder.id, !collapsed.has(row.folder.id))}
                    onPick={() => actions.onPick(scope === row.folder.id ? "all" : row.folder.id)}
                    onStartRename={() => setRenamingId(row.folder.id)}
                    onStopRename={() => setRenamingId(null)}
                    onRename={(name) => run(() => updateNotesFolder(row.folder.id, { name }))}
                    onIcon={(icon) => void run(() => updateNotesFolder(row.folder.id, { icon }))}
                    onNewInside={() => {
                      setNaming({ parentId: row.folder.id })
                      setNewName("")
                      setNewInvalid(false)
                    }}
                    onMoveInto={() => setMovingInto(row.folder)}
                    onFields={() => actions.onFields(row.folder)}
                    onTemplates={() => actions.onTemplates(row.folder)}
                    onImport={() => actions.onImport(row.folder)}
                    onDelete={() => setDeleting(row.folder)}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        ) : (
          <p className="px-4 py-6 text-center text-xs text-muted-foreground">
            No folders yet. The + above makes one. Each folder can have its own fields, like a Notion database.
          </p>
        )}

        <div className="mt-2 border-t">
          <ScopeRow
            name="Archived"
            icon={<ArchiveIcon aria-hidden className="size-4 text-muted-foreground" />}
            count={tree.counts.archived}
            selected={scope === "archived"}
            onPick={() => actions.onPick(scope === "archived" ? "all" : "archived")}
          />
          <ScopeRow
            name="Trash"
            icon={<Trash2Icon aria-hidden className="size-4 text-muted-foreground" />}
            count={tree.counts.trash}
            selected={scope === "trash"}
            onPick={() => actions.onPick(scope === "trash" ? "all" : "trash")}
          />
        </div>
      </ScrollArea>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
        title={`Move “${deleting?.name ?? ""}” to Trash?`}
        description={
          deleting
            ? `${
                deletingNotes || (deletingBelow?.size ?? 1) > 1
                  ? `It goes with ${describeContents(deletingNotes, (deletingBelow?.size ?? 1) - 1)}. `
                  : ""
              }Restoring it from Trash within ${TRASH_DAYS} days brings everything back with its fields.`
            : ""
        }
        confirmLabel="Move to Trash"
        loading={busy}
        onConfirm={() => void confirmDelete()}
      />

      <MoveIntoDialog
        folder={movingInto}
        folders={folders}
        busy={busy}
        onClose={() => setMovingInto(null)}
        onMove={async (parentId) => {
          if (!movingInto) return
          const order = [...siblingsOf(folders, parentId).filter((each) => each.id !== movingInto.id).map((each) => each.id), movingInto.id]
          const ok = await run(
            () => moveNotesFolder(movingInto.id, parentId, order),
            parentId ? `Moved “${movingInto.name}” inside “${folders.find((each) => each.id === parentId)?.name}”.` : `Moved “${movingInto.name}” to the top level.`
          )
          if (ok) setMovingInto(null)
        }}
      />
    </>
  )
}

function siblingsOf(folders: NoteFolder[], parentId: string | null) {
  return folders.filter((each) => each.parentId === parentId).sort((a, b) => a.position - b.position)
}

function describeContents(notes: number, folders: number) {
  const parts = [
    notes ? `${notes} ${plural(notes, "note")}` : null,
    folders ? `${folders} ${plural(folders, "folder")} inside` : null,
  ].filter(Boolean)
  return parts.join(" and ")
}

/**
 * Which folders this browser keeps shut, remembered between visits. Read a
 * beat after the first draw, the way `useRememberedChoice` does, so the
 * server's page and the browser's agree.
 */
function useRememberedSet(key: string): [ReadonlySet<string>, (id: string, shut: boolean) => void] {
  const [ids, setIds] = React.useState<ReadonlySet<string>>(() => new Set())
  useEffectBeforePaint(() => {
    try {
      const stored = JSON.parse(window.localStorage.getItem(key) ?? "[]")
      if (Array.isArray(stored)) setIds(new Set(stored.filter((each): each is string => typeof each === "string")))
    } catch {
      // A blocked or garbled store leaves every folder open.
    }
  }, [key])
  const set = React.useCallback(
    (id: string, shut: boolean) => {
      setIds((current) => {
        const next = new Set(current)
        if (shut) next.add(id)
        else next.delete(id)
        try {
          window.localStorage.setItem(key, JSON.stringify([...next]))
        } catch {
          // Only the remembering is lost.
        }
        return next
      })
    },
    [key]
  )
  return [ids, set]
}

function ScopeRow({
  name,
  icon,
  count,
  selected,
  onPick,
}: {
  name: string
  icon?: React.ReactNode
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
      {icon}
      <span className="min-w-0 flex-1 truncate">{name}</span>
      <span className="text-xs font-normal text-muted-foreground tabular-nums">{count}</span>
    </button>
  )
}

function FolderRow({
  folder,
  depth,
  hasChildren,
  arrowSlot,
  open,
  selected,
  renaming,
  onToggle,
  onPick,
  onStartRename,
  onStopRename,
  onRename,
  onIcon,
  onNewInside,
  onMoveInto,
  onFields,
  onTemplates,
  onImport,
  onDelete,
}: {
  folder: NoteFolder
  depth: number
  hasChildren: boolean
  /** Some folder has folders inside, so every row keeps room for the arrow and they line up. */
  arrowSlot: boolean
  open: boolean
  selected: boolean
  renaming: boolean
  onToggle: () => void
  onPick: () => void
  onStartRename: () => void
  onStopRename: () => void
  onRename: (name: string) => Promise<boolean>
  onIcon: (icon: string | null) => void
  onNewInside: () => void
  onMoveInto: () => void
  onFields: () => void
  onTemplates: () => void
  onImport: () => void
  onDelete: () => void
}) {
  const { attributes, listeners, setNodeRef, style } = useSortableRow(folder.id)
  const [draft, setDraft] = React.useState(folder.name)
  const [invalid, setInvalid] = React.useState(false)
  const [saving, setSaving] = React.useState(false)

  async function commit() {
    if (saving) return
    let cleaned: string
    try {
      cleaned = cleanFolderName(draft)
    } catch (error) {
      setInvalid(true)
      showErrorToast(getNotesErrorMessage(error))
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
    else setInvalid(true)
  }

  return (
    <li
      ref={setNodeRef}
      style={{ ...style, paddingLeft: `${depth * INDENT + 4}px` }}
      className={cn("flex h-9 items-center gap-0.5 border-b pr-1.5", selected ? "bg-muted" : "hover:bg-muted/50")}
    >
      <button type="button" aria-label={`Move ${folder.name}`} className={cn(DRAG_HANDLE_CLASS, "size-6 shrink-0")} {...attributes} {...listeners}>
        <GripVerticalIcon className="size-3.5" />
      </button>
      {hasChildren ? (
        <button
          type="button"
          aria-label={open ? `Shut ${folder.name}` : `Open ${folder.name}`}
          aria-expanded={open}
          onClick={onToggle}
          className={cn("flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted", focusRing)}
        >
          <ChevronRightIcon className={cn("size-3.5 transition-transform motion-reduce:transition-none", open && "rotate-90")} />
        </button>
      ) : arrowSlot ? (
        <span aria-hidden className="size-6 shrink-0" />
      ) : null}
      <IconPicker icon={folder.icon} label={`Icon for ${folder.name}`} size="icon-xs" empty={FolderIcon} onPick={onIcon} />
      {renaming ? (
        <Input
          autoFocus
          value={draft}
          maxLength={NOTES_FOLDER_NAME_MAX}
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
          className={cn("flex h-full min-w-0 flex-1 items-center gap-2 rounded-sm px-1 text-left text-sm font-medium", focusRing)}
        >
          <span className="min-w-0 flex-1 truncate">{folder.name}</span>
          <span className="text-xs font-normal text-muted-foreground tabular-nums">{folder.noteCount}</span>
        </button>
      )}
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" size="icon-xs" aria-label={`Settings for ${folder.name}`}>
                <SettingsIcon />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>Settings for {folder.name}</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={onFields}>
            <ListPlusIcon />
            Fields…
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onTemplates}>
            <LayoutTemplateIcon />
            Templates…
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onImport}>
            <FileUpIcon />
            Import Markdown…
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => {
              setDraft(folder.name)
              setInvalid(false)
              onStartRename()
            }}
          >
            <SettingsIcon />
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onNewInside}>
            <FolderPlusIcon />
            New folder inside
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onMoveInto}>
            <FolderInputIcon />
            Move into…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button type="button" variant="ghost" size="icon-xs" aria-label={`Delete ${folder.name}`} onClick={onDelete}>
            <Trash2Icon />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Delete {folder.name}</TooltipContent>
      </Tooltip>
    </li>
  )
}

/** "Move into…": the same move as dragging a folder, without a mouse. */
function MoveIntoDialog({
  folder,
  folders,
  busy,
  onClose,
  onMove,
}: {
  folder: NoteFolder | null
  folders: NoteFolder[]
  busy: boolean
  onClose: () => void
  onMove: (parentId: string | null) => Promise<void>
}) {
  const [target, setTarget] = React.useState<string | null>(null)
  const [shownFor, setShownFor] = React.useState<string | null>(null)
  if ((folder?.id ?? null) !== shownFor) {
    setShownFor(folder?.id ?? null)
    setTarget(folder?.parentId ?? null)
  }
  const blocked = React.useMemo(() => (folder ? folderAndBelow(folders, folder.id) : new Set<string>()), [folder, folders])
  return (
    <Dialog
      open={folder !== null}
      onOpenChange={(next) => {
        if (!next && !busy) onClose()
      }}
    >
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>Move “{folder?.name}”</DialogTitle>
          <DialogDescription>Its notes, fields and the folders inside it go with it.</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <div className="grid gap-2">
            <Label htmlFor="note-move-folder-into">Put it inside</Label>
            <FolderSelect id="note-move-folder-into" folders={folders} value={target} exceptIds={blocked} noneLabel="The top level" onChange={setTarget} />
          </div>
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" size="lg" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" size="lg" disabled={busy} onClick={() => void onMove(target)}>
            Move folder
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
