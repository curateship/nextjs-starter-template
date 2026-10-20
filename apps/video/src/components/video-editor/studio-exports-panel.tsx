import * as React from "react"
import {
  DownloadIcon,
  FilmIcon,
  Link2Icon,
  Loader2Icon,
  RotateCwIcon,
  SettingsIcon,
  Trash2Icon,
  UploadIcon,
} from "lucide-react"
import { toast } from "sonner"

import { DashboardCardTitleHeader } from "@/components/shared/dashboard-card-header"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { LoadingRow } from "@/components/ui/loading-row"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useEditorRuntime } from "@/components/video-editor/editor-store"
import { useProjectGuest } from "@/components/video-editor/project-guest"
import { ExportCover } from "@/components/video-editor/export-cover"
import { ExportDetailsDialog } from "@/components/video-editor/export-details-dialog"
import { ExportShareDialog } from "@/components/video-editor/export-share-dialog"
import { ExportRowStatus } from "@/components/video-editor/exports-page"
import { isExportActive } from "@/components/video-editor/use-project-exports"
import {
  deleteExports,
  getExportErrorMessage,
  listExports,
  retryExport,
  stopExport,
  type ExportListWithShares,
  type RenderJobSummary,
} from "@/lib/api/video/exports"
import { formatFileSize } from "@/lib/format/format-bytes"
import { formatDate } from "@/lib/format/format-time"
import { showErrorToast } from "@/lib/toast/error-toast"

/** How often the panel asks again while an export is waiting or being made. */
const POLL_MS = 3_000

/**
 * The Exports panel at the foot of the editor rail: every export of this
 * project, newest first, with its download, share link, details, Try again
 * and delete. An export still waiting or being made has Stop export instead
 * of delete, and stopping it leaves the project's other exports going. The
 * Exports page in the left menu still lists every project's.
 * New exports are started from the Export button at the top, as before.
 */
export function ExportsPanel() {
  const { projectId } = useEditorRuntime()
  // A guest sent from Project downloads, names and retries exports, but
  // makes no share links and deletes nothing (`workspace/docs/project-guests.md`).
  const guest = useProjectGuest() !== null
  const [list, setList] = React.useState<ExportListWithShares | null>(null)
  const [loadFailed, setLoadFailed] = React.useState(false)
  const [reads, setReads] = React.useState(0)
  const [editing, setEditing] = React.useState<RenderJobSummary | null>(null)
  const [sharing, setSharing] = React.useState<RenderJobSummary | null>(null)
  const [deleting, setDeleting] = React.useState<RenderJobSummary | null>(null)
  const [busyId, setBusyId] = React.useState<string | null>(null)
  const reload = () => setReads((count) => count + 1)

  React.useEffect(() => {
    let active = true
    listExports({ projectId, pageSize: 100 })
      .then((loaded) => {
        if (!active) return
        setList(loaded)
        setLoadFailed(false)
      })
      .catch((error) => {
        if (!active) return
        setLoadFailed(true)
        showErrorToast(getExportErrorMessage(error))
      })
    return () => {
      active = false
    }
  }, [projectId, reads])

  const anyActive = list?.exports.some(isExportActive) ?? false
  React.useEffect(() => {
    if (!anyActive) return
    const timer = setTimeout(() => setReads((count) => count + 1), POLL_MS)
    return () => clearTimeout(timer)
  }, [anyActive, list])

  async function retry(item: RenderJobSummary) {
    setBusyId(item.id)
    try {
      await retryExport(item.id)
      reload()
    } catch (error) {
      showErrorToast(getExportErrorMessage(error))
    } finally {
      setBusyId(null)
    }
  }

  async function stop(item: RenderJobSummary) {
    setBusyId(item.id)
    try {
      await stopExport(item.id)
      toast.success("Export stopped. No file was made.")
    } catch (error) {
      showErrorToast(getExportErrorMessage(error))
    } finally {
      setBusyId(null)
      reload()
    }
  }

  async function confirmDelete() {
    if (!deleting) return
    setBusyId(deleting.id)
    try {
      const { deleted_ids: deleted } = await deleteExports([deleting.id])
      if (deleted.length) toast.success("Export deleted.")
      else {
        showErrorToast(
          "The export was kept because its file could not be removed from storage. Try again in a minute."
        )
      }
      setDeleting(null)
      reload()
    } catch (error) {
      showErrorToast(getExportErrorMessage(error))
    } finally {
      setBusyId(null)
    }
  }

  const sharedIds = new Set(list?.shared_ids ?? [])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <DashboardCardTitleHeader
        icon={<UploadIcon className="size-4" />}
        title="Exports"
      />
      <ScrollArea className="min-h-0 flex-1">
        <div className="grid grid-cols-[minmax(0,1fr)] gap-2 p-4">
          {list === null && !loadFailed ? (
            <LoadingRow label="Loading this project's exports" />
          ) : loadFailed ? (
            <div className="grid justify-items-center gap-2 py-8 text-center text-sm text-muted-foreground">
              The exports could not be loaded.
              <Button type="button" variant="outline" onClick={reload}>
                Try again
              </Button>
            </div>
          ) : !list?.exports.length ? (
            <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
              Nothing exported from this project yet. Press Export at the top
              to make the video file.
            </p>
          ) : (
            <ul className="grid gap-2">
              {list.exports.map((item) => {
                const name = item.title ?? "Untitled export"
                return (
                  <li key={item.id} className="grid min-w-0 gap-2 rounded-lg border p-2">
                    <div className="grid grid-cols-[3.5rem_minmax(0,1fr)] items-start gap-2">
                      <span className="flex aspect-square w-14 items-center justify-center overflow-hidden rounded-md bg-muted">
                        {item.has_thumbnail ? (
                          <ExportCover
                            exportId={item.id}
                            className="size-full object-contain"
                            fallback={<FilmIcon className="size-4 text-muted-foreground" />}
                          />
                        ) : (
                          <FilmIcon className="size-4 text-muted-foreground" />
                        )}
                      </span>
                      <div className="grid min-w-0 gap-0.5">
                        <span className="line-clamp-2 text-xs font-medium [overflow-wrap:anywhere]">
                          {name}
                        </span>
                        <span className="truncate text-[0.625rem] text-muted-foreground tabular-nums">
                          {[
                            item.aspect,
                            item.file_size ? formatFileSize(item.file_size) : null,
                            item.finished_at ? formatDate(item.finished_at) : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                        <span className="text-xs">
                          <ExportRowStatus item={item} shared={sharedIds.has(item.id)} />
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center justify-end gap-1">
                      {item.status === "ready" ? (
                        <>
                          <Button asChild variant="ghost" size="icon-sm">
                            <a
                              href={`/api/v1/video/exports/${item.id}/file?filename=${encodeURIComponent(item.title ?? "export")}`}
                              download
                              aria-label={`Download ${name}`}
                            >
                              <DownloadIcon />
                            </a>
                          </Button>
                          {guest ? null : (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Share ${name}`}
                              onClick={() => setSharing(item)}
                            >
                              <Link2Icon />
                            </Button>
                          )}
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Edit ${name}`}
                            onClick={() => setEditing(item)}
                          >
                            <SettingsIcon />
                          </Button>
                        </>
                      ) : null}
                      {item.status === "error" ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          disabled={busyId === item.id}
                          aria-label={`Try ${name} again`}
                          onClick={() => void retry(item)}
                        >
                          <RotateCwIcon />
                        </Button>
                      ) : null}
                      {isExportActive(item) ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={busyId === item.id}
                          aria-label={`Stop export ${name}`}
                          onClick={() => void stop(item)}
                        >
                          {busyId === item.id ? (
                            <Loader2Icon className="animate-spin" />
                          ) : null}
                          Stop export
                        </Button>
                      ) : guest ? null : (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          disabled={busyId === item.id}
                          aria-label={`Delete ${name}`}
                          onClick={() => setDeleting(item)}
                        >
                          <Trash2Icon />
                        </Button>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </ScrollArea>

      <ExportDetailsDialog
        open={!!editing}
        item={editing}
        onClose={() => setEditing(null)}
        onSaved={reload}
      />

      {sharing ? (
        <ExportShareDialog
          key={sharing.id}
          item={sharing}
          onClose={() => setSharing(null)}
          onChanged={reload}
        />
      ) : null}

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
        title="Delete this export?"
        description={
          deleting && sharedIds.has(deleting.id)
            ? "The file goes for good, and its share link stops working. The project stays as it is."
            : "The file goes for good. The project stays as it is."
        }
        confirmLabel="Delete export"
        loading={busyId !== null}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  )
}
