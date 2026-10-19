import * as React from "react"
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  ChevronDownIcon,
  FolderInputIcon,
  FolderIcon,
  KanbanIcon,
  ListIcon,
  Loader2Icon,
  NotebookPenIcon,
  PinIcon,
  PinOffIcon,
  PlusIcon,
  SettingsIcon,
  TableIcon,
  Trash2Icon,
  Undo2Icon,
  XIcon,
} from "lucide-react"

import { NoteIcon } from "@/components/note-notes/note-icon"
import { NotesBoard, NotesList, NotesTable, type ViewSelection } from "@/components/note-notes/note-views"
import { FilterButton, GroupByButton, SetFieldButton, SortButton } from "@/components/note-notes/view-controls"
import { DashboardCardTitleHeader } from "@/components/shared/dashboard-card-header"
import {
  DashboardToolbarButton,
  dashboardToolbarButtonActiveClassName,
  dashboardToolbarButtonGroupClassName,
  dashboardToolbarButtonGroupItemClassName,
  DashboardToolbarSearch,
} from "@/components/shared/dashboard-toolbar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ErrorRow } from "@/components/ui/error-row"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { LoadingRow } from "@/components/ui/loading-row"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { formatShortTimeAgo } from "@/lib/format/format-time"
import { plural } from "@/lib/format/plural"
import type { NoteField, NoteFieldValue } from "@/lib/note/notes/fields"
import {
  NOTES_LIST_MAX,
  noteTitle,
  VIEW_NAME_MAX,
  type NoteCard,
  type NoteFolder,
  type NoteList,
  type NoteScope,
} from "@/lib/note/notes/notes"
import {
  applyView,
  EMPTY_VIEW_SETTINGS,
  VIEW_KIND_LABELS,
  type NoteView,
  type TotalKind,
  type ViewKind,
  type ViewSettings,
} from "@/lib/note/notes/views"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

/** The tab every folder has before any view is saved: the plain list. */
export const BUILT_IN_VIEW = "list"

export type ListPanelActions = {
  onPick: (note: NoteCard) => void
  onNewNote: (templateId: string | null) => void
  onRestoreFolder: (folderId: string) => void
  onEmptyTrash: () => void
  onRestoreNote: (note: NoteCard) => void
  onDeleteNote: (note: NoteCard) => void
  onMove: (ids: string[]) => void
  onPin: (ids: string[], pinned: boolean) => void
  onArchive: (ids: string[], archived: boolean) => void
  onTrash: (ids: string[]) => void
  onSetField: (ids: string[], field: NoteField, value: NoteFieldValue | null) => Promise<boolean>
  onBoardMove: (note: NoteCard, field: NoteField, optionId: string | null) => Promise<boolean>
  onFields: (folder: NoteFolder) => void
  onViewId: (viewId: string) => void
  onSaveView: (view: NoteView, kind: ViewKind, settings: ViewSettings) => Promise<boolean>
  onSaveViewAs: (name: string, kind: ViewKind, settings: ViewSettings) => Promise<boolean>
  onRenameView: (view: NoteView, name: string) => Promise<boolean>
  onMoveView: (view: NoteView, by: -1 | 1) => void
  onDeleteView: (view: NoteView) => void
}

type Draft = { kind: ViewKind; settings: ViewSettings }

function draftOf(view: NoteView | null): Draft {
  if (!view) return { kind: "list", settings: EMPTY_VIEW_SETTINGS }
  return {
    kind: view.kind,
    settings: { filters: view.filters, sort: view.sort, groupBy: view.groupBy, totals: view.totals },
  }
}

/**
 * The middle panel: which notes are showing, the folder's saved views as
 * tabs, the toolbar (search, filter, sort, list, table or board, New note),
 * a bar for the notes ticked, and the notes themselves. Changing a view's
 * filters or sort changes the screen at once; the tabs then offer Save and
 * Save as new view.
 */
export function NotesListPanel({
  title,
  scope,
  folder,
  list,
  loading,
  failure,
  onRetry,
  query,
  onQuery,
  pickedId,
  viewId,
  selection,
  creating,
  bulkBusy,
  actions,
}: {
  title: string
  scope: NoteScope
  /** The folder showing, or null for All notes, Loose notes, Archived and Trash. */
  folder: NoteFolder | null
  list: NoteList
  loading: boolean
  failure: string | null
  onRetry: () => void
  query: string
  onQuery: (query: string) => void
  pickedId: string | null
  viewId: string
  selection: ViewSelection & { clear: () => void }
  creating: boolean
  bulkBusy: boolean
  actions: ListPanelActions
}) {
  const fields = folder?.fields ?? []
  const savedView = folder?.views.find((view) => view.id === viewId) ?? null
  const base = draftOf(savedView)
  const baseKey = `${folder?.id ?? scope}:${viewId}:${JSON.stringify(base)}`
  const [draft, setDraft] = React.useState({ key: baseKey, ...base })
  if (draft.key !== baseKey) setDraft({ key: baseKey, ...base })
  const dirty = Boolean(folder) && JSON.stringify({ kind: draft.kind, settings: draft.settings }) !== JSON.stringify(base)

  function setSettings(patch: Partial<ViewSettings>) {
    setDraft((current) => ({ ...current, settings: { ...current.settings, ...patch } }))
  }

  const shown = folder ? applyView(list.notes, fields, draft.settings) : list.notes
  const shownIds = shown.map((note) => note.id)
  const picked = shownIds.filter((id) => selection.selected.has(id))
  const trash = scope === "trash"
  const kind: ViewKind = folder ? draft.kind : "list"
  const boardField =
    kind === "board"
      ? (fields.find((field) => field.key === draft.settings.groupBy && field.type === "select") ??
        fields.find((field) => field.type === "select") ??
        null)
      : null

  const empty = !shown.length && !(trash && list.trashedFolders.length)
  const emptyText = list.notes.length
    ? "No note matches these filters."
    : query.trim()
      ? "Nothing matches."
      : scope === "all"
        ? "No notes yet. New note makes one, and folders on the left keep them sorted."
        : scope === "loose"
          ? "Every note is in a folder."
          : scope === "archived"
            ? "Nothing archived. A note's menu has Archive."
            : trash
              ? "Trash is empty."
              : "No notes in this folder yet. New note makes one."

  const count = trash ? list.notes.length + list.trashedFolders.length : shown.length

  return (
    <>
      <DashboardCardTitleHeader
        icon={folder ? <NoteIcon icon={folder.icon} fallback={FolderIcon} /> : <NotebookPenIcon />}
        title={title}
        meta={`${count} ${trash ? plural(count, "item") : plural(count, "note")}`}
      />

      {folder ? (
        <ViewTabs
          folder={folder}
          viewId={viewId}
          dirty={dirty}
          onPick={actions.onViewId}
          onSave={() => savedView && void actions.onSaveView(savedView, draft.kind, draft.settings)}
          onSaveAs={(name) => actions.onSaveViewAs(name, draft.kind, draft.settings)}
          onRename={(view, name) => actions.onRenameView(view, name)}
          onMove={actions.onMoveView}
          onDelete={actions.onDeleteView}
        />
      ) : null}

      {picked.length && !trash ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b bg-muted/40 p-3" role="toolbar" aria-label="Picked notes">
          <span className="text-sm font-medium tabular-nums">
            {picked.length} {plural(picked.length, "note")} picked
          </span>
          <DashboardToolbarButton type="button" variant="outline" disabled={bulkBusy} onClick={() => actions.onMove(picked)}>
            <FolderInputIcon className="size-4" />
            Move to folder
          </DashboardToolbarButton>
          {folder && fields.length ? (
            <SetFieldButton fields={fields} busy={bulkBusy} onApply={(field, value) => actions.onSetField(picked, field, value)} />
          ) : null}
          <DashboardToolbarButton type="button" variant="outline" disabled={bulkBusy} onClick={() => actions.onPin(picked, true)}>
            <PinIcon className="size-4" />
            Pin
          </DashboardToolbarButton>
          <DashboardToolbarButton type="button" variant="outline" disabled={bulkBusy} onClick={() => actions.onPin(picked, false)}>
            <PinOffIcon className="size-4" />
            Unpin
          </DashboardToolbarButton>
          {scope === "archived" ? (
            <DashboardToolbarButton type="button" variant="outline" disabled={bulkBusy} onClick={() => actions.onArchive(picked, false)}>
              <ArchiveRestoreIcon className="size-4" />
              Unarchive
            </DashboardToolbarButton>
          ) : (
            <DashboardToolbarButton type="button" variant="outline" disabled={bulkBusy} onClick={() => actions.onArchive(picked, true)}>
              <ArchiveIcon className="size-4" />
              Archive
            </DashboardToolbarButton>
          )}
          <DashboardToolbarButton type="button" variant="outline" disabled={bulkBusy} onClick={() => actions.onTrash(picked)}>
            <Trash2Icon className="size-4" />
            Move to Trash
          </DashboardToolbarButton>
          {bulkBusy ? <Loader2Icon className="size-4 animate-spin" /> : null}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" variant="ghost" size="icon" className="ml-auto" aria-label="Unpick every note" onClick={selection.clear}>
                <XIcon />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Unpick every note</TooltipContent>
          </Tooltip>
        </div>
      ) : null}

      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b p-3">
        <DashboardToolbarSearch
          className="min-w-40 flex-1 sm:flex-1"
          aria-label="Search titles, text and field values"
          placeholder="Search"
          value={query}
          onChange={(event) => onQuery(event.target.value)}
        />
        {folder ? (
          <>
            <FilterButton fields={fields} filters={draft.settings.filters} onChange={(filters) => setSettings({ filters })} />
            {kind !== "table" ? (
              <SortButton fields={fields} sort={draft.settings.sort} onChange={(sort) => setSettings({ sort })} />
            ) : null}
            {kind === "board" ? (
              <GroupByButton fields={fields} groupBy={boardField?.key ?? null} onChange={(groupBy) => setSettings({ groupBy })} />
            ) : null}
            <div className={dashboardToolbarButtonGroupClassName} role="group" aria-label="Show as">
              {(["list", "table", "board"] as const).map((each) => (
                <Tooltip key={each}>
                  <TooltipTrigger asChild>
                    <DashboardToolbarButton
                      type="button"
                      variant="ghost"
                      className={cn(dashboardToolbarButtonGroupItemClassName, kind === each && dashboardToolbarButtonActiveClassName)}
                      aria-pressed={kind === each}
                      aria-label={`Show as ${VIEW_KIND_LABELS[each].toLowerCase()}`}
                      onClick={() => setDraft((current) => ({ ...current, kind: each }))}
                    >
                      {each === "list" ? <ListIcon className="size-4" /> : each === "table" ? <TableIcon className="size-4" /> : <KanbanIcon className="size-4" />}
                    </DashboardToolbarButton>
                  </TooltipTrigger>
                  <TooltipContent>Show as {VIEW_KIND_LABELS[each].toLowerCase()}</TooltipContent>
                </Tooltip>
              ))}
            </div>
          </>
        ) : null}
        {trash ? (
          <DashboardToolbarButton type="button" variant="destructive" onClick={actions.onEmptyTrash}>
            <Trash2Icon className="size-4" />
            Empty trash
          </DashboardToolbarButton>
        ) : scope !== "archived" ? (
          <NewNoteButton folder={folder} creating={creating} onNew={actions.onNewNote} />
        ) : null}
      </div>

      {failure ? (
        <ErrorRow message={failure} onRetry={onRetry} />
      ) : loading ? (
        <LoadingRow label="Loading notes" />
      ) : trash ? (
        <TrashList list={list} actions={actions} emptyText={empty ? emptyText : null} />
      ) : empty ? (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">{emptyText}</p>
      ) : kind === "board" && folder ? (
        boardField ? (
          <NotesBoard
            notes={shown}
            field={boardField}
            fields={fields}
            pickedId={pickedId}
            onPick={actions.onPick}
            onMove={(note, optionId) => actions.onBoardMove(note, boardField, optionId)}
          />
        ) : (
          <div className="grid justify-items-center gap-3 px-4 py-8 text-center text-sm text-muted-foreground">
            <p>Add a choice field to use a board. Its options become the columns.</p>
            <Button type="button" variant="outline" onClick={() => actions.onFields(folder)}>
              <SettingsIcon />
              Open the folder's fields
            </Button>
          </div>
        )
      ) : kind === "table" && folder ? (
        <NotesTable
          notes={shown}
          fields={fields}
          pickedId={pickedId}
          sort={draft.settings.sort}
          totals={draft.settings.totals}
          selection={selection}
          onPick={actions.onPick}
          onTrash={(note) => actions.onTrash([note.id])}
          onSort={(sort) => setSettings({ sort })}
          onTotal={(key, total: TotalKind | null) => {
            const totals = { ...draft.settings.totals }
            if (total) totals[key] = total
            else delete totals[key]
            setSettings({ totals })
          }}
        />
      ) : (
        <ScrollArea className="min-h-0 flex-1">
          <NotesList
            notes={shown}
            fields={fields}
            pickedId={pickedId}
            showFolder={!folder}
            selection={selection}
            onPick={actions.onPick}
          />
          {list.more ? (
            <p className="px-4 pb-4 text-center text-xs text-muted-foreground">
              Showing the first {NOTES_LIST_MAX.toLocaleString("en")} notes. Search or pick a folder to see the rest.
            </p>
          ) : null}
        </ScrollArea>
      )}
    </>
  )
}

function NewNoteButton({
  folder,
  creating,
  onNew,
}: {
  folder: NoteFolder | null
  creating: boolean
  onNew: (templateId: string | null) => void
}) {
  const icon = creating ? <Loader2Icon className="size-4 animate-spin" /> : <PlusIcon className="size-4" />
  if (!folder?.templates.length) {
    return (
      <DashboardToolbarButton type="button" disabled={creating} onClick={() => onNew(null)}>
        {icon}
        New note
      </DashboardToolbarButton>
    )
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <DashboardToolbarButton type="button" disabled={creating}>
          {icon}
          New note
          <ChevronDownIcon className="size-4" />
        </DashboardToolbarButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => onNew(null)}>Blank</DropdownMenuItem>
        <DropdownMenuSeparator />
        {folder.templates.map((template) => (
          <DropdownMenuItem key={template.id} onSelect={() => onNew(template.id)}>
            {template.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** The folder's saved views as pill tabs, the plain List first. */
function ViewTabs({
  folder,
  viewId,
  dirty,
  onPick,
  onSave,
  onSaveAs,
  onRename,
  onMove,
  onDelete,
}: {
  folder: NoteFolder
  viewId: string
  dirty: boolean
  onPick: (viewId: string) => void
  onSave: () => void
  onSaveAs: (name: string) => Promise<boolean>
  onRename: (view: NoteView, name: string) => Promise<boolean>
  onMove: (view: NoteView, by: -1 | 1) => void
  onDelete: (view: NoteView) => void
}) {
  const active = folder.views.find((view) => view.id === viewId) ?? null
  const [renaming, setRenaming] = React.useState(false)
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b px-3 py-2">
      <Tabs value={active ? active.id : BUILT_IN_VIEW} onValueChange={onPick} className="min-w-0">
        <ScrollArea className="max-w-full">
          <TabsList className="justify-start">
            <TabsTrigger value={BUILT_IN_VIEW}>List</TabsTrigger>
            {folder.views.map((view) => (
              <TabsTrigger key={view.id} value={view.id}>
                {view.name}
              </TabsTrigger>
            ))}
          </TabsList>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </Tabs>
      {active ? (
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="ghost" size="icon-sm" aria-label={`Settings for the ${active.name} view`}>
                  <SettingsIcon />
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent>View settings</TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onSelect={() => setRenaming(true)}>Rename…</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onMove(active, -1)}>Move left</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onMove(active, 1)}>Move right</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => onDelete(active)}>
              <Trash2Icon />
              Delete view
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
      <div className="ml-auto flex items-center gap-2">
        {dirty && active ? (
          <Button type="button" variant="outline" size="sm" onClick={onSave}>
            Save
          </Button>
        ) : null}
        <NamePopover
          label={dirty ? "Save as new view" : "New view"}
          heading="Name the view"
          placeholder="To read"
          icon={dirty ? null : <PlusIcon />}
          onSubmit={onSaveAs}
        />
      </div>
      {active && renaming ? (
        <NamePopover
          label="Rename view"
          heading="New name"
          placeholder={active.name}
          initial={active.name}
          defaultOpen
          hiddenTrigger
          onClose={() => setRenaming(false)}
          onSubmit={async (name) => {
            const ok = await onRename(active, name)
            if (ok) setRenaming(false)
            return ok
          }}
        />
      ) : null}
    </div>
  )
}

function NamePopover({
  label,
  heading,
  placeholder,
  initial = "",
  icon,
  defaultOpen = false,
  hiddenTrigger = false,
  onClose,
  onSubmit,
}: {
  label: string
  heading: string
  placeholder: string
  initial?: string
  icon?: React.ReactNode
  defaultOpen?: boolean
  hiddenTrigger?: boolean
  onClose?: () => void
  onSubmit: (name: string) => Promise<boolean>
}) {
  const [open, setOpen] = React.useState(defaultOpen)
  const [name, setName] = React.useState(initial)
  const [busy, setBusy] = React.useState(false)
  const [invalid, setInvalid] = React.useState(false)
  const id = React.useId()
  async function submit() {
    if (!name.trim()) {
      setInvalid(true)
      showErrorToast("Give the view a name")
      return
    }
    setBusy(true)
    const ok = await onSubmit(name)
    setBusy(false)
    if (ok) {
      setOpen(false)
      setName(initial)
    } else setInvalid(true)
  }
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) onClose?.()
      }}
    >
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" className={hiddenTrigger ? "sr-only" : undefined}>
          {icon}
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="grid w-72 gap-2 p-3">
        <Label htmlFor={id}>{heading}</Label>
        <Input
          id={id}
          autoFocus
          value={name}
          maxLength={VIEW_NAME_MAX}
          placeholder={placeholder}
          aria-invalid={invalid || undefined}
          onChange={(event) => {
            setName(event.target.value)
            setInvalid(false)
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault()
              void submit()
            }
          }}
        />
        <Button type="button" size="sm" disabled={busy} onClick={() => void submit()}>
          {busy ? <Loader2Icon className="animate-spin" /> : null}
          Save view
        </Button>
      </PopoverContent>
    </Popover>
  )
}

/** Trash: folders that went there with their notes, then notes on their own. */
function TrashList({
  list,
  actions,
  emptyText,
}: {
  list: NoteList
  actions: ListPanelActions
  emptyText: string | null
}) {
  if (emptyText) return <p className="px-4 py-8 text-center text-sm text-muted-foreground">{emptyText}</p>
  return (
    <ScrollArea className="min-h-0 flex-1">
      <ul aria-label="Trash" className="grid gap-2 p-3">
        {list.trashedFolders.map((folder) => (
          <li key={folder.id} className="flex min-w-0 items-center gap-3 rounded-lg border bg-card p-3">
            <FolderIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
            <span className="grid min-w-0 flex-1">
              <span className="truncate text-sm font-medium">{folder.name}</span>
              <span suppressHydrationWarning className="text-xs text-muted-foreground">
                Folder with {folder.noteCount} {plural(folder.noteCount, "note")}, deleted {formatShortTimeAgo(folder.deletedAt)}
              </span>
            </span>
            <Button type="button" variant="outline" size="sm" onClick={() => actions.onRestoreFolder(folder.id)}>
              <Undo2Icon />
              Restore
            </Button>
          </li>
        ))}
        {list.notes.map((note) => (
          <li key={note.id} data-note-id={note.id} className="flex min-w-0 items-center gap-3 rounded-lg border bg-card p-3">
            <NoteIcon icon={note.icon} className="text-muted-foreground" />
            <button type="button" onClick={() => actions.onPick(note)} className="grid min-w-0 flex-1 text-left">
              <span className="truncate text-sm font-medium">{noteTitle(note.title)}</span>
              <span suppressHydrationWarning className="text-xs text-muted-foreground">
                {note.folderName ?? "No folder"}, deleted {note.deletedAt ? formatShortTimeAgo(note.deletedAt) : ""}
              </span>
            </button>
            <Button type="button" variant="outline" size="sm" onClick={() => actions.onRestoreNote(note)}>
              <Undo2Icon />
              Restore
            </Button>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button type="button" variant="ghost" size="icon-sm" aria-label={`Delete ${noteTitle(note.title)} for good`} onClick={() => actions.onDeleteNote(note)}>
                  <Trash2Icon />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Delete for good</TooltipContent>
            </Tooltip>
          </li>
        ))}
      </ul>
    </ScrollArea>
  )
}
