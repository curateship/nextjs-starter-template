import * as React from "react"
import { FileIcon, ListTodoIcon, MessagesSquareIcon } from "lucide-react"

import { SmallPicture } from "@/components/project/task-files-card"
import { ErrorRow } from "@/components/ui/error-row"
import { LoadingRow } from "@/components/ui/loading-row"
import { ScrollArea } from "@/components/ui/scroll-area"
import { loadProjectFiles, type ProjectFile } from "@/lib/api/project/task-files"
import { formatFileSize } from "@/lib/format/format-bytes"
import { formatDateTime, formatTimeAgo } from "@/lib/format/format-time"
import { getProjectErrorMessage } from "@/lib/project/errors"
import { taskFileHref } from "@/lib/project/files"
import { useProjectLive } from "@/lib/project/use-project-live"

type Loaded = { state: "loading" } | { state: "error"; message: string } | { state: "ready"; files: ProjectFile[] }

/**
 * The project's Files tab: every file from its tasks and its own chat in one
 * list, newest first, so "where was that logo?" has one place to look. Each
 * name downloads the file, and the line under it opens the task it is on or
 * the project's chat. It follows changes live, the same as the Board.
 * See `workspace/docs/projects-and-tasks.md`, "The Files tab".
 */
export function ProjectFiles({
  projectId,
  onOpenTask,
  onOpenChat,
}: {
  projectId: string
  onOpenTask: (taskId: string) => void
  onOpenChat: () => void
}) {
  const [loaded, setLoaded] = React.useState<Loaded>({ state: "loading" })

  const reload = React.useCallback(async () => {
    try {
      setLoaded({ state: "ready", files: await loadProjectFiles(projectId) })
    } catch (error) {
      // A failed refresh keeps the list already showing.
      setLoaded((current) =>
        current.state === "ready" ? current : { state: "error", message: getProjectErrorMessage(error) }
      )
    }
  }, [projectId])

  React.useEffect(() => {
    void reload()
  }, [reload])
  useProjectLive(projectId, () => true, () => void reload())

  if (loaded.state === "loading") return <LoadingRow label="Loading the files…" />
  if (loaded.state === "error") {
    return (
      <ErrorRow
        message={loaded.message}
        onRetry={() => {
          setLoaded({ state: "loading" })
          void reload()
        }}
      />
    )
  }
  if (loaded.files.length === 0) {
    return (
      <p className="p-4 text-sm text-muted-foreground">
        No files yet. Files added to a task, or sent in a chat, show here.
      </p>
    )
  }
  return (
    <ScrollArea className="min-h-0 flex-1" viewportClassName="h-full">
      <ul className="grid gap-2 p-3" aria-label="Files">
        {loaded.files.map((file) => (
          <li key={file.id} className="flex min-w-0 items-center gap-3 rounded-lg border p-2">
            {file.picture ? (
              <a
                href={taskFileHref(file.id, true)}
                target="_blank"
                rel="noreferrer"
                aria-label={`Open ${file.name} full size`}
                className="shrink-0"
              >
                <SmallPicture fileId={file.id} />
              </a>
            ) : (
              <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted">
                <FileIcon className="size-4 text-muted-foreground" aria-hidden />
              </span>
            )}
            <div className="grid min-w-0 flex-1 gap-0.5">
              <a
                href={taskFileHref(file.id)}
                download={file.name}
                className="truncate text-sm font-medium hover:underline focus-visible:underline focus-visible:outline-none"
              >
                {file.name}
              </a>
              <span className="truncate text-xs text-muted-foreground">
                {formatFileSize(file.sizeBytes)} · {file.uploadedBy?.name ?? "A former member"} ·{" "}
                <time dateTime={file.createdAt} title={formatDateTime(file.createdAt)}>
                  {formatTimeAgo(file.createdAt)}
                </time>
              </span>
              <button
                type="button"
                onClick={() => (file.task ? onOpenTask(file.task.id) : onOpenChat())}
                className="flex min-w-0 items-center gap-1 justify-self-start text-xs text-muted-foreground hover:text-foreground hover:underline focus-visible:text-foreground focus-visible:underline focus-visible:outline-none"
              >
                {file.task ? (
                  <>
                    <ListTodoIcon className="size-3 shrink-0" aria-hidden />
                    <span className="truncate">{file.task.title}</span>
                  </>
                ) : (
                  <>
                    <MessagesSquareIcon className="size-3 shrink-0" aria-hidden />
                    In the project's chat
                  </>
                )}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </ScrollArea>
  )
}
