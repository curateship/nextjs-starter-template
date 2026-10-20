import * as React from "react"
import { HistoryIcon, Loader2Icon, Pause, Play } from "lucide-react"
import { toast } from "sonner"

import { DashboardCardTitleHeader } from "@/components/shared/dashboard-card-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { LoadingRow } from "@/components/ui/loading-row"
import { ScrollArea } from "@/components/ui/scroll-area"
import { EditorPreview } from "@/components/video-editor/editor-preview"
import { StudioTimeline } from "@/components/video-editor/studio-timeline"
import {
  createEditorStore,
  createInitialEditorState,
  EditorContext,
  useEditorRuntime,
} from "@/components/video-editor/editor-store"
import {
  getProjectVersion,
  getProjectVersionErrorMessage,
  listProjectVersions,
  restoreProjectVersion,
  type ProjectVersionItem,
} from "@/lib/api/video/project-versions"
import { formatDateTime } from "@/lib/format/format-time"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"
import {
  PlaybackClock,
  usePlaybackPlaying,
} from "@/lib/video/playback-clock"
import {
  BREAK_MS,
  KEEP_VERSIONS,
  VERSION_REASON_LABEL,
} from "@/lib/video/project-versions"
import type { ProjectTimeline } from "@/lib/video/timeline-schema"
import { formatClock } from "@/lib/video/timeline-utils"

/** "Before a break · 12 clips · 0:42 · 9:16" */
function versionFacts(item: ProjectVersionItem) {
  return [
    VERSION_REASON_LABEL[item.reason],
    `${item.clip_count} ${item.clip_count === 1 ? "clip" : "clips"}`,
    formatClock(item.duration_ms),
    item.aspect,
  ].join(" · ")
}

/**
 * The History panel at the foot of the editor rail: the project's kept
 * versions, newest first (see `workspace/docs/project-history.md`). Clicking
 * one opens it in a window of its own; only Restore there changes anything.
 */
export function HistoryPanel() {
  const { projectId, store, dispatch, clock, saveNow } = useEditorRuntime()
  const [versions, setVersions] = React.useState<ProjectVersionItem[] | null>(
    null
  )
  const [loadFailed, setLoadFailed] = React.useState(false)
  const [reads, setReads] = React.useState(0)
  const [open, setOpen] = React.useState<ProjectVersionItem | null>(null)
  const [restoring, setRestoring] = React.useState(false)
  const reload = () => setReads((count) => count + 1)

  React.useEffect(() => {
    let active = true
    listProjectVersions(projectId)
      .then((loaded) => {
        if (!active) return
        setVersions(loaded)
        setLoadFailed(false)
      })
      .catch((error) => {
        if (!active) return
        setLoadFailed(true)
        showErrorToast(getProjectVersionErrorMessage(error))
      })
    return () => {
      active = false
    }
  }, [projectId, reads])

  async function restore(item: ProjectVersionItem) {
    // A read-only window says so and offers a reload, as for any other edit.
    if (store.refuseIfLocked()) return
    setRestoring(true)
    try {
      // The server keeps what it holds as "Before restoring", so it has to
      // hold what is on screen first.
      await saveNow()
      if (store.getSnapshot().saveStatus === "error") {
        showErrorToast(
          "The latest edits are not saved, so nothing was restored. Try again once they save."
        )
        return
      }
      const timeline = await restoreProjectVersion(projectId, item.id)
      clock.pause()
      dispatch({ type: "RESTORE_TIMELINE", timeline })
      dismissErrorToast()
      toast.success(
        `Restored the version saved ${formatDateTime(item.saved_at)}. What you had is kept in History.`
      )
      setOpen(null)
      reload()
    } catch (error) {
      showErrorToast(getProjectVersionErrorMessage(error))
    } finally {
      setRestoring(false)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <DashboardCardTitleHeader
        icon={<HistoryIcon className="size-4" />}
        title="History"
      />
      <ScrollArea className="min-h-0 flex-1">
        <div className="grid grid-cols-[minmax(0,1fr)] gap-2 p-4">
          {versions === null && !loadFailed ? (
            <LoadingRow label="Loading this project's history" />
          ) : loadFailed ? (
            <div className="grid justify-items-center gap-2 py-8 text-center text-sm text-muted-foreground">
              The history could not be loaded.
              <Button type="button" variant="outline" onClick={reload}>
                Try again
              </Button>
            </div>
          ) : !versions?.length ? (
            <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
              No earlier versions yet. One is kept at your first change after
              a {BREAK_MS / 60_000} minute break, and once an hour while you
              edit.
            </p>
          ) : (
            <>
              <ul className="grid gap-2">
                {versions.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      className="grid w-full min-w-0 gap-0.5 rounded-lg border p-2 text-left transition-colors hover:bg-muted"
                      onClick={() => {
                        clock.pause()
                        setOpen(item)
                      }}
                    >
                      <span className="truncate text-xs font-medium tabular-nums">
                        {formatDateTime(item.saved_at)}
                      </span>
                      {/* Who saved it, when it was a guest sent from Project. */}
                      {item.edited_by ? (
                        <span className="truncate text-[0.625rem] text-muted-foreground">
                          Saved by {item.edited_by}
                        </span>
                      ) : null}
                      <span className="truncate text-[0.625rem] text-muted-foreground tabular-nums">
                        {versionFacts(item)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              <p className="text-[0.625rem] text-muted-foreground">
                The newest {KEEP_VERSIONS} are kept.
              </p>
            </>
          )}
        </div>
      </ScrollArea>

      <Dialog
        open={open !== null}
        onOpenChange={(next) => {
          if (!next && !restoring) setOpen(null)
        }}
      >
        {open ? (
          <VersionWindow
            key={open.id}
            projectId={projectId}
            item={open}
            restoring={restoring}
            onClose={() => setOpen(null)}
            onRestore={() => void restore(open)}
          />
        ) : null}
      </Dialog>
    </div>
  )
}

/**
 * One version, played on a copy of its own: a separate store, locked so
 * nothing in it can change, and a separate playhead. Closing the window
 * throws both away, so looking never touches the project.
 */
function VersionWindow({
  projectId,
  item,
  restoring,
  onClose,
  onRestore,
}: {
  projectId: string
  item: ProjectVersionItem
  restoring: boolean
  onClose: () => void
  onRestore: () => void
}) {
  const [timeline, setTimeline] = React.useState<ProjectTimeline | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let active = true
    getProjectVersion(projectId, item.id)
      .then((loaded) => {
        if (active) setTimeline(loaded.timeline)
      })
      .catch((loadError) => {
        if (active) setError(getProjectVersionErrorMessage(loadError))
      })
    return () => {
      active = false
    }
  }, [projectId, item.id])

  return (
    <DialogContent variant="admin">
      <DialogHeader>
        <DialogTitle>{formatDateTime(item.saved_at)}</DialogTitle>
        <DialogDescription>
          {versionFacts(item)}. Playing it here changes nothing in the
          project. Restore puts it on the timeline, and keeps what you have
          now in History first.
        </DialogDescription>
      </DialogHeader>
      <DialogBody>
        <Card size="sm">
          <CardHeader>
            <CardTitle>Preview</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2">
            {error ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {error}
              </p>
            ) : timeline ? (
              <VersionPlayer projectId={projectId} timeline={timeline} />
            ) : (
              <LoadingRow label="Loading this version" />
            )}
          </CardContent>
        </Card>
      </DialogBody>
      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          disabled={restoring}
          onClick={onClose}
        >
          Cancel
        </Button>
        <Button
          type="button"
          disabled={restoring || !timeline}
          onClick={onRestore}
        >
          {restoring ? <Loader2Icon className="animate-spin" /> : null}
          Restore this version
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}

function VersionPlayer({
  projectId,
  timeline,
}: {
  projectId: string
  timeline: ProjectTimeline
}) {
  const [runtime] = React.useState(() => {
    const store = createEditorStore(
      createInitialEditorState(timeline),
      "",
      // A drag on the picture or a clip would change it; the lock refuses it
      // quietly.
      () => undefined
    )
    store.setLock("read-only")
    const clock = new PlaybackClock()
    clock.setDuration(store.getSnapshot().durationMs)
    return {
      store,
      dispatch: store.dispatch,
      clock,
      projectId,
      saveNow: async () => undefined,
      setProjectName: () => undefined,
    }
  })
  const { clock } = runtime
  const playing = usePlaybackPlaying(clock)
  React.useEffect(() => () => clock.pause(), [clock])

  return (
    <EditorContext.Provider value={runtime}>
      {/* studio-root carries the editor's colours, which the preview reads. */}
      <div className="studio-root grid gap-2">
        <div className="relative h-64 rounded-lg bg-muted">
          <EditorPreview />
        </div>
        {/* The editor's own timeline on this locked copy, so a version looks
            the way it did: frames, sound shapes, names and lanes. */}
        <div className="h-56 overflow-hidden rounded-lg border">
          <StudioTimeline readOnly />
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" onClick={() => clock.toggle()}>
            {playing ? <Pause /> : <Play />}
            {playing ? "Pause" : "Play"}
          </Button>
          <PlayheadTime clock={clock} durationMs={runtime.store.getSnapshot().durationMs} />
        </div>
      </div>
    </EditorContext.Provider>
  )
}

function PlayheadTime({
  clock,
  durationMs,
}: {
  clock: PlaybackClock
  durationMs: number
}) {
  const timeMs = React.useSyncExternalStore(
    clock.subscribe,
    () => Math.floor(clock.getTime() / 1000),
    () => 0
  )
  return (
    <span className="text-sm text-muted-foreground tabular-nums">
      {formatClock(timeMs * 1000)} / {formatClock(durationMs)}
    </span>
  )
}
