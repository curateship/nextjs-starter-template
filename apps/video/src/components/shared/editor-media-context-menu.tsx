import * as React from "react"
import { CheckIcon, ChevronRightIcon, FolderIcon, Trash2Icon } from "lucide-react"
import { ContextMenu as ContextMenuPrimitive } from "radix-ui"

import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  addMediaToCollection,
  deleteEditorMedia,
  getVideoMediaErrorMessage,
  removeMediaFromCollection,
  type MediaCollectionSummary,
  type MediaScope,
} from "@/lib/api/video/media"
import { showErrorToast } from "@/lib/toast/error-toast"

export const CONTEXT_MENU_ITEM_CLASS =
  "relative flex cursor-pointer items-center gap-1.5 rounded-md px-1.5 py-1 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50 data-[state=open]:bg-accent [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0"

export const CONTEXT_MENU_CONTENT_CLASS =
  "z-50 min-w-36 rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95"

export const CONTEXT_MENU_DESTRUCTIVE_ITEM_CLASS =
  "relative flex cursor-pointer items-center gap-1.5 rounded-md px-1.5 py-1 text-sm text-destructive outline-hidden select-none focus:bg-destructive/10 focus:text-destructive dark:focus:bg-destructive/20 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0"

/**
 * Which of the person's collections one file is in. Passed only where the
 * library has collections (the video editor, not the carousel studio).
 */
type EditorMediaCollections = {
  all: MediaCollectionSummary[]
  memberOf: string[]
  /** The file's collections after a tick saved. */
  onChange: (collectionIds: string[]) => void
}

/** The shared right-click action for media cards in both editor libraries. */
export function EditorMediaContextMenu({
  scope,
  mediaId,
  mediaName,
  onDeleted,
  collections,
  children,
}: {
  scope: MediaScope
  mediaId: string
  mediaName: string
  onDeleted: (mediaId: string) => void
  collections?: EditorMediaCollections
  children: React.ReactElement
}) {
  const [confirming, setConfirming] = React.useState(false)
  const [deleting, setDeleting] = React.useState(false)
  const [savingCollections, setSavingCollections] = React.useState(false)

  // Each tick adds or removes this one membership rather than rewriting the
  // file's whole list, so a change made in another tab is never undone from a
  // stale copy. One at a time keeps the ticks in the order they were made.
  async function toggleCollection(collectionId: string) {
    if (!collections || savingCollections) return
    const isMember = collections.memberOf.includes(collectionId)
    setSavingCollections(true)
    try {
      if (isMember) {
        await removeMediaFromCollection(collectionId, [mediaId])
      } else {
        await addMediaToCollection(collectionId, [mediaId])
      }
      collections.onChange(
        isMember
          ? collections.memberOf.filter((id) => id !== collectionId)
          : [...collections.memberOf, collectionId]
      )
    } catch (error) {
      showErrorToast(getVideoMediaErrorMessage(error))
    } finally {
      setSavingCollections(false)
    }
  }

  async function confirmDelete() {
    setDeleting(true)
    try {
      await deleteEditorMedia(scope, mediaId)
      setConfirming(false)
      onDeleted(mediaId)
    } catch (error) {
      showErrorToast(getVideoMediaErrorMessage(error))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
      <ContextMenuPrimitive.Root>
        <ContextMenuPrimitive.Trigger asChild>
          {children}
        </ContextMenuPrimitive.Trigger>
        <ContextMenuPrimitive.Portal>
          <ContextMenuPrimitive.Content className={CONTEXT_MENU_CONTENT_CLASS}>
            {collections ? (
              <ContextMenuPrimitive.Sub>
                <ContextMenuPrimitive.SubTrigger className={CONTEXT_MENU_ITEM_CLASS}>
                  <FolderIcon />
                  Collections
                  <ChevronRightIcon className="ml-auto" />
                </ContextMenuPrimitive.SubTrigger>
                <ContextMenuPrimitive.Portal>
                  <ContextMenuPrimitive.SubContent
                    className={`${CONTEXT_MENU_CONTENT_CLASS} max-w-64`}
                  >
                    {collections.all.length ? (
                      collections.all.map((collection) => (
                        <ContextMenuPrimitive.CheckboxItem
                          key={collection.id}
                          className={`${CONTEXT_MENU_ITEM_CLASS} pr-8`}
                          checked={collections.memberOf.includes(collection.id)}
                          disabled={savingCollections}
                          // Stays open, so several can be ticked in one visit.
                          onSelect={(event) => {
                            event.preventDefault()
                            void toggleCollection(collection.id)
                          }}
                        >
                          <span className="truncate">{collection.name}</span>
                          <ContextMenuPrimitive.ItemIndicator className="absolute right-2 flex items-center">
                            <CheckIcon />
                          </ContextMenuPrimitive.ItemIndicator>
                        </ContextMenuPrimitive.CheckboxItem>
                      ))
                    ) : (
                      <ContextMenuPrimitive.Item
                        className={CONTEXT_MENU_ITEM_CLASS}
                        disabled
                      >
                        No collections yet
                      </ContextMenuPrimitive.Item>
                    )}
                  </ContextMenuPrimitive.SubContent>
                </ContextMenuPrimitive.Portal>
              </ContextMenuPrimitive.Sub>
            ) : null}
            {collections ? (
              <ContextMenuPrimitive.Separator className="-mx-1 my-1 h-px bg-border" />
            ) : null}
            <ContextMenuPrimitive.Item
              className={CONTEXT_MENU_DESTRUCTIVE_ITEM_CLASS}
              onSelect={() => setConfirming(true)}
            >
              <Trash2Icon />
              Delete media
            </ContextMenuPrimitive.Item>
          </ContextMenuPrimitive.Content>
        </ContextMenuPrimitive.Portal>
      </ContextMenuPrimitive.Root>

      <ConfirmDialog
        open={confirming}
        onOpenChange={(open) => {
          if (!deleting) setConfirming(open)
        }}
        title={`Delete ${mediaName}?`}
        description="The file will be erased from storage and will stop loading anywhere it is already used. This cannot be undone."
        confirmLabel="Delete media"
        loading={deleting}
        onConfirm={() => void confirmDelete()}
      />
    </>
  )
}
