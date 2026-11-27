import * as React from "react"

import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { LoadingRow } from "@/components/ui/loading-row"
import {
  deleteSavedVideosFn,
  getSavedVideoErrorMessage,
  loadSavedVideoDeleteSummary,
  type SavedVideoDeleteResult,
  type SavedVideoDeleteSummary,
} from "@/lib/api/viral/viral-videos"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * The window before saved videos are deleted. It reads, from the database,
 * how many of them the vault keeps a copy of, and says so before anything
 * goes: those files stay, so a saved idea never stops playing.
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
          ? `"${videos[0].title}" goes for good, with its downloaded file, its breakdown and its cover.`
          : "They go for good, with their downloaded files, breakdowns and covers."
      }
      confirmLabel={one ? "Delete video" : "Delete videos"}
      loading={busy}
      disabled={!counted}
      onConfirm={() => void confirm()}
    >
      {counted ? (
        <p className="text-sm text-muted-foreground">
          {counted.inVault
            ? `${counted.inVault === 1 ? "One of them is" : `${counted.inVault} of them are`} in the vault. The vault keeps its copy, so ${counted.inVault === 1 ? "that idea still plays" : "those ideas still play"}.`
            : `Nothing in the vault uses ${one ? "it" : "them"}.`}
        </p>
      ) : (
        <LoadingRow label="Checking the vault" />
      )}
    </ConfirmDialog>
  )
}
