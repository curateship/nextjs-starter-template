import * as React from "react"
import { Loader2Icon, SearchIcon } from "lucide-react"

import { useTravelServices } from "@/components/travel/use-travel-services"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { pickUnsplashPhoto, searchUnsplash, type UnsplashPhoto } from "@/lib/api/travel/services"
import { getTravelErrorMessage } from "@/lib/travel/errors"
import type { PhotoCredit } from "@/lib/travel/rules"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

const PER_PAGE = 20

/**
 * "Photo by <name> on Unsplash", both names linking back, as Unsplash's rules
 * ask under every photo of theirs that's shown.
 */
export function PhotoCreditLine({ credit, className }: { credit: PhotoCredit; className?: string }) {
  return (
    <p className={cn("text-xs text-muted-foreground", className)}>
      Photo by{" "}
      <a
        href={credit.profileUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="underline underline-offset-2 hover:text-foreground"
      >
        {credit.name}
      </a>{" "}
      on{" "}
      <a
        href={credit.photoPageUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="underline underline-offset-2 hover:text-foreground"
      >
        Unsplash
      </a>
    </p>
  )
}

/**
 * An "Unsplash" button that opens a photo search. Picking a photo tells
 * Unsplash it was used, then hands its address and credit to `onPick`.
 * Draws nothing when the server has no Unsplash key, so Upload stands alone.
 */
export function UnsplashPicker({
  startQuery = "",
  onPick,
  disabled,
}: {
  /** The words searched first, such as the activity's title or the trip's destination. */
  startQuery?: string
  onPick: (photo: { url: string; credit: PhotoCredit }) => void
  disabled?: boolean
}) {
  const { unsplash } = useTravelServices()
  const [open, setOpen] = React.useState(false)
  if (!unsplash) return null
  return (
    <>
      <Button type="button" variant="outline" disabled={disabled} onClick={() => setOpen(true)}>
        Unsplash
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        {open ? (
          <UnsplashSearch
            startQuery={startQuery}
            onClose={() => setOpen(false)}
            onPick={(photo) => {
              setOpen(false)
              onPick(photo)
            }}
          />
        ) : null}
      </Dialog>
    </>
  )
}

function UnsplashSearch({
  startQuery,
  onClose,
  onPick,
}: {
  startQuery: string
  onClose: () => void
  onPick: (photo: { url: string; credit: PhotoCredit }) => void
}) {
  const [query, setQuery] = React.useState(startQuery)
  const [searched, setSearched] = React.useState("")
  const [photos, setPhotos] = React.useState<UnsplashPhoto[]>([])
  const [page, setPage] = React.useState(0)
  const [more, setMore] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const [failed, setFailed] = React.useState(false)
  const [picking, setPicking] = React.useState<string | null>(null)
  const latest = React.useRef(0)

  const run = React.useCallback(async (words: string, nextPage: number) => {
    const text = words.trim()
    if (!text) return
    const ask = ++latest.current
    setLoading(true)
    setFailed(false)
    try {
      const found = await searchUnsplash(text, nextPage)
      if (ask !== latest.current) return
      setSearched(text)
      setPage(nextPage)
      setMore(found.length >= PER_PAGE)
      setPhotos((current) => {
        if (nextPage === 1) return found
        const seen = new Set(current.map((photo) => photo.id))
        return [...current, ...found.filter((photo) => !seen.has(photo.id))]
      })
    } catch (error) {
      if (ask !== latest.current) return
      setFailed(true)
      showErrorToast(getTravelErrorMessage(error))
    } finally {
      if (ask === latest.current) setLoading(false)
    }
  }, [])

  // The first search starts just after the window draws, not during it.
  React.useEffect(() => {
    const timer = window.setTimeout(() => void run(startQuery, 1), 0)
    return () => window.clearTimeout(timer)
  }, [run, startQuery])

  async function pick(photo: UnsplashPhoto) {
    setPicking(photo.id)
    try {
      await pickUnsplashPhoto(photo.downloadLocation)
      onPick({ url: photo.url, credit: photo.credit })
    } catch (error) {
      showErrorToast(getTravelErrorMessage(error))
    } finally {
      setPicking(null)
    }
  }

  const firstLoad = loading && page === 0

  return (
    <DialogContent variant="admin" className="sm:max-w-3xl">
      <DialogHeader>
        <DialogTitle>Photos from Unsplash</DialogTitle>
        <DialogDescription>Free photos. The photographer's name shows under the one you pick.</DialogDescription>
      </DialogHeader>
      <DialogBody>
        <Card size="sm">
          <CardContent className="grid gap-4">
            <form
              className="grid gap-2"
              onSubmit={(event) => {
                event.preventDefault()
                void run(query, 1)
              }}
            >
              <Label htmlFor="unsplash-search">Search</Label>
              <div className="flex gap-2">
                <Input
                  id="unsplash-search"
                  value={query}
                  maxLength={100}
                  placeholder="Kyoto temple"
                  onChange={(event) => setQuery(event.target.value)}
                />
                <Button type="submit" variant="outline" disabled={loading}>
                  {loading ? <Loader2Icon className="animate-spin" /> : <SearchIcon />}
                  Search
                </Button>
              </div>
            </form>

            {firstLoad ? (
              <div className="flex justify-center py-10">
                <Loader2Icon aria-label="Loading photos" className="size-5 animate-spin text-muted-foreground" />
              </div>
            ) : failed && photos.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                The photos couldn't be loaded. Press Search to try again.
              </p>
            ) : photos.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                {searched ? `No photos for "${searched}". Try other words.` : "Type a few words and press Search."}
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {photos.map((photo) => (
                  <div key={photo.id} className="grid min-w-0 gap-1">
                    <button
                      type="button"
                      aria-label={`Use this photo by ${photo.credit.name}`}
                      disabled={picking !== null}
                      onClick={() => void pick(photo)}
                      className="relative aspect-[4/3] cursor-pointer overflow-hidden rounded-md bg-muted outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-wait"
                    >
                      <img
                        src={photo.thumbUrl}
                        alt=""
                        loading="lazy"
                        className="size-full object-cover transition-opacity hover:opacity-90"
                      />
                      {picking === photo.id ? (
                        <span className="absolute inset-0 flex items-center justify-center bg-background/60">
                          <Loader2Icon aria-hidden className="size-5 animate-spin" />
                        </span>
                      ) : null}
                    </button>
                    <PhotoCreditLine credit={photo.credit} className="truncate" />
                  </div>
                ))}
              </div>
            )}

            {more && photos.length > 0 ? (
              <div className="flex justify-center">
                <Button
                  type="button"
                  variant="outline"
                  disabled={loading}
                  onClick={() => void run(searched, page + 1)}
                >
                  {loading ? <Loader2Icon className="animate-spin" /> : null}
                  Load more
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}
