import * as React from "react"
import {
  ChevronDownIcon,
  Loader2Icon,
  PlusIcon,
  SettingsIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react"
import { ContextMenu as ContextMenuPrimitive } from "radix-ui"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { FormDialog } from "@/components/ui/form-dialog"
import {
  CONTEXT_MENU_CONTENT_CLASS,
  CONTEXT_MENU_DESTRUCTIVE_ITEM_CLASS,
  CONTEXT_MENU_ITEM_CLASS,
} from "@/components/shared/editor-media-context-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  addMediaToCollection,
  createMediaCollection,
  deleteMediaCollection,
  getVideoMediaErrorMessage,
  removeMediaFromCollection,
  renameMediaCollection,
  type MediaCollectionSummary,
} from "@/lib/api/video/media"
import { plural } from "@/lib/format/plural"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"
import {
  cleanCollectionName,
  MEDIA_COLLECTION_NAME_MAX,
} from "@/lib/video/media-collections"

/**
 * Everything the Media panel needs to make, name and fill collections. A
 * collection is one person's named group of their own files; deleting one
 * never touches the files in it.
 */

function filesWord(count: number) {
  return `${count} ${plural(count, "file")}`
}

// ------------------------------------------------------ Name window -------

/** Creates a collection when `collection` is null, renames it otherwise. */
export function CollectionNameDialog({
  open,
  onOpenChange,
  collection,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  collection: MediaCollectionSummary | null
  /** Handed the saved collection; the window closes once this settles. */
  onSaved: (saved: { id: string; name: string }) => void | Promise<void>
}) {
  const [name, setName] = React.useState("")
  const [invalid, setInvalid] = React.useState(false)
  const [busy, setBusy] = React.useState(false)

  const [wasOpen, setWasOpen] = React.useState(false)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setName(collection?.name ?? "")
      setInvalid(false)
    }
  }

  const original = collection?.name ?? ""

  async function submit() {
    if (busy) return
    let cleaned: string
    try {
      cleaned = cleanCollectionName(name)
    } catch (error) {
      setInvalid(true)
      showErrorToast(getVideoMediaErrorMessage(error))
      return
    }
    if (collection && cleaned === collection.name) {
      onOpenChange(false)
      return
    }
    setBusy(true)
    dismissErrorToast()
    try {
      if (collection) {
        await renameMediaCollection(collection.id, cleaned)
        await onSaved({ id: collection.id, name: cleaned })
      } else {
        await onSaved(await createMediaCollection(cleaned))
      }
      onOpenChange(false)
    } catch (error) {
      // A taken name is the usual reason, and the server's sentence says so.
      setInvalid(true)
      showErrorToast(getVideoMediaErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <FormDialog
      open={open}
      dirty={name.trim() !== original}
      busy={busy}
      onClose={() => onOpenChange(false)}
    >
      {(requestClose) => (
        <DialogContent variant="admin" className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {collection ? "Rename collection" : "New collection"}
            </DialogTitle>
            <DialogDescription>
              {collection
                ? "The files in it stay exactly as they are."
                : "Groups your files so the Media panel can show just them. Only you see it."}
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Card size="sm">
              <CardHeader>
                <CardTitle>Collection</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="media-collection-name">Name</Label>
                  <Input
                    id="media-collection-name"
                    autoFocus
                    maxLength={MEDIA_COLLECTION_NAME_MAX}
                    value={name}
                    placeholder="B-roll"
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
            <Button type="button" disabled={busy} onClick={() => void submit()}>
              {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
              {collection ? "Save changes" : "Create collection"}
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </FormDialog>
  )
}

// ------------------------------------------------------------- Chips ------

/**
 * The collection filter chips. Right-clicking a collection's chip renames or
 * deletes it; making one is the Media header's + menu, so the chips only ever
 * act on a chip that exists.
 */
export function CollectionChips({
  collections,
  value,
  onChange,
  onCollectionsChanged,
}: {
  collections: MediaCollectionSummary[]
  /** "all", "uncollected", or a collection's id. */
  value: string
  onChange: (value: string) => void
  /** A collection was renamed or deleted. */
  onCollectionsChanged: () => void
}) {
  const [renaming, setRenaming] =
    React.useState<MediaCollectionSummary | null>(null)
  const [deleting, setDeleting] = React.useState<MediaCollectionSummary | null>(
    null
  )
  const [deleteBusy, setDeleteBusy] = React.useState(false)

  async function confirmDelete() {
    if (!deleting) return
    setDeleteBusy(true)
    dismissErrorToast()
    try {
      await deleteMediaCollection(deleting.id)
      if (value === deleting.id) onChange("all")
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

  if (!collections.length) return null

  const options = [
    { id: "all", label: "All" },
    { id: "uncollected", label: "Uncollected" },
    ...collections.map((collection) => ({
      id: collection.id,
      label: collection.name,
    })),
  ]

  return (
    <>
      {/* Collections wrap rather than share a fixed row: there can be any
          number of them, with names of any length. */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 5,
          marginBottom: 15,
        }}
      >
        {options.map((option) => {
          const on = value === option.id
          const chip = (
            <button
              key={option.id}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(option.id)}
              title={option.label}
              style={{
                maxWidth: "100%",
                padding: "5px 9px",
                borderRadius: 8,
                fontSize: 11,
                fontWeight: 600,
                cursor: "pointer",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                border: on ? "1px solid var(--acc)" : "1px solid var(--line)",
                background: on ? "var(--acc-soft)" : "var(--panel)",
                color: on ? "var(--acc)" : "var(--ink2)",
              }}
            >
              {option.label}
            </button>
          )
          const collection = collections.find(
            (candidate) => candidate.id === option.id
          )
          // All and Uncollected are views, not collections; there is nothing
          // to rename or delete on them.
          if (!collection) return chip
          return (
            <ContextMenuPrimitive.Root key={option.id}>
              <ContextMenuPrimitive.Trigger asChild>
                {chip}
              </ContextMenuPrimitive.Trigger>
              <ContextMenuPrimitive.Portal>
                <ContextMenuPrimitive.Content
                  className={CONTEXT_MENU_CONTENT_CLASS}
                >
                  <ContextMenuPrimitive.Item
                    className={CONTEXT_MENU_ITEM_CLASS}
                    onSelect={() => setRenaming(collection)}
                  >
                    <SettingsIcon />
                    Rename
                  </ContextMenuPrimitive.Item>
                  <ContextMenuPrimitive.Item
                    className={CONTEXT_MENU_DESTRUCTIVE_ITEM_CLASS}
                    onSelect={() => setDeleting(collection)}
                  >
                    <Trash2Icon />
                    Delete
                  </ContextMenuPrimitive.Item>
                </ContextMenuPrimitive.Content>
              </ContextMenuPrimitive.Portal>
            </ContextMenuPrimitive.Root>
          )
        })}
      </div>

      <CollectionNameDialog
        open={renaming !== null}
        onOpenChange={(open) => {
          if (!open) setRenaming(null)
        }}
        collection={renaming}
        onSaved={(saved) => {
          toast.success(`Renamed to “${saved.name}”.`)
          onCollectionsChanged()
        }}
      />

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
        title={`Delete “${deleting?.name ?? ""}”?`}
        description={
          deleting?.item_count
            ? `The ${filesWord(deleting.item_count)} in it ${plural(deleting.item_count, "stays", "stay")} in your media library. Only the collection goes.`
            : "It is empty, so nothing else changes."
        }
        confirmLabel="Delete collection"
        loading={deleteBusy}
        onConfirm={() => void confirmDelete()}
      />
    </>
  )
}

// --------------------------------------------------------- Selecting ------

/**
 * Laid over a tile while selecting. The whole tile is the label, so a click
 * anywhere on it ticks the box, and nothing underneath (adding at the
 * playhead, dragging) can fire.
 */
export function SelectTileOverlay({
  name,
  selected,
  onToggle,
}: {
  name: string
  selected: boolean
  onToggle: () => void
}) {
  return (
    <label
      className={cn(
        "absolute inset-0 z-10 cursor-pointer rounded-xl",
        selected && "ring-2 ring-primary ring-inset"
      )}
    >
      <Checkbox
        className="absolute top-2 right-2 bg-background"
        checked={selected}
        onCheckedChange={onToggle}
        // Space ticks the focused box instead of reaching the editor's
        // play-and-pause shortcut.
        onKeyDown={(event) => {
          if (event.code === "Space") event.stopPropagation()
        }}
        aria-label={`Select ${name}`}
      />
    </label>
  )
}

/**
 * The bar under the grid while selecting: one pick from its menu puts every
 * ticked file into a collection (or takes them out of the one being shown) in
 * a single request.
 */
export function MediaSelectionBar({
  selectedIds,
  collections,
  activeCollection,
  onDone,
  onCancel,
}: {
  selectedIds: string[]
  collections: MediaCollectionSummary[]
  /** The collection the grid is filtered to, if any — the one "Remove" means. */
  activeCollection: MediaCollectionSummary | null
  /** Memberships changed; the panel reloads and stops selecting. */
  onDone: () => void
  onCancel: () => void
}) {
  const [busy, setBusy] = React.useState(false)
  const [creating, setCreating] = React.useState(false)
  const count = selectedIds.length

  function requireSelection() {
    if (count) return true
    showErrorToast("Tick some files first.")
    return false
  }

  async function add(collection: { id: string; name: string }) {
    const added = await addMediaToCollection(collection.id, selectedIds)
    const already = count - added.added_count
    toast.success(
      added.added_count
        ? `Added ${filesWord(added.added_count)} to “${collection.name}”.${
            already ? ` ${already} ${plural(already, "was", "were")} already in it.` : ""
          }`
        : `${count === 1 ? "That file was" : `All ${count} were`} already in “${collection.name}”.`
    )
    onDone()
  }

  async function run(action: () => Promise<void>) {
    if (!requireSelection() || busy) return
    setBusy(true)
    dismissErrorToast()
    try {
      await action()
    } catch (error) {
      showErrorToast(getVideoMediaErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  async function remove(collection: MediaCollectionSummary) {
    const removed = await removeMediaFromCollection(collection.id, selectedIds)
    toast.success(
      `Took ${filesWord(removed.removed_count)} out of “${collection.name}”. ${plural(
        removed.removed_count,
        "It is",
        "They are"
      )} still in your library.`
    )
    onDone()
  }

  return (
    // Two rows: the panel is under 200px wide, too narrow for the count and
    // both buttons side by side.
    <div className="grid gap-2 border-t p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-sm" aria-live="polite">
          {count} selected
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Stop selecting"
          title="Stop selecting"
          disabled={busy}
          onClick={onCancel}
        >
          <XIcon />
        </Button>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" className="w-full" disabled={busy}>
            {busy ? <Loader2Icon className="animate-spin" /> : null}
            Add to collection
            <ChevronDownIcon data-icon="inline-end" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {collections.map((collection) => (
            <DropdownMenuItem
              key={collection.id}
              onSelect={() => void run(() => add(collection))}
            >
              <span className="truncate">{collection.name}</span>
            </DropdownMenuItem>
          ))}
          {collections.length ? <DropdownMenuSeparator /> : null}
          <DropdownMenuItem
            onSelect={() => {
              if (requireSelection()) setCreating(true)
            }}
          >
            <PlusIcon />
            New collection
          </DropdownMenuItem>
          {activeCollection ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => void run(() => remove(activeCollection))}
              >
                <XIcon />
                <span className="truncate">
                  Remove from “{activeCollection.name}”
                </span>
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* A new collection made from here is filled with the ticked files in
          the same go, so it is still one action. */}
      <CollectionNameDialog
        open={creating}
        onOpenChange={setCreating}
        collection={null}
        onSaved={async (created) => {
          // The collection exists by now, so a failed add must not leave the
          // window open offering to create it again.
          try {
            await add(created)
          } catch (error) {
            showErrorToast(
              `Created “${created.name}”, but the files were not added: ${getVideoMediaErrorMessage(error)}`
            )
            onDone()
          }
        }}
      />
    </div>
  )
}
