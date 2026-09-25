import * as React from "react"
import { Loader2Icon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import {
  createMediaCollection,
  deleteMediaCollection,
  getMediaCollectionErrorMessage,
  renameMediaCollection,
  type MediaCollection,
} from "@/lib/api/media-collections"
import { MEDIA_COLLECTION_NAME_MAX } from "@/lib/media-collections"

// Create, rename and delete collections. Deleting only detaches its media, so
// the confirmation says so rather than warning about data loss. Confirmation
// happens inline on the row because modals must not nest.
export function MediaCollectionsDialog({
  open,
  onOpenChange,
  collections,
  onChanged,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  collections: MediaCollection[]
  onChanged: () => Promise<unknown>
}) {
  const [newName, setNewName] = React.useState("")
  const [creating, setCreating] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [renamingId, setRenamingId] = React.useState<string | null>(null)
  const [renameValue, setRenameValue] = React.useState("")
  const [pendingId, setPendingId] = React.useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = React.useState<string | null>(
    null
  )

  // A fresh open starts clean rather than showing the last session's error or
  // half-finished rename.
  React.useEffect(() => {
    if (open) return
    setNewName("")
    setError(null)
    setRenamingId(null)
    setConfirmDeleteId(null)
  }, [open])

  const busy = creating || pendingId !== null

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault()
    if (!newName.trim() || creating) return
    setCreating(true)
    setError(null)
    try {
      await createMediaCollection(newName)
      await onChanged()
      setNewName("")
      toast.success("Collection created.")
    } catch (createError) {
      setError(getMediaCollectionErrorMessage(createError))
    } finally {
      setCreating(false)
    }
  }

  async function handleRename(collection: MediaCollection) {
    const name = renameValue.trim()
    if (!name || name === collection.name) {
      setRenamingId(null)
      return
    }
    setPendingId(collection.id)
    setError(null)
    try {
      await renameMediaCollection(collection.id, name)
      await onChanged()
      setRenamingId(null)
      toast.success("Collection renamed.")
    } catch (renameError) {
      setError(getMediaCollectionErrorMessage(renameError))
    } finally {
      setPendingId(null)
    }
  }

  async function handleDelete(collection: MediaCollection) {
    setPendingId(collection.id)
    setError(null)
    try {
      await deleteMediaCollection(collection.id)
      await onChanged()
      setConfirmDeleteId(null)
      toast.success("Collection deleted.")
    } catch (deleteError) {
      setError(getMediaCollectionErrorMessage(deleteError))
    } finally {
      setPendingId(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent variant="admin" className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Collections</DialogTitle>
          <DialogDescription>
            Group library media into named sets you can filter by.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Card size="sm">
            <CardHeader>
              <CardTitle>New collection</CardTitle>
            </CardHeader>
            <CardContent>
              <form
                className="flex flex-col gap-4 sm:flex-row sm:items-end"
                onSubmit={handleCreate}
              >
                <div className="grid flex-1 gap-2">
                  <FieldLabel
                    htmlFor="new-collection-name"
                    hint="Shown in the library and editor filters. Names are unique."
                  >
                    Name
                  </FieldLabel>
                  <Input
                    id="new-collection-name"
                    value={newName}
                    maxLength={MEDIA_COLLECTION_NAME_MAX}
                    placeholder="B-roll — gym"
                    onChange={(event) => setNewName(event.target.value)}
                  />
                </div>
                <Button type="submit" disabled={creating || !newName.trim()}>
                  {creating ? (
                    <Loader2Icon className="size-4 animate-spin" />
                  ) : (
                    <PlusIcon className="size-4" />
                  )}
                  Add
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card size="sm">
            <CardHeader>
              <CardTitle>Your collections</CardTitle>
              <CardDescription>
                Deleting a collection removes the grouping only — the media
                stays in your library.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              {collections.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No collections yet. Add one above.
                </p>
              ) : (
                collections.map((collection) => (
                  <div key={collection.id} className="grid gap-2">
                    {renamingId === collection.id ? (
                      <form
                        className="flex items-center gap-2"
                        onSubmit={(event) => {
                          event.preventDefault()
                          void handleRename(collection)
                        }}
                      >
                        <Input
                          autoFocus
                          value={renameValue}
                          maxLength={MEDIA_COLLECTION_NAME_MAX}
                          aria-label={`Rename ${collection.name}`}
                          onChange={(event) =>
                            setRenameValue(event.target.value)
                          }
                          onKeyDown={(event) => {
                            if (event.key === "Escape") setRenamingId(null)
                          }}
                        />
                        <Button
                          type="submit"
                          disabled={pendingId === collection.id}
                        >
                          {pendingId === collection.id ? (
                            <Loader2Icon className="size-4 animate-spin" />
                          ) : null}
                          Save
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          disabled={pendingId === collection.id}
                          onClick={() => setRenamingId(null)}
                        >
                          Cancel
                        </Button>
                      </form>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate font-medium">
                          {collection.name}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {collection.item_count}{" "}
                          {collection.item_count === 1 ? "item" : "items"}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Rename ${collection.name}`}
                          disabled={busy}
                          onClick={() => {
                            setConfirmDeleteId(null)
                            setRenamingId(collection.id)
                            setRenameValue(collection.name)
                          }}
                        >
                          <PencilIcon className="size-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Delete ${collection.name}`}
                          disabled={busy}
                          onClick={() => setConfirmDeleteId(collection.id)}
                        >
                          <Trash2Icon className="size-4" />
                        </Button>
                      </div>
                    )}

                    {confirmDeleteId === collection.id ? (
                      <div className="flex flex-wrap items-center gap-2 rounded-lg bg-muted p-2">
                        <p className="flex-1 text-sm">
                          Delete “{collection.name}”? Its{" "}
                          {collection.item_count}{" "}
                          {collection.item_count === 1
                            ? "item stays"
                            : "items stay"}{" "}
                          in the library.
                        </p>
                        <Button
                          type="button"
                          variant="outline"
                          disabled={pendingId === collection.id}
                          onClick={() => setConfirmDeleteId(null)}
                        >
                          Cancel
                        </Button>
                        <Button
                          type="button"
                          variant="destructive"
                          disabled={pendingId === collection.id}
                          onClick={() => void handleDelete(collection)}
                        >
                          {pendingId === collection.id ? (
                            <Loader2Icon className="size-4 animate-spin" />
                          ) : null}
                          Delete
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </DialogBody>
        <DialogFooter variant="plain">
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
