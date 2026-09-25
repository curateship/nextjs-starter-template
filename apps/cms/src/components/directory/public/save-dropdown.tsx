import * as React from "react"
import { BookmarkIcon, Loader2Icon, PlusIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import {
  createSavedList,
  getSaveErrorMessage,
  loadSaveState,
  setSaved,
  type SaveCollectionState,
} from "@/lib/api/directory/saves"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

function isAuthenticationError(error: unknown) {
  return error instanceof Error && error.message.includes("AUTH_REQUIRED")
}

function signInForCurrentPage() {
  const redirect = `${window.location.pathname}${window.location.search}`
  window.location.assign(`/login?redirect=${encodeURIComponent(redirect)}`)
}

/** Loads only when opened, so personal saves never hold up a public page. */
export function SaveDropdown({
  listingId,
  overlay = false,
  className,
}: {
  listingId: string
  overlay?: boolean
  className?: string
}) {
  const [open, setOpen] = React.useState(false)
  const [collections, setCollections] = React.useState<
    SaveCollectionState[] | null
  >(null)
  const [loading, setLoading] = React.useState(false)
  const [loadError, setLoadError] = React.useState(false)
  const [busyId, setBusyId] = React.useState<string | null>(null)
  const [name, setName] = React.useState("")
  const [creating, setCreating] = React.useState(false)
  const [createAttempted, setCreateAttempted] = React.useState(false)

  function load() {
    setLoading(true)
    setLoadError(false)
    void loadSaveState(listingId)
      .then(setCollections)
      .catch((error) => {
        if (isAuthenticationError(error)) {
          signInForCurrentPage()
          return
        }
        setLoadError(true)
        showErrorToast(getSaveErrorMessage(error))
      })
      .finally(() => setLoading(false))
  }

  function changeOpen(next: boolean) {
    setOpen(next)
    if (next && !collections && !loading && !loadError) load()
  }

  async function toggle(collection: SaveCollectionState, next: boolean) {
    setBusyId(collection.id)
    try {
      setCollections(
        await setSaved({ listingId, collectionId: collection.id, saved: next })
      )
    } catch (error) {
      if (isAuthenticationError(error)) {
        signInForCurrentPage()
        return
      }
      showErrorToast(getSaveErrorMessage(error))
    } finally {
      setBusyId(null)
    }
  }

  async function create() {
    setCreateAttempted(true)
    if (!name.trim()) {
      showErrorToast("Give the saved list a name.")
      return
    }
    setCreating(true)
    try {
      setCollections(await createSavedList(listingId, name))
      setName("")
      setCreateAttempted(false)
    } catch (error) {
      if (isAuthenticationError(error)) {
        signInForCurrentPage()
        return
      }
      showErrorToast(getSaveErrorMessage(error))
    } finally {
      setCreating(false)
    }
  }

  const sortedCollections = [...(collections ?? [])].sort(
    (left, right) => Number(right.saved) - Number(left.saved)
  )
  const changingCollection = busyId !== null

  return (
    <DropdownMenu modal={false} open={open} onOpenChange={changeOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label="Save listing"
          className={cn(
            "z-10 bg-transparent shadow-none hover:bg-transparent",
            overlay && "text-white drop-shadow-sm hover:text-white",
            className
          )}
        >
          <BookmarkIcon className="size-7 fill-current" />
        </Button>
      </DropdownMenuTrigger>
      {open ? (
        <DropdownMenuContent
          align="end"
          className="w-52"
          onClick={(event) => event.stopPropagation()}
        >
          <DropdownMenuLabel>Save to</DropdownMenuLabel>
          {loading ? (
            <div className="flex min-h-12 items-center justify-center">
              <Loader2Icon
                className="size-4 animate-spin text-muted-foreground"
                aria-label="Loading saved lists"
              />
            </div>
          ) : loadError ? (
            <div className="grid min-h-16 content-center justify-items-center gap-2 px-2 text-center">
              <p className="text-xs text-destructive">
                Saved lists could not be loaded.
              </p>
              <Button type="button" size="sm" variant="outline" onClick={load}>
                Try again
              </Button>
            </div>
          ) : (
            sortedCollections.map((collection) => (
              <DropdownMenuCheckboxItem
                key={collection.id}
                checked={collection.saved}
                disabled={changingCollection || creating}
                className="pl-1.5 [&>span:first-child]:hidden"
                onSelect={(event) => event.preventDefault()}
                onCheckedChange={(checked) =>
                  void toggle(collection, checked === true)
                }
              >
                <BookmarkIcon
                  className={cn("size-4", collection.saved && "fill-current")}
                />
                <span className="min-w-0 flex-1 truncate">{collection.name}</span>
                {busyId === collection.id ? (
                  <Loader2Icon className="ml-auto size-3 animate-spin" />
                ) : null}
              </DropdownMenuCheckboxItem>
            ))
          )}

          <DropdownMenuSeparator />
          <DropdownMenuLabel>New folder</DropdownMenuLabel>
          <div
            className="flex gap-2 px-1.5 pb-1.5"
            onKeyDown={(event) => event.stopPropagation()}
          >
            <Input
              aria-label="New folder name"
              aria-invalid={createAttempted && !name.trim()}
              placeholder="Folder name"
              maxLength={80}
              value={name}
              disabled={creating || changingCollection}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault()
                  void create()
                }
              }}
            />
            <Button
              type="button"
              size="icon"
              variant="outline"
              disabled={creating || changingCollection}
              aria-disabled={creating || changingCollection || !name.trim()}
              aria-label="Create folder"
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                void create()
              }}
            >
              {creating ? (
                <Loader2Icon className="animate-spin" />
              ) : (
                <PlusIcon />
              )}
            </Button>
          </div>
        </DropdownMenuContent>
      ) : null}
    </DropdownMenu>
  )
}
