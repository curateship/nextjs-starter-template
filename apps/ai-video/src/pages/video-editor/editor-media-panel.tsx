import * as React from "react"
import { ImageIcon, MusicIcon, SearchIcon, VideoIcon } from "lucide-react"

import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  getMediaErrorMessage,
  listMedia,
  type MediaItem,
  type MediaListResponse,
} from "@/lib/api/media"

type MediaTab = "videos" | "images" | "audio"

// Left panel: read-only browser over the real media library. Selecting media
// does nothing yet — adding clips to the timeline is future functionality.
export function EditorMediaPanel() {
  const [tab, setTab] = React.useState<MediaTab>("videos")
  const [search, setSearch] = React.useState("")
  // Results/errors carry the tab they were fetched for, so switching tabs
  // falls back to the loading state without resetting state inside the effect.
  const [result, setResult] = React.useState<{
    tab: MediaTab
    data: MediaListResponse
  } | null>(null)
  const [loadError, setLoadError] = React.useState<{
    tab: MediaTab
    message: string
  } | null>(null)

  // Load fresh media whenever the tab changes. The audio tab fetches nothing:
  // the media library doesn't accept audio mime types yet.
  React.useEffect(() => {
    if (tab === "audio") {
      return
    }

    let active = true
    listMedia({ pageSize: 30, fileType: tab === "videos" ? "video" : "image" })
      .then((response) => {
        if (active) {
          setResult({ tab, data: response })
          setLoadError(null)
        }
      })
      .catch((caught) => {
        if (active) {
          setLoadError({ tab, message: getMediaErrorMessage(caught) })
        }
      })

    return () => {
      active = false
    }
  }, [tab])

  // Only data/errors fetched for the current tab count; anything else renders
  // as loading while the effect above refetches.
  const data = result?.tab === tab ? result.data : null
  const error = loadError?.tab === tab ? loadError.message : null

  // Client-side name filter over the fetched page (same approach as the
  // media library page — the list endpoint has no search parameter).
  const visibleMedia = React.useMemo(() => {
    const query = search.trim().toLowerCase()
    return (data?.media ?? []).filter((item) => {
      if (!query) return true
      return `${item.original_name} ${item.alt_text ?? ""}`
        .toLowerCase()
        .includes(query)
    })
  }, [data?.media, search])

  return (
    <section className="hidden w-[300px] shrink-0 flex-col overflow-hidden rounded-xl border bg-muted/40 md:flex">
      {/* Tabs + search header */}
      <div className="shrink-0 space-y-2 p-3">
        <Tabs value={tab} onValueChange={(value) => setTab(value as MediaTab)}>
          <TabsList className="w-full">
            <TabsTrigger value="videos">Videos</TabsTrigger>
            <TabsTrigger value="images">Images</TabsTrigger>
            <TabsTrigger value="audio">Audio</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search media..."
            className="pl-8"
            aria-label="Search media"
          />
        </div>
      </div>

      {/* Scrollable media grid */}
      <div className="min-h-0 flex-1 overflow-y-auto p-3 pt-0">
        <MediaPanelBody
          tab={tab}
          data={data}
          error={error}
          visibleMedia={visibleMedia}
          searching={search.trim().length > 0}
        />
      </div>
    </section>
  )
}

// Renders the correct body state: audio placeholder, error, loading skeletons,
// empty states, or the thumbnail grid.
function MediaPanelBody({
  tab,
  data,
  error,
  visibleMedia,
  searching,
}: {
  tab: MediaTab
  data: MediaListResponse | null
  error: string | null
  visibleMedia: MediaItem[]
  searching: boolean
}) {
  if (tab === "audio") {
    return (
      <MediaPanelEmpty
        icon={<MusicIcon className="size-5" />}
        message="Audio uploads coming soon"
      />
    )
  }

  if (error) {
    return (
      <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-xs text-destructive">
        {error}
      </div>
    )
  }

  // No response yet — show skeleton tiles while the page loads.
  if (!data) {
    return (
      <div className="grid grid-cols-2 gap-2">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="aspect-video" />
        ))}
      </div>
    )
  }

  if (visibleMedia.length === 0) {
    return (
      <MediaPanelEmpty
        icon={
          tab === "videos" ? (
            <VideoIcon className="size-5" />
          ) : (
            <ImageIcon className="size-5" />
          )
        }
        message={
          searching ? "No matches" : tab === "videos" ? "No videos yet" : "No images yet"
        }
      />
    )
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      {visibleMedia.map((item) => (
        <MediaThumbnail key={item.id} item={item} />
      ))}
    </div>
  )
}

// Single grid tile: video element (paused, metadata-only) or image, plus name.
function MediaThumbnail({ item }: { item: MediaItem }) {
  return (
    <div className="space-y-1">
      <div className="relative aspect-video overflow-hidden rounded-md border bg-muted">
        {item.file_type === "video" ? (
          <>
            <video
              src={item.url}
              className="h-full w-full object-cover"
              muted
              preload="metadata"
            />
            <VideoIcon className="absolute top-1.5 left-1.5 size-3.5 text-white drop-shadow" />
          </>
        ) : (
          <img
            src={item.url}
            alt={item.alt_text ?? item.original_name}
            className="h-full w-full object-cover"
          />
        )}
      </div>
      <p className="truncate text-[11px] text-muted-foreground">
        {item.original_name}
      </p>
    </div>
  )
}

// Centered icon + message used by the audio tab and empty results.
function MediaPanelEmpty({
  icon,
  message,
}: {
  icon: React.ReactNode
  message: string
}) {
  return (
    <div className="flex h-full min-h-32 flex-col items-center justify-center gap-2 text-muted-foreground">
      {icon}
      <p className="text-xs">{message}</p>
    </div>
  )
}
