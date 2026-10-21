import * as React from "react"
import { Loader2Icon, SearchIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  getCarouselErrorMessage,
  keepStockPhoto,
  searchStockPhotos,
  type PexelsPhoto,
} from "@/lib/api/video/carousels"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * Free photos from Pexels in the Image panel: a search, a grid of photos to
 * suit the carousel's shape, and one press to put one on the slide. The
 * photo is saved to the library first, with its photographer's credit as its
 * description (workspace/docs/carousel-pictures.md).
 */
export function StockPhotoSearch({
  carouselId,
  onPlace,
}: {
  carouselId: string
  onPlace: (
    picture: { id: string; url: string; name: string },
    size: { width: number; height: number }
  ) => void
}) {
  const [query, setQuery] = React.useState("")
  const [photos, setPhotos] = React.useState<PexelsPhoto[] | null>(null)
  const [searching, setSearching] = React.useState(false)
  const [keeping, setKeeping] = React.useState<number | null>(null)

  async function search() {
    const words = query.trim()
    if (!words) {
      showErrorToast("Type what the photo should show first.")
      return
    }
    setSearching(true)
    try {
      setPhotos(await searchStockPhotos(carouselId, words))
    } catch (error) {
      showErrorToast(getCarouselErrorMessage(error))
    } finally {
      setSearching(false)
    }
  }

  async function place(photo: PexelsPhoto) {
    setKeeping(photo.pexelsId)
    try {
      const kept = await keepStockPhoto(carouselId, photo)
      onPlace(kept, { width: photo.width, height: photo.height })
    } catch (error) {
      showErrorToast(getCarouselErrorMessage(error))
    } finally {
      setKeeping(null)
    }
  }

  return (
    <div className="grid gap-3">
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          void search()
        }}
      >
        <Input
          aria-label="Search free photos"
          placeholder="Search free photos"
          value={query}
          maxLength={100}
          onChange={(event) => setQuery(event.target.value)}
        />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="submit"
              variant="outline"
              size="icon"
              aria-label="Search Pexels"
              disabled={searching}
            >
              {searching ? (
                <Loader2Icon className="animate-spin" />
              ) : (
                <SearchIcon />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>Search Pexels</TooltipContent>
        </Tooltip>
      </form>

      {photos && !photos.length ? (
        <p className="text-sm text-muted-foreground">
          Pexels has no photos for that. Try other words.
        </p>
      ) : null}

      {photos?.length ? (
        <>
          <div style={{ columnCount: 2, columnGap: 10 }}>
            {photos.map((photo) => (
              <button
                key={photo.pexelsId}
                type="button"
                className="st-hovlift relative mb-2.5 block w-full overflow-hidden rounded-xl border p-0"
                style={{ breakInside: "avoid", background: "var(--elev)" }}
                disabled={keeping !== null}
                aria-label={`Add ${photo.alt || "this photo"}, by ${photo.photographer}`}
                onClick={() => void place(photo)}
              >
                <img
                  src={photo.previewUrl}
                  alt=""
                  loading="lazy"
                  draggable={false}
                  className="block h-auto w-full"
                  style={{ aspectRatio: `${photo.width} / ${photo.height}` }}
                />
                {keeping === photo.pexelsId ? (
                  <span className="absolute inset-0 grid place-items-center bg-black/40 text-white">
                    <Loader2Icon className="size-5 animate-spin" />
                  </span>
                ) : null}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Photos from{" "}
            <a
              href="https://www.pexels.com"
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              Pexels
            </a>
            , free to use. Each one keeps its photographer&apos;s name in its
            description.
          </p>
        </>
      ) : null}
    </div>
  )
}
