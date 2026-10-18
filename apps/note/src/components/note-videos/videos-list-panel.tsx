import * as React from "react"
import { GridIcon, ListIcon, Loader2Icon, UploadIcon, VideoIcon } from "lucide-react"

import { VideoCards, type CardActions, type PendingUpload } from "@/components/note-videos/video-cards"
import { DashboardCardTitleHeader } from "@/components/shared/dashboard-card-header"
import {
  DashboardToolbarButton,
  dashboardToolbarButtonActiveClassName,
  dashboardToolbarButtonGroupClassName,
  dashboardToolbarButtonGroupItemClassName,
  DashboardToolbarSearch,
} from "@/components/shared/dashboard-toolbar"
import { Button } from "@/components/ui/button"
import { ErrorRow } from "@/components/ui/error-row"
import { Input } from "@/components/ui/input"
import { LoadingRow } from "@/components/ui/loading-row"
import { ScrollArea } from "@/components/ui/scroll-area"
import { plural } from "@/lib/format/plural"
import { SAMPLE_VIDEO } from "@/lib/note/sample-video"
import { UPLOAD_ACCEPT } from "@/lib/note/upload-check"
import type { NoteVideoView } from "@/lib/note/view-key"
import type { NoteVideoCard } from "@/lib/note/videos"
import { cn } from "@/lib/utils"

/**
 * The middle panel: which folder is showing, the one row of controls (paste a
 * link, upload a file, search, grid or list), and the cards, newest first,
 * fifty at a time.
 */
export function VideosListPanel({
  title,
  count,
  view,
  onView,
  link,
  linkInvalid,
  onLink,
  onSaveLink,
  savingLink,
  onUploadFile,
  query,
  onQuery,
  videos,
  uploads,
  pickedId,
  actions,
  loading,
  failure,
  onRetryList,
  emptyText,
  showSample,
  hasOlder,
  loadingOlder,
  onShowOlder,
}: {
  title: string
  count: number
  view: NoteVideoView
  onView: (view: NoteVideoView) => void
  link: string
  /** The last save of the link was refused, so the box is marked. */
  linkInvalid: boolean
  onLink: (link: string) => void
  onSaveLink: () => void
  savingLink: boolean
  onUploadFile: (file: File) => void
  query: string
  onQuery: (query: string) => void
  videos: NoteVideoCard[]
  uploads: PendingUpload[]
  pickedId: string | null
  actions: CardActions
  loading: boolean
  failure: string | null
  onRetryList: () => void
  /** Said when nothing is on the list, or null when something is. */
  emptyText: string | null
  /** No video saved at all yet, so the made-up one is shown to look at. */
  showSample: boolean
  hasOlder: boolean
  loadingOlder: boolean
  onShowOlder: () => void
}) {
  const fileInput = React.useRef<HTMLInputElement>(null)

  return (
    <>
      <DashboardCardTitleHeader
        icon={<VideoIcon />}
        title={title}
        meta={`${count} ${plural(count, "video")}`}
      />
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b p-3">
        <form
          className="flex min-w-56 flex-1 items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            onSaveLink()
          }}
        >
          <Input
            aria-label="Paste a video link"
            placeholder="Paste a video link"
            inputMode="url"
            autoComplete="off"
            value={link}
            aria-invalid={linkInvalid || undefined}
            onChange={(event) => onLink(event.target.value)}
          />
          <DashboardToolbarButton type="submit" disabled={savingLink}>
            {savingLink ? <Loader2Icon className="size-4 animate-spin" /> : null}
            Save
          </DashboardToolbarButton>
        </form>
        <DashboardToolbarButton
          type="button"
          variant="outline"
          onClick={() => fileInput.current?.click()}
        >
          <UploadIcon className="size-4" />
          Upload
        </DashboardToolbarButton>
        <input
          ref={fileInput}
          type="file"
          accept={UPLOAD_ACCEPT}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(event) => {
            const file = event.target.files?.[0]
            // Cleared so picking the same file again still says something.
            event.target.value = ""
            if (file) onUploadFile(file)
          }}
        />
        <DashboardToolbarSearch
          // A floor on its width, so on a narrow panel it moves to the next
          // line rather than being squeezed out of sight.
          className="min-w-40"
          aria-label="Search titles, transcripts and tags"
          placeholder="Search"
          value={query}
          onChange={(event) => onQuery(event.target.value)}
        />
        <div className={dashboardToolbarButtonGroupClassName}>
          <DashboardToolbarButton
            type="button"
            variant="ghost"
            className={cn(
              dashboardToolbarButtonGroupItemClassName,
              view === "list" && dashboardToolbarButtonActiveClassName
            )}
            aria-pressed={view === "list"}
            onClick={() => onView("list")}
            aria-label="List view"
          >
            <ListIcon className="size-4" />
          </DashboardToolbarButton>
          <DashboardToolbarButton
            type="button"
            variant="ghost"
            className={cn(
              dashboardToolbarButtonGroupItemClassName,
              view === "grid" && dashboardToolbarButtonActiveClassName
            )}
            aria-pressed={view === "grid"}
            onClick={() => onView("grid")}
            aria-label="Grid view"
          >
            <GridIcon className="size-4" />
          </DashboardToolbarButton>
        </div>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        {failure ? (
          <ErrorRow message={failure} onRetry={onRetryList} />
        ) : loading ? (
          <LoadingRow label="Loading videos" />
        ) : (
          <>
            {emptyText && !uploads.length ? (
              <p className="px-4 pt-8 pb-2 text-center text-sm text-muted-foreground">{emptyText}</p>
            ) : null}
            <VideoCards
              view={view}
              videos={showSample ? [SAMPLE_VIDEO] : videos}
              uploads={uploads}
              pickedId={pickedId}
              actions={actions}
            />
            {hasOlder ? (
              <div className="flex justify-center p-3">
                <Button type="button" variant="outline" disabled={loadingOlder} onClick={onShowOlder}>
                  {loadingOlder ? <Loader2Icon className="animate-spin" /> : null}
                  Show older
                </Button>
              </div>
            ) : null}
          </>
        )}
      </ScrollArea>
    </>
  )
}
