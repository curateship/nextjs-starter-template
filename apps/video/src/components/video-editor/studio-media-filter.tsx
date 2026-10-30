import * as React from "react"
import {
  AudioLinesIcon,
  BookmarkIcon,
  CheckIcon,
  FunnelIcon,
  ImageIcon,
  Loader2Icon,
  SettingsIcon,
  Trash2Icon,
  VideoIcon,
} from "lucide-react"
import { ContextMenu as ContextMenuPrimitive } from "radix-ui"
import { toast } from "sonner"

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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  CONTEXT_MENU_CONTENT_CLASS,
  CONTEXT_MENU_DESTRUCTIVE_ITEM_CLASS,
  CONTEXT_MENU_ITEM_CLASS,
} from "@/components/shared/editor-media-context-menu"
import {
  SaveViewDialog,
  type SavedViewsScreen,
} from "@/components/shared/saved-views"
import { CollectionNameDialog } from "@/components/video-editor/studio-media-collections"
import { describeAuthError } from "@/lib/api/error-message"
import {
  deleteView,
  loadSavedViews,
  updateView,
  type SavedView,
} from "@/lib/api/saved-views"
import {
  deleteMediaCollection,
  getVideoMediaErrorMessage,
  type MediaCollectionSummary,
} from "@/lib/api/video/media"
import { plural } from "@/lib/format/plural"
import { SAVED_VIEW_LIMITS, savedViewScreen } from "@/lib/saved-views"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"
import {
  describeMediaView,
  emptyMediaFilter,
  MEDIA_SAVED_VIEW_RECORD,
  mediaTypeLabels,
  mediaViewFilters,
  readMediaTypes,
  type MediaFilterKind,
  type MediaFilterValue,
  type MediaType,
} from "@/lib/video/media-saved-views"

/**
 * The media filter: a funnel in a panel's header that opens one menu with
 * the person's saved views, the Type row (any number of its types), the
 * Collection list with a count beside each, Save view and Clear filters. A
 * dot on the funnel says a filter is set. The video editor's Media panel and
 * the carousel editor's Image panel both use it, each drawn from one of
 * Tyler's pictures of 29 Oct 2026 (`workspace/docs/media-panel.md`).
 */

const TYPE_ICONS: Record<MediaType, React.ComponentType<{ className?: string }>> = {
  video: VideoIcon,
  image: ImageIcon,
  audio: AudioLinesIcon,
}

function filtersOf(kind: MediaFilterKind, value: MediaFilterValue) {
  return mediaViewFilters(
    { types: value.types.join(","), collection: value.collection },
    kind
  )
}

function sameFilter(
  kind: MediaFilterKind,
  a: MediaFilterValue,
  b: MediaFilterValue
) {
  const left = filtersOf(kind, a)
  const right = filtersOf(kind, b)
  return left.types === right.types && left.collection === right.collection
}

function viewValue(kind: MediaFilterKind, view: SavedView): MediaFilterValue {
  return {
    types: readMediaTypes(view.filters.types, kind.types),
    collection:
      typeof view.filters.collection === "string"
        ? view.filters.collection
        : kind.defaultCollection,
  }
}

function describeError(error: unknown) {
  const message = error instanceof Error ? error.message : ""
  return (
    describeAuthError(message) ??
    (message || "The view could not be saved. Try again.")
  )
}

/** The person's views on one menu, fetched once and again after every change. */
function useMediaViews(screen: string, enabled: boolean) {
  const [views, setViews] = React.useState<SavedView[]>([])
  const [version, setVersion] = React.useState(0)
  const reload = React.useCallback(() => setVersion((count) => count + 1), [])
  React.useEffect(() => {
    if (!enabled) return
    let active = true
    loadSavedViews(screen)
      .then((loaded) => {
        if (active) setViews(loaded)
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [enabled, screen, version])
  return { views, reload }
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-4 pt-3 pb-2 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
      {children}
    </div>
  )
}

/** One row of the Views or Collection list: a name, a count, a tick. */
function ChoiceRow({
  label,
  count,
  on,
  onSelect,
}: {
  label: string
  count?: number
  on: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onSelect}
      className={cn(
        "flex h-9 w-full items-center gap-2 rounded-md px-3 text-left text-sm hover:bg-accent",
        on && "bg-accent"
      )}
    >
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count !== undefined ? (
        <span className="text-muted-foreground tabular-nums">{count}</span>
      ) : null}
      <CheckIcon
        className={cn("size-4 shrink-0 text-(--acc)", !on && "invisible")}
      />
    </button>
  )
}

/** Right-click on a row: Rename and Delete. */
function RowMenu({
  children,
  onRename,
  onDelete,
}: {
  children: React.ReactElement
  onRename: () => void
  onDelete: () => void
}) {
  return (
    <ContextMenuPrimitive.Root>
      <ContextMenuPrimitive.Trigger asChild>{children}</ContextMenuPrimitive.Trigger>
      <ContextMenuPrimitive.Portal>
        <ContextMenuPrimitive.Content className={CONTEXT_MENU_CONTENT_CLASS}>
          <ContextMenuPrimitive.Item
            className={CONTEXT_MENU_ITEM_CLASS}
            onSelect={onRename}
          >
            <SettingsIcon />
            Rename
          </ContextMenuPrimitive.Item>
          <ContextMenuPrimitive.Item
            className={CONTEXT_MENU_DESTRUCTIVE_ITEM_CLASS}
            onSelect={onDelete}
          >
            <Trash2Icon />
            Delete
          </ContextMenuPrimitive.Item>
        </ContextMenuPrimitive.Content>
      </ContextMenuPrimitive.Portal>
    </ContextMenuPrimitive.Root>
  )
}

export function MediaFilterMenu({
  kind,
  baseRows,
  value,
  onChange,
  collections,
  counts,
  guest = false,
  showClear = true,
  typeDivider = false,
  onCollectionsChanged,
  onNewCollection,
}: {
  /** Which panel's menu: its types, default row and saved-view kind. */
  kind: MediaFilterKind
  /**
   * The Collection rows above the collections: All media and Uncollected in
   * the video editor, This carousel in the carousel editor.
   */
  baseRows: { id: string; label: string }[]
  value: MediaFilterValue
  onChange: (value: MediaFilterValue) => void
  collections: MediaCollectionSummary[]
  /** What each Collection row would show, by row id; absent until known. */
  counts: Record<string, number> | undefined
  /** A guest sent from Project has no collections and no views. */
  guest?: boolean
  /** Clear filters at the foot; the Image panel's picture has none. */
  showClear?: boolean
  /** A line under the Type row, as the Image panel's picture has. */
  typeDivider?: boolean
  /** A collection was renamed or deleted. */
  onCollectionsChanged: () => void
  onNewCollection: () => void
}) {
  const [open, setOpen] = React.useState(false)
  const screen = savedViewScreen(kind.kind, MEDIA_SAVED_VIEW_RECORD)
  const { views, reload: reloadViews } = useMediaViews(screen, !guest)
  const [savingView, setSavingView] = React.useState(false)
  const [renamingView, setRenamingView] = React.useState<SavedView | null>(null)
  const [deletingView, setDeletingView] = React.useState<SavedView | null>(null)
  const [renaming, setRenaming] =
    React.useState<MediaCollectionSummary | null>(null)
  const [deleting, setDeleting] =
    React.useState<MediaCollectionSummary | null>(null)
  const [deleteBusy, setDeleteBusy] = React.useState(false)

  const empty = emptyMediaFilter(kind)
  const filterSet = !sameFilter(kind, value, empty)
  const defaultRowName =
    baseRows.find((row) => row.id === kind.defaultCollection)?.label ??
    "All media"
  const collectionName = (id: string) =>
    collections.find((collection) => collection.id === id)?.name

  const here: SavedViewsScreen = {
    screen,
    kept: (filters) => mediaViewFilters(filters, kind),
    describe: (filters, names) =>
      describeMediaView(
        filters,
        (id) => collectionName(id) ?? names.collection
      ),
    describeError,
  }

  function toggleType(type: MediaType) {
    const ticked = value.types.includes(type)
    onChange({
      ...value,
      types: kind.types.filter((candidate) =>
        candidate === type ? !ticked : value.types.includes(candidate)
      ),
    })
  }

  function openView(view: SavedView) {
    const next = viewValue(kind, view)
    if (
      !baseRows.some((row) => row.id === next.collection) &&
      !collectionName(next.collection)
    ) {
      toast.message(
        `“${view.names.collection ?? "Its collection"}” was deleted, so “${view.name}” shows ${defaultRowName}.`
      )
      next.collection = kind.defaultCollection
    }
    onChange(next)
  }

  async function confirmDeleteCollection() {
    if (!deleting) return
    setDeleteBusy(true)
    dismissErrorToast()
    try {
      await deleteMediaCollection(deleting.id)
      if (value.collection === deleting.id) {
        onChange({ ...value, collection: kind.defaultCollection })
      }
      toast.success(
        `Deleted “${deleting.name}”. Its files are still in your library.`
      )
      setDeleting(null)
      onCollectionsChanged()
    } catch (error) {
      showErrorToast(getVideoMediaErrorMessage(error))
    } finally {
      setDeleteBusy(false)
    }
  }

  async function confirmDeleteView() {
    if (!deletingView) return
    setDeleteBusy(true)
    dismissErrorToast()
    try {
      await deleteView(deletingView.id)
      toast.success(`Deleted the view “${deletingView.name}”.`)
      setDeletingView(null)
      reloadViews()
    } catch (error) {
      showErrorToast(describeError(error))
    } finally {
      setDeleteBusy(false)
    }
  }

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={filterSet ? "Filter media, filters set" : "Filter media"}
            className={cn("relative", open && "bg-accent")}
          >
            <FunnelIcon />
            {filterSet ? (
              <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-(--acc) ring-2 ring-background" />
            ) : null}
          </Button>
        </PopoverTrigger>
        {/* studio-root brings the editor's accent into the portal. */}
        <PopoverContent align="end" className="studio-root w-80 gap-0 p-0">
          {views.length ? (
            <>
              <SectionLabel>Views</SectionLabel>
              <div className="grid px-2">
                {views.map((view) => (
                  <RowMenu
                    key={view.id}
                    onRename={() => setRenamingView(view)}
                    onDelete={() => setDeletingView(view)}
                  >
                    <div>
                      <ChoiceRow
                        label={view.name}
                        on={sameFilter(kind, viewValue(kind, view), value)}
                        onSelect={() => openView(view)}
                      />
                    </div>
                  </RowMenu>
                ))}
              </div>
            </>
          ) : null}

          <SectionLabel>Type</SectionLabel>
          <div
            className="grid gap-2 px-4"
            style={{
              gridTemplateColumns: `repeat(${kind.types.length}, minmax(0, 1fr))`,
            }}
          >
            {kind.types.map((type) => {
              const Icon = TYPE_ICONS[type]
              const on = value.types.includes(type)
              return (
                <button
                  key={type}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleType(type)}
                  className={cn(
                    "flex h-9 min-w-0 items-center justify-center gap-1.5 rounded-lg border px-1.5 text-sm",
                    on
                      ? "border-(--acc)/40 bg-(--acc-soft) text-(--acc)"
                      : "text-foreground hover:bg-accent"
                  )}
                >
                  <Icon className="size-4 shrink-0" />
                  <span className="truncate">{mediaTypeLabels[type]}</span>
                </button>
              )
            })}
          </div>

          {typeDivider ? <div className="mx-4 mt-3 border-t" /> : null}

          {guest ? null : (
            <>
              <SectionLabel>Collection</SectionLabel>
              <div className="grid px-2">
                {baseRows.map((row) => (
                  <ChoiceRow
                    key={row.id}
                    label={row.label}
                    count={counts?.[row.id]}
                    on={value.collection === row.id}
                    onSelect={() => onChange({ ...value, collection: row.id })}
                  />
                ))}
                {collections.map((collection) => (
                  <RowMenu
                    key={collection.id}
                    onRename={() => setRenaming(collection)}
                    onDelete={() => setDeleting(collection)}
                  >
                    <div>
                      <ChoiceRow
                        label={collection.name}
                        count={
                          counts ? (counts[collection.id] ?? 0) : undefined
                        }
                        on={value.collection === collection.id}
                        onSelect={() =>
                          onChange({ ...value, collection: collection.id })
                        }
                      />
                    </div>
                  </RowMenu>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false)
                    onNewCollection()
                  }}
                  className="flex h-9 items-center rounded-md px-3 text-left text-sm text-(--acc) hover:bg-accent"
                >
                  + New collection
                </button>
              </div>
            </>
          )}

          <div className="mt-3 grid border-t p-2">
            {guest ? null : (
              <>
                <button
                  type="button"
                  onClick={() => {
                    if (!filterSet) {
                      showErrorToast(
                        "Pick a type or a collection first, then save it as a view."
                      )
                      return
                    }
                    setOpen(false)
                    setSavingView(true)
                  }}
                  className="flex h-9 items-center gap-2 rounded-md px-3 text-left text-sm hover:bg-accent"
                >
                  <BookmarkIcon className="size-4" />
                  Save view
                </button>
                {showClear ? <div className="-mx-2 my-2 border-t" /> : null}
              </>
            )}
            {showClear ? (
              <button
                type="button"
                onClick={() => onChange(empty)}
                className="flex h-9 items-center rounded-md px-3 text-left text-sm hover:bg-accent"
              >
                Clear filters
              </button>
            ) : null}
          </div>
        </PopoverContent>
      </Popover>

      <SaveViewDialog
        open={savingView}
        here={here}
        filters={filtersOf(kind, value)}
        onClose={() => {
          setSavingView(false)
          reloadViews()
        }}
      />

      <ViewNameDialog
        view={renamingView}
        onClose={() => setRenamingView(null)}
        onSaved={reloadViews}
      />

      <ConfirmDialog
        open={deletingView !== null}
        onOpenChange={(next) => {
          if (!next) setDeletingView(null)
        }}
        title={`Delete the view “${deletingView?.name ?? ""}”?`}
        description="Only the saved view goes. No file or collection changes."
        confirmLabel="Delete view"
        loading={deleteBusy}
        onConfirm={() => void confirmDeleteView()}
      />

      <CollectionNameDialog
        open={renaming !== null}
        onOpenChange={(next) => {
          if (!next) setRenaming(null)
        }}
        collection={renaming}
        onSaved={(saved) => {
          toast.success(`Renamed to “${saved.name}”.`)
          onCollectionsChanged()
        }}
      />

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(next) => {
          if (!next) setDeleting(null)
        }}
        title={`Delete “${deleting?.name ?? ""}”?`}
        description={
          deleting?.item_count
            ? `The ${deleting.item_count} ${plural(deleting.item_count, "file")} in it ${plural(deleting.item_count, "stays", "stay")} in your media library. Only the collection goes.`
            : "It is empty, so nothing else changes."
        }
        confirmLabel="Delete collection"
        loading={deleteBusy}
        onConfirm={() => void confirmDeleteCollection()}
      />
    </>
  )
}

/** Renames one saved view; what it shows stays the same. */
function ViewNameDialog({
  view,
  onClose,
  onSaved,
}: {
  view: SavedView | null
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = React.useState("")
  const [invalid, setInvalid] = React.useState(false)
  const [busy, setBusy] = React.useState(false)

  const [shown, setShown] = React.useState<SavedView | null>(null)
  if (view !== shown) {
    setShown(view)
    if (view) {
      setName(view.name)
      setInvalid(false)
    }
  }

  async function submit() {
    if (!view || busy) return
    const next = name.trim()
    if (!next) {
      setInvalid(true)
      showErrorToast("Give the view a name.")
      return
    }
    if (next === view.name) {
      onClose()
      return
    }
    setBusy(true)
    dismissErrorToast()
    try {
      await updateView({ viewId: view.id, name: next, filters: view.filters })
      toast.success(`Renamed to “${next}”.`)
      onSaved()
      onClose()
    } catch (error) {
      setInvalid(true)
      showErrorToast(describeError(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <FormDialog
      open={view !== null}
      dirty={view !== null && name.trim() !== view.name}
      busy={busy}
      onClose={onClose}
    >
      {(requestClose) => (
        <DialogContent variant="admin" className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename view</DialogTitle>
            <DialogDescription>
              What the view shows stays exactly as it is.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Card size="sm">
              <CardHeader>
                <CardTitle>View</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2">
                <Label htmlFor="media-view-name">Name</Label>
                <Input
                  id="media-view-name"
                  autoFocus
                  maxLength={SAVED_VIEW_LIMITS.name}
                  value={name}
                  aria-invalid={invalid || undefined}
                  onChange={(event) => {
                    setName(event.target.value)
                    setInvalid(false)
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter") return
                    event.preventDefault()
                    void submit()
                  }}
                />
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
            <Button type="button" disabled={busy} onClick={() => void submit()}>
              {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </FormDialog>
  )
}
