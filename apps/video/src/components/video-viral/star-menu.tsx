import * as React from "react"
import { Loader2Icon, PlusIcon, StarIcon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { FormDialog } from "@/components/ui/form-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { getViralErrorMessage } from "@/lib/api/video/viral"
import {
  createViralCollection,
  setViralStar,
  type ViralCollectionSummary,
} from "@/lib/api/video/viral-collections"
import { plural } from "@/lib/format/plural"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"
import type { ViralVideo } from "@/lib/video/viral"
import { starredCopy } from "@/lib/video/viral-view"

/**
 * The star on a video: a small menu of your collections, tick one or more,
 * or make a new one. Starring only bookmarks. It is free, downloads nothing
 * and runs no breakdown, and a starred video keeps its own copy of its
 * details, so it stays starred whatever happens to the search that found it.
 */

export type Favourites = {
  collections: ViralCollectionSummary[]
  /** Which collections each video is in, keyed `platform:platformVideoId`. */
  starred: Record<string, string[]>
}

/**
 * The menu itself. Given one video it shows a tick for each collection the
 * video is in; given several (the toolbar while videos are ticked) every pick
 * stars all of them.
 */
export function StarMenu({
  videos,
  favourites,
  sourceProjectId,
  onChanged,
  trigger,
}: {
  videos: ViralVideo[]
  favourites: Favourites
  /** The Viral project the star was pressed in, kept on the starred copy. */
  sourceProjectId: string | null
  /** Resolves once the screen has read the stars again. */
  onChanged: () => Promise<void>
  /** Left out, a star button sized for a card. */
  trigger?: React.ReactNode
}) {
  const [busy, setBusy] = React.useState(false)
  const [naming, setNaming] = React.useState(false)
  const single = videos.length === 1 ? videos[0] : null
  const inCollections = single ? (favourites.starred[single.key] ?? []) : []
  const starred = inCollections.length > 0

  async function set(collection: { id: string; name: string }, on: boolean) {
    if (busy) return
    setBusy(true)
    dismissErrorToast()
    try {
      await setViralStar({
        collectionId: collection.id,
        videos: videos.map(starredCopy),
        starred: on,
        sourceProjectId,
      })
      await onChanged()
      toast.success(
        on
          ? `Starred ${videos.length === 1 ? "it" : `${videos.length} ${plural(videos.length, "video")}`} into “${collection.name}”.`
          : `Taken out of “${collection.name}”.`
      )
    } catch (error) {
      showErrorToast(getViralErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  const label = single
    ? starred
      ? "Starred. Change its collections"
      : "Star into a collection"
    : `Star ${videos.length} ${plural(videos.length, "video")}`

  return (
    <>
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              {trigger ?? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={label}
                  aria-pressed={single ? starred : undefined}
                  onClick={(event) => event.stopPropagation()}
                >
                  {busy ? (
                    <Loader2Icon className="animate-spin" />
                  ) : (
                    <StarIcon
                      className={cn(starred && "fill-amber-400 text-amber-500")}
                    />
                  )}
                </Button>
              )}
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>{label}</TooltipContent>
        </Tooltip>
        <DropdownMenuContent
          align="end"
          className="w-60"
          onClick={(event) => event.stopPropagation()}
        >
          <DropdownMenuLabel>
            {single ? "Star into" : `Star ${videos.length} ${plural(videos.length, "video")} into`}
          </DropdownMenuLabel>
          {favourites.collections.map((collection) => (
            <DropdownMenuCheckboxItem
              key={collection.id}
              checked={inCollections.includes(collection.id)}
              onSelect={(event) => event.preventDefault()}
              onCheckedChange={(on) => void set(collection, on === true)}
            >
              <span className="truncate">{collection.name}</span>
            </DropdownMenuCheckboxItem>
          ))}
          {favourites.collections.length ? <DropdownMenuSeparator /> : null}
          <DropdownMenuItem onSelect={() => setNaming(true)}>
            <PlusIcon />
            New collection
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <NewCollectionDialog
        open={naming}
        onOpenChange={setNaming}
        onCreated={(created) => set(created, true)}
      />
    </>
  )
}

/** Names a new collection; the video being starred goes straight into it. */
export function NewCollectionDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (created: { id: string; name: string }) => Promise<void>
}) {
  const [name, setName] = React.useState("")
  const [invalid, setInvalid] = React.useState(false)
  const [busy, setBusy] = React.useState(false)

  const [wasOpen, setWasOpen] = React.useState(open)
  if (wasOpen !== open) {
    setWasOpen(open)
    if (open) {
      setName("")
      setInvalid(false)
    }
  }

  async function submit() {
    if (busy) return
    if (!name.trim()) {
      setInvalid(true)
      showErrorToast("A collection needs a name.")
      return
    }
    setBusy(true)
    dismissErrorToast()
    try {
      const created = await createViralCollection(name)
      onOpenChange(false)
      await onCreated(created)
    } catch (error) {
      setInvalid(true)
      showErrorToast(getViralErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <FormDialog
      open={open}
      dirty={name.trim() !== ""}
      busy={busy}
      onClose={() => onOpenChange(false)}
    >
      {(requestClose) => (
        <DialogContent variant="admin" className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>New collection</DialogTitle>
            <DialogDescription>
              Holds starred videos from any project. Only you see it.
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(event) => {
              event.preventDefault()
              void submit()
            }}
          >
            <DialogBody>
              <Card size="sm">
                <CardHeader>
                  <CardTitle>Collection</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="viral-collection-name">Name</Label>
                    <Input
                      id="viral-collection-name"
                      autoFocus
                      maxLength={120}
                      value={name}
                      placeholder="Gym hooks"
                      aria-invalid={invalid || undefined}
                      onChange={(event) => {
                        setName(event.target.value)
                        setInvalid(false)
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
              <Button type="submit" disabled={busy}>
                {busy ? <Loader2Icon className="animate-spin" /> : null}
                Create collection
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      )}
    </FormDialog>
  )
}
