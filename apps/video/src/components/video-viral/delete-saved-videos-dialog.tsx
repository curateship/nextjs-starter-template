import * as React from "react"
import { Link } from "@tanstack/react-router"

import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { LoadingRow } from "@/components/ui/loading-row"
import {
  deleteSavedVideosFn,
  getSavedVideoErrorMessage,
  loadSavedVideoDeleteSummary,
  type SavedVideoDeleteResult,
  type SavedVideoDeleteSummary,
} from "@/lib/api/video/viral-videos"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * The window before saved videos are deleted. It reads, from the database,
 * which editor projects Copy this made from them and which projects use the
 * downloaded file on their timeline, and says what happens to each before
 * anything goes.
 */
export function DeleteSavedVideosDialog({
  videos,
  onOpenChange,
  onDeleted,
}: {
  /** The saved videos to delete. Empty keeps the window shut. */
  videos: { savedVideoId: string; title: string }[]
  onOpenChange: (open: boolean) => void
  onDeleted: (result: SavedVideoDeleteResult) => void | Promise<void>
}) {
  const ids = videos.map((video) => video.savedVideoId)
  const idsKey = ids.join(",")
  const [summary, setSummary] = React.useState<{
    key: string
    value: SavedVideoDeleteSummary
  } | null>(null)
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    if (!idsKey) return
    let live = true
    loadSavedVideoDeleteSummary(idsKey.split(","))
      .then((value) => {
        if (live) setSummary({ key: idsKey, value })
      })
      .catch((error) => {
        if (live) showErrorToast(getSavedVideoErrorMessage(error))
      })
    return () => {
      live = false
    }
  }, [idsKey])

  const counted = summary?.key === idsKey ? summary.value : null
  const one = videos.length === 1

  async function confirm() {
    setBusy(true)
    try {
      const result = await deleteSavedVideosFn(ids)
      await onDeleted(result)
    } catch (error) {
      showErrorToast(getSavedVideoErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <ConfirmDialog
      open={videos.length > 0}
      onOpenChange={onOpenChange}
      title={one ? "Delete this saved video?" : `Delete ${videos.length} saved videos?`}
      description={
        one
          ? `“${videos[0].title}” goes for good, with its downloaded file, its breakdown and its cover. If it is starred, it stays in your favourites.`
          : "They go for good, with their downloaded files, breakdowns and covers. Any that are starred stay in your favourites."
      }
      confirmLabel={one ? "Delete video" : "Delete videos"}
      loading={busy}
      disabled={!counted}
      onConfirm={() => void confirm()}
    >
      {counted ? (
        <div className="grid gap-3 text-sm">
          {counted.copiedBy.length ? (
            <ProjectList
              heading={
                counted.copiedBy.length === 1
                  ? "This editor project was made with Copy this. It stays, and its Copy panel will say the original video was deleted:"
                  : `These ${counted.copiedBy.length} editor projects were made with Copy this. They stay, and their Copy panels will say the original video was deleted:`
              }
              projects={counted.copiedBy}
            />
          ) : (
            <p className="text-muted-foreground">
              No editor project was made from {one ? "it" : "them"} with Copy
              this.
            </p>
          )}
          {counted.timelinesUsingFile.length ? (
            <ProjectList
              heading={`The downloaded file stays in your media library, because ${counted.timelinesUsingFile.length === 1 ? "this project uses it" : "these projects use it"} on the timeline:`}
              projects={counted.timelinesUsingFile}
            />
          ) : null}
        </div>
      ) : (
        <LoadingRow label="Checking which projects were made from it" />
      )}
    </ConfirmDialog>
  )
}

function ProjectList({
  heading,
  projects,
}: {
  heading: string
  projects: { id: string; name: string }[]
}) {
  return (
    <div className="grid gap-1.5">
      <p>{heading}</p>
      <ul className="grid gap-1 pl-4">
        {projects.map((project) => (
          <li key={project.id} className="list-disc">
            <Link
              to="/admin/video-editor/$projectId"
              params={{ projectId: project.id }}
              className="underline-offset-2 hover:underline"
            >
              {project.name}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
