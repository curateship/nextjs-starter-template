"use client"

import { useState, useTransition } from "react"
import { Bookmark, Loader2, Plus } from "lucide-react"

import {
  createDirectorySaveCollectionAction,
  getDirectorySaveStateAction,
  toggleDirectorySaveCollectionAction,
  type DirectorySaveCollectionState
} from "@/lib/actions/directories/directory-save-actions"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils/tailwind"

interface DirectorySaveDropdownProps {
  siteId: string
  directoryId: string
  opacity?: number
  className?: string
}

function buildAuthRedirect(authPath: string | null) {
  const path = authPath || "/"
  const currentPath = `${window.location.pathname}${window.location.search}`
  const separator = path.includes("?") ? "&" : "?"
  return `${path}${separator}redirect=${encodeURIComponent(currentPath)}`
}

export function DirectorySaveDropdown({ siteId, directoryId, opacity = 100, className }: DirectorySaveDropdownProps) {
  const [open, setOpen] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [collections, setCollections] = useState<DirectorySaveCollectionState[]>([])
  const [authPath, setAuthPath] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [newFolderName, setNewFolderName] = useState("")
  const [pendingKey, setPendingKey] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const opacityNumber = Number(opacity)
  const resolvedOpacity = Math.min(100, Math.max(0, Number.isFinite(opacityNumber) ? opacityNumber : 100)) / 100

  const loadState = async () => {
    setLoading(true)
    setError(null)
    const result = await getDirectorySaveStateAction({ siteId, directoryId })
    setLoading(false)
    setLoaded(true)
    setAuthPath(result.authPath)

    if (result.error) {
      setError(result.error)
      setCollections(result.collections)
      return
    }

    setCollections(result.collections)
  }

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen)
    if (nextOpen && !loaded && !loading) {
      void loadState()
    }
  }

  const handleToggle = (collection: DirectorySaveCollectionState, saved: boolean) => {
    const key = collection.id || collection.default_key
    if (!key) return

    setPendingKey(key)
    setError(null)

    startTransition(async () => {
      const result = await toggleDirectorySaveCollectionAction({
        siteId,
        directoryId,
        collectionId: collection.id,
        defaultKey: collection.default_key,
        saved
      })

      setPendingKey(null)
      setAuthPath(result.authPath)

      if (!result.authenticated) {
        window.location.href = buildAuthRedirect(result.authPath)
        return
      }

      if (result.error) {
        setError(result.error)
        return
      }

      setCollections(result.collections)
    })
  }

  const handleCreateFolder = () => {
    const name = newFolderName.trim()
    if (!name) return

    setPendingKey("new")
    setError(null)

    startTransition(async () => {
      const result = await createDirectorySaveCollectionAction({ siteId, directoryId, name })

      setPendingKey(null)
      setAuthPath(result.authPath)

      if (!result.authenticated) {
        window.location.href = buildAuthRedirect(result.authPath)
        return
      }

      if (result.error) {
        setError(result.error)
        setCollections(result.collections)
        return
      }

      setNewFolderName("")
      setCollections(result.collections)
    })
  }

  const sortedCollections = [...collections].sort((a, b) => Number(b.saved) - Number(a.saved))

  return (
    <DropdownMenu modal={false} open={open} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label="Save listing"
          className={cn(
            "h-auto w-auto rounded-none bg-transparent p-0 text-white shadow-none hover:bg-transparent hover:text-white",
            className,
            "data-[state=open]:opacity-100 md:data-[state=open]:opacity-100"
          )}
        >
          <Bookmark className="size-7 fill-current drop-shadow-sm" style={{ opacity: resolvedOpacity }} />
        </Button>
      </DropdownMenuTrigger>
      {open ? (
        <DropdownMenuContent
          align="end"
          className="w-64"
          onClick={(event) => event.stopPropagation()}
        >
          <DropdownMenuLabel>Save to</DropdownMenuLabel>
          {loading ? (
            <div className="space-y-2 px-2 py-1.5">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-5 w-40" />
            </div>
          ) : authPath && collections.length === 0 ? (
            <DropdownMenuItem
              onSelect={(event) => {
                event.preventDefault()
                window.location.href = buildAuthRedirect(authPath)
              }}
            >
              Sign in to save
            </DropdownMenuItem>
          ) : (
            sortedCollections.map((collection) => {
              const key = collection.id || collection.default_key || collection.name
              const pending = pendingKey === key && isPending

              return (
                <DropdownMenuCheckboxItem
                  key={key}
                  checked={collection.saved}
                  disabled={pending}
                  className="pl-2 [&>span:first-child]:hidden"
                  onSelect={(event) => event.preventDefault()}
                  onCheckedChange={(checked) => handleToggle(collection, checked === true)}
                >
                  <Bookmark className={cn("size-4", collection.saved && "fill-current")} />
                  <span className="min-w-0 flex-1 truncate">{collection.name}</span>
                  {pending && <Loader2 className="ml-auto size-3 animate-spin" />}
                </DropdownMenuCheckboxItem>
              )
            })
          )}

          <div className="mt-3 space-y-2 p-2" onKeyDown={(event) => event.stopPropagation()}>
            <Input
              value={newFolderName}
              onChange={(event) => setNewFolderName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault()
                  handleCreateFolder()
                }
              }}
              placeholder="New folder"
              disabled={Boolean(authPath) || pendingKey === "new"}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="w-full"
              disabled={Boolean(authPath) || pendingKey === "new" || !newFolderName.trim()}
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                handleCreateFolder()
              }}
            >
              {pendingKey === "new" ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              Create folder
            </Button>
          </div>

          {error && <p className="px-2 pb-2 text-xs text-destructive">{error}</p>}
        </DropdownMenuContent>
      ) : null}
    </DropdownMenu>
  )
}
