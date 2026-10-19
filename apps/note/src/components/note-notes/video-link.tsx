import * as React from "react"
import { Link } from "@tanstack/react-router"
import { Loader2Icon, PlayIcon, VideoIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { getNotesErrorMessage } from "@/lib/api/note/notes"
import { loadVideos } from "@/lib/api/note/videos"
import { focusRing } from "@/lib/layout/focus-ring"
import type { LinkedVideo } from "@/lib/note/notes/notes"
import type { NoteVideoCard } from "@/lib/note/videos"
import { cn } from "@/lib/utils"

/**
 * The note's link to one of the person's saved videos. Linked, it shows the
 * video's cover, title and summary, read live from the video. A deleted
 * video empties the link and says so.
 */
export function VideoLink({
  video,
  gone,
  readOnly,
  onLink,
}: {
  video: LinkedVideo | null
  gone: boolean
  readOnly: boolean
  onLink: (videoId: string | null) => Promise<void>
}) {
  const [busy, setBusy] = React.useState(false)
  async function link(videoId: string | null) {
    setBusy(true)
    try {
      await onLink(videoId)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-3">
      {video ? (
        <div className="grid gap-3">
          <div className="flex min-w-0 gap-3">
            <div className="flex aspect-video w-28 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted">
              {video.coverUrl ? (
                <img src={video.coverUrl} alt="" className="size-full object-cover" />
              ) : (
                <VideoIcon aria-hidden className="size-5 text-muted-foreground" />
              )}
            </div>
            <div className="grid min-w-0 content-start gap-1">
              <Link
                to="/videos"
                search={{ folder: undefined, open: video.id }}
                className={cn("line-clamp-2 text-sm font-medium hover:underline", focusRing)}
              >
                {video.title}
              </Link>
              <span className="text-xs text-muted-foreground">Opens on Videos</span>
            </div>
          </div>
          {video.summary.length ? (
            <ul className="grid list-disc gap-1 pl-5 text-sm">
              {video.summary.map((line, index) => (
                <li key={index}>{line}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">This video has not been analysed yet, so it has no summary.</p>
          )}
        </div>
      ) : gone ? (
        <p className="text-sm text-muted-foreground">The video this note was linked to has been deleted.</p>
      ) : (
        <p className="text-sm text-muted-foreground">No video linked.</p>
      )}
      {readOnly ? null : (
        <div className="flex flex-wrap gap-2">
          <VideoPicker busy={busy} label={video ? "Change video" : "Link a video"} onPick={(id) => void link(id)} />
          {video || gone ? (
            <Button type="button" variant="ghost" disabled={busy} onClick={() => void link(null)}>
              Remove link
            </Button>
          ) : null}
        </div>
      )}
    </div>
  )
}

const SEARCH_DELAY_MS = 300

function VideoPicker({ label, busy, onPick }: { label: string; busy: boolean; onPick: (videoId: string) => void }) {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")
  const [result, setResult] = React.useState<{ for: string; videos: NoteVideoCard[]; failure: string | null } | null>(null)

  React.useEffect(() => {
    if (!open) return
    let live = true
    const timer = setTimeout(() => {
      loadVideos({ search: query.trim() || undefined })
        .then((page) => {
          if (live) setResult({ for: query, videos: page.videos, failure: null })
        })
        .catch((error) => {
          if (live) setResult({ for: query, videos: [], failure: getNotesErrorMessage(error) })
        })
    }, SEARCH_DELAY_MS)
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [open, query])

  const loading = !result || result.for !== query
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" disabled={busy}>
          {busy ? <Loader2Icon className="animate-spin" /> : <PlayIcon />}
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="grid w-80 gap-2 p-2">
        <Input
          aria-label="Search your videos"
          placeholder="Search your videos"
          value={query}
          autoFocus
          onChange={(event) => setQuery(event.target.value)}
        />
        <ScrollArea className="h-64">
          {result?.failure ? (
            <p className="p-2 text-sm text-muted-foreground">{result.failure}</p>
          ) : loading ? (
            <p className="flex items-center gap-2 p-2 text-sm text-muted-foreground">
              <Loader2Icon className="size-4 animate-spin" />
              Looking…
            </p>
          ) : !result.videos.length ? (
            <p className="p-2 text-sm text-muted-foreground">
              {query.trim() ? "No video matches." : "No saved videos yet. Save one on Videos first."}
            </p>
          ) : (
            <ul className="grid" aria-label="Your videos">
              {result.videos.map((video) => (
                <li key={video.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onPick(video.id)
                      setOpen(false)
                    }}
                    className={cn("flex w-full min-w-0 items-center gap-2 rounded-sm p-2 text-left text-sm hover:bg-muted", focusRing)}
                  >
                    <span className="flex aspect-video w-14 shrink-0 items-center justify-center overflow-hidden rounded border bg-muted">
                      {video.coverUrl ? (
                        <img src={video.coverUrl} alt="" className="size-full object-cover" />
                      ) : (
                        <VideoIcon aria-hidden className="size-4 text-muted-foreground" />
                      )}
                    </span>
                    <span className="line-clamp-2 min-w-0">{video.title}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  )
}
