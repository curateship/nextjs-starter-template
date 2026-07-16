"use client"

import { useState, useTransition } from "react"
import { usePathname, useSearchParams } from "@/lib/navigation-client"
import Bookmark from "lucide-react/dist/esm/icons/bookmark.js"
import Loader2 from "lucide-react/dist/esm/icons/loader-circle.js"
import Plus from "lucide-react/dist/esm/icons/plus.js"

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
  DropdownMenuLabel,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { useSiteAuthUser } from "@/components/frontend/layout/site-auth-provider"
import { cn } from "@/lib/utils/tailwind"

interface DirectorySaveDropdownProps {
  siteId: string
  directoryId: string
  opacity?: number
  loginPath?: string
  className?: string
}

function buildAuthHref(authPath: string, redirectPath: string) {
  const separator = authPath.includes("?") ? "&" : "?"
  return `${authPath}${separator}tab=login&redirect=${encodeURIComponent(redirectPath)}`
}

export function DirectorySaveDropdown({ siteId, directoryId, opacity = 100, loginPath = "/account", className }: DirectorySaveDropdownProps) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const user = useSiteAuthUser()
  const [open, setOpen] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [collections, setCollections] = useState<DirectorySaveCollectionState[]>([])
  const [error, setError] = useState<string | null>(null)
  const [newFolderName, setNewFolderName] = useState("")
  const [pendingKey, setPendingKey] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const opacityNumber = Number(opacity)
  const resolvedOpacity = Math.min(100, Math.max(0, Number.isFinite(opacityNumber) ? opacityNumber : 100)) / 100
  const search = searchParams.toString()
  const redirectPath = `${pathname || "/"}${search ? `?${search}` : ""}`
  const authHref = buildAuthHref(loginPath, redirectPath)

  const loadState = async () => {
    setLoading(true)
    setError(null)
    const result = await getDirectorySaveStateAction({ siteId, directoryId })
    setLoading(false)
    setLoaded(true)

    if (result.error) {
      setError(result.error)
      setCollections(result.collections)
      return
    }

    if (!result.authenticated) {
      window.location.href = authHref
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

      if (result.error) {
        setError(result.error)
        return
      }

      if (!result.authenticated) {
        window.location.href = authHref
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

      if (result.error) {
        setError(result.error)
        setCollections(result.collections)
        return
      }

      if (!result.authenticated) {
        window.location.href = authHref
        return
      }

      setNewFolderName("")
      setCollections(result.collections)
    })
  }

  const sortedCollections = [...collections].sort((a, b) => Number(b.saved) - Number(a.saved))
  const triggerClassName = cn(
    "inline-flex h-auto w-auto items-center justify-center rounded-none bg-transparent p-0 text-white shadow-none hover:bg-transparent hover:text-white",
    className,
    "data-[state=open]:opacity-100 md:data-[state=open]:opacity-100"
  )
  const icon = <Bookmark className="size-7 fill-current drop-shadow-sm" style={{ opacity: resolvedOpacity }} />

  if (!user) {
    return (
      <a href={authHref} aria-label="Save listing" className={triggerClassName}>
        {icon}
      </a>
    )
  }

  return (
    <DropdownMenu modal={false} open={open} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label="Save listing"
          className={triggerClassName}
        >
          {icon}
        </Button>
      </DropdownMenuTrigger>
      {open ? (
        <DropdownMenuContent
          align="end"
          className="w-52"
          onClick={(event) => event.stopPropagation()}
        >
          <DropdownMenuLabel className="mb-2">Save to</DropdownMenuLabel>
          {loading ? (
            <div className="space-y-2 px-2 py-1.5">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-5 w-40" />
            </div>
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

          <div className="mt-1 flex gap-2 px-2 pt-2 pb-2" onKeyDown={(event) => event.stopPropagation()}>
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
              className="h-8 min-w-0 flex-1 bg-background text-muted-foreground shadow-none placeholder:text-muted-foreground"
              disabled={pendingKey === "new"}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="shrink-0 cursor-pointer text-muted-foreground shadow-none disabled:opacity-100"
              aria-disabled={pendingKey === "new" || !newFolderName.trim()}
              disabled={pendingKey === "new"}
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                if (!newFolderName.trim()) return
                handleCreateFolder()
              }}
            >
              {pendingKey === "new" ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              <span className="sr-only">Create folder</span>
            </Button>
          </div>

          {error && <p className="px-2 pb-2 text-xs text-destructive">{error}</p>}
        </DropdownMenuContent>
      ) : null}
    </DropdownMenu>
  )
}
