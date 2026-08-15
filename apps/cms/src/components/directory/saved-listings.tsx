import * as React from "react"
import {
  BookmarkIcon,
  CopyIcon,
  ExternalLinkIcon,
  SettingsIcon,
  Trash2Icon,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { FieldLabel } from "@/components/ui/field-label"
import { FormDialog } from "@/components/ui/form-dialog"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import {
  deleteMySavedList,
  getSaveErrorMessage,
  renameMySavedList,
  removeFromSaved,
  setSavedListPublic,
  type SavedCollection,
} from "@/lib/api/directory/saves"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { showErrorToast } from "@/lib/toast/error-toast"

export function SavedListings({ initial }: { initial: SavedCollection[] }) {
  const [collections, setCollections] = React.useState(initial)
  const [renaming, setRenaming] = React.useState<SavedCollection | null>(null)
  const [deleting, setDeleting] = React.useState<SavedCollection | null>(null)
  const [run, busy] = useAsyncAction(getSaveErrorMessage)

  if (collections.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No saved listings yet</CardTitle>
          <CardDescription>
            Open a directory listing and use Save to keep it here.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  const sites = new Map<string, SavedCollection[]>()
  for (const collection of collections) {
    sites.set(collection.siteId, [
      ...(sites.get(collection.siteId) ?? []),
      collection,
    ])
  }
  return (
    <div className="grid gap-2 md:gap-3">
      {[...sites.values()].map((siteCollections) => (
        <section
          key={siteCollections[0]!.siteId}
          className="grid gap-2 md:gap-3"
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="grid gap-1">
              <h1 className="text-xl font-semibold">
                {siteCollections[0]!.siteName}
              </h1>
              <p className="text-sm text-muted-foreground">
                Turn on a list to let anyone with your profile link see its name
                and published listings.
              </p>
            </div>
            {siteCollections.some((collection) => collection.isPublic) ? (
              <div className="flex flex-wrap gap-2">
                <Button asChild variant="outline">
                  <a
                    href={siteCollections[0]!.profileUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ExternalLinkIcon /> View profile
                  </a>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    void navigator.clipboard
                      .writeText(siteCollections[0]!.profileUrl)
                      .then(() => toast.success("Profile link copied."))
                      .catch(() =>
                        showErrorToast("The profile link could not be copied.")
                      )
                  }}
                >
                  <CopyIcon /> Copy link
                </Button>
              </div>
            ) : null}
          </div>
          {siteCollections.map((collection) => (
            <Card key={collection.id}>
              <CardHeader className="flex-row items-start justify-between gap-4">
                <div className="grid gap-1">
                  <CardTitle>{collection.name}</CardTitle>
                  <CardDescription>
                    {collection.items.length}{" "}
                    {collection.items.length === 1 ? "listing" : "listings"}
                  </CardDescription>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Switch
                    id={`public-${collection.id}`}
                    checked={collection.isPublic}
                    disabled={busy}
                    onCheckedChange={(isPublic) =>
                      void run(async () => {
                        await setSavedListPublic({
                          workspaceId: collection.siteId,
                          collectionId: collection.id,
                          isPublic,
                        })
                        setCollections((current) =>
                          current.map((row) =>
                            row.id === collection.id
                              ? { ...row, isPublic }
                              : row
                          )
                        )
                        toast.success(
                          isPublic
                            ? "Saved list is public."
                            : "Saved list is private."
                        )
                      })
                    }
                  />
                  <label
                    htmlFor={`public-${collection.id}`}
                    className="text-sm font-medium"
                  >
                    Public
                  </label>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    disabled={busy}
                    aria-label={`Edit ${collection.name}`}
                    onClick={() => setRenaming(collection)}
                  >
                    <SettingsIcon />
                  </Button>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    disabled={busy}
                    aria-label={`Delete ${collection.name}`}
                    onClick={() => setDeleting(collection)}
                  >
                    <Trash2Icon />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {collection.items.length ? (
                  <ul className="divide-y">
                    {collection.items.map((item) => (
                      <li
                        key={item.id}
                        className="flex min-h-12 items-center gap-3 py-2"
                      >
                        <BookmarkIcon
                          className="size-4 shrink-0 text-muted-foreground"
                          aria-hidden="true"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">
                            {item.title}
                          </p>
                          {item.address ? (
                            <p className="truncate text-xs text-muted-foreground">
                              {item.address}
                            </p>
                          ) : null}
                        </div>
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          disabled={busy}
                          aria-label={`Remove ${item.title} from ${collection.name}`}
                          onClick={() =>
                            void run(async () => {
                              await removeFromSaved({
                                workspaceId: collection.siteId,
                                collectionId: collection.id,
                                listingId: item.id,
                              })
                              setCollections((current) =>
                                current.map((row) =>
                                  row.id === collection.id
                                    ? {
                                        ...row,
                                        items: row.items.filter(
                                          (saved) => saved.id !== item.id
                                        ),
                                      }
                                    : row
                                )
                              )
                              toast.success("Removed from saved listings.")
                            })
                          }
                        >
                          <Trash2Icon />
                        </Button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="py-4 text-sm text-muted-foreground">
                    This saved list is empty.
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </section>
      ))}
      <SavedListNameDialog
        key={renaming?.id ?? "closed"}
        collection={renaming}
        busy={busy}
        onClose={() => setRenaming(null)}
        onSave={async (name) => {
          if (!renaming) return
          const saved = await run(async () => {
            const result = await renameMySavedList({
              workspaceId: renaming.siteId,
              collectionId: renaming.id,
              name,
            })
            setCollections((current) =>
              current.map((row) =>
                row.id === renaming.id ? { ...row, name: result.name } : row
              )
            )
          }, "Saved list renamed.")
          if (saved) setRenaming(null)
        }}
      />
      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
        title="Delete this saved list?"
        description="The list and everything saved in it will be removed. The listings themselves are not changed."
        confirmLabel="Delete saved list"
        loading={busy}
        onConfirm={() =>
          void run(async () => {
            if (!deleting) return
            await deleteMySavedList({
              workspaceId: deleting.siteId,
              collectionId: deleting.id,
            })
            setCollections((current) =>
              current.filter((row) => row.id !== deleting.id)
            )
            setDeleting(null)
          }, "Saved list deleted.")
        }
      />
    </div>
  )
}

function SavedListNameDialog({
  collection,
  busy,
  onClose,
  onSave,
}: {
  collection: SavedCollection | null
  busy: boolean
  onClose: () => void
  onSave: (name: string) => Promise<void>
}) {
  const [name, setName] = React.useState(collection?.name ?? "")
  const [attempted, setAttempted] = React.useState(false)
  const valid = Boolean(name.trim())

  return (
    <FormDialog
      open={Boolean(collection)}
      dirty={name !== (collection?.name ?? "")}
      busy={busy}
      onClose={onClose}
    >
      {(requestClose) => (
        <DialogContent variant="admin" className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Rename saved list</DialogTitle>
            <DialogDescription>
              The new name appears anywhere this list is shared.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Card size="sm">
              <CardHeader>
                <CardTitle>List name</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="grid gap-2">
                  <FieldLabel htmlFor="saved-list-name">Name</FieldLabel>
                  <Input
                    id="saved-list-name"
                    value={name}
                    maxLength={80}
                    disabled={busy}
                    aria-invalid={attempted && !valid}
                    onChange={(event) => setName(event.target.value)}
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
            <Button
              type="button"
              disabled={busy}
              onClick={() => {
                setAttempted(true)
                if (!valid) {
                  showErrorToast("Give the saved list a name.")
                  return
                }
                void onSave(name.trim())
              }}
            >
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </FormDialog>
  )
}
