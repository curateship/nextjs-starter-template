import * as React from "react"
import { FileIcon, Loader2Icon, Trash2Icon, UploadIcon } from "lucide-react"

import type { Change } from "@/components/project/task-body"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { addFileToTask, deleteFileFromTask } from "@/lib/api/project/task-files"
import type { TaskDetail, TaskFile } from "@/lib/api/project/tasks"
import { formatFileSize } from "@/lib/format/format-bytes"
import { getProjectErrorMessage } from "@/lib/project/errors"
import { taskFileHref } from "@/lib/project/files"
import { LIMITS } from "@/lib/project/rules"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

/**
 * Files on a task: drop them on the card or browse for them. Pictures show
 * small and open full size in a new tab; anything else is a name to download.
 * Up to 10 files of 10 MB each, and 5 GB for the whole team, which the server
 * checks too.
 *
 * This is a file field, not an image field, so it doesn't use the shared
 * `ImageUpload`: that puts pictures in the public media library, and a task's
 * files must stay private to the people who can see the task.
 */
export function TaskFilesCard({
  detail,
  readOnly,
  refresh,
  change,
}: {
  detail: TaskDetail
  readOnly: boolean
  refresh: () => Promise<void>
  change: Change
}) {
  const { files } = detail
  const input = React.useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = React.useState<string[]>([])
  const [dragging, setDragging] = React.useState(false)
  const room = LIMITS.filesPerTask - files.length

  async function upload(picked: File[]) {
    if (picked.length === 0) return
    const tooBig = picked.filter((file) => file.size > LIMITS.fileBytes)
    for (const file of tooBig) {
      showErrorToast(`"${file.name}" is ${formatFileSize(file.size)}. A file can be at most 10 MB.`)
    }
    const fitting = picked.filter((file) => file.size <= LIMITS.fileBytes)
    if (fitting.length > room) {
      showErrorToast(
        room === 0
          ? "A task can hold at most 10 files. Delete one to add another."
          : `This task has room for ${room} more ${room === 1 ? "file" : "files"}, so only the first ${room} were added.`
      )
    }
    const sending = fitting.slice(0, Math.max(room, 0))
    if (sending.length === 0) return
    setUploading(sending.map((file) => file.name))
    let added = 0
    for (const file of sending) {
      try {
        await addFileToTask(detail.task.id, file)
        added += 1
      } catch (error) {
        showErrorToast(`"${file.name}" wasn't added. ${getProjectErrorMessage(error)}`)
      }
      setUploading((current) => current.slice(1))
    }
    if (added) await refresh()
  }

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>
          Files{files.length ? ` · ${files.length} of ${LIMITS.filesPerTask}` : ""}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        {files.length === 0 && uploading.length === 0 ? (
          <p className="text-sm text-muted-foreground">No files yet.</p>
        ) : (
          <ul className="grid gap-2">
            {files.map((file) => (
              <FileRow key={file.id} file={file} change={change} />
            ))}
            {uploading.map((name, index) => (
              <li key={`${name}-${index}`} className="flex items-center gap-3 text-sm">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-md border">
                  <Loader2Icon className="size-4 animate-spin text-muted-foreground" aria-hidden />
                </span>
                <span className="min-w-0 truncate">Adding {name}…</span>
              </li>
            ))}
          </ul>
        )}
        {readOnly ? null : (
          <div
            className={cn(
              "flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed bg-muted/50 px-3 py-4 text-center transition-colors",
              dragging && "border-ring bg-muted"
            )}
            onDragOver={(event) => {
              event.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault()
              setDragging(false)
              void upload([...event.dataTransfer.files])
            }}
          >
            <p className="text-sm text-muted-foreground">
              Drop files here, up to 10 MB each.
            </p>
            <Button
              type="button"
              variant="outline"
              disabled={uploading.length > 0}
              onClick={() => input.current?.click()}
            >
              <UploadIcon className="size-4" />
              Browse files
            </Button>
            <input
              ref={input}
              type="file"
              multiple
              hidden
              aria-label="Add files to the task"
              onChange={(event) => {
                const picked = [...(event.target.files ?? [])]
                event.target.value = ""
                void upload(picked)
              }}
            />
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function FileRow({ file, change }: { file: TaskFile; change: Change }) {
  const [confirmDelete, setConfirmDelete] = React.useState(false)
  const [busy, setBusy] = React.useState(false)

  return (
    <li className="flex items-center gap-3 text-sm">
      {file.picture ? (
        <a
          href={taskFileHref(file.id, true)}
          target="_blank"
          rel="noreferrer"
          className="shrink-0"
          aria-label={`Open ${file.name} full size`}
        >
          <SmallPicture fileId={file.id} />
        </a>
      ) : (
        <span className="flex size-10 shrink-0 items-center justify-center rounded-md border">
          <FileIcon className="size-4 text-muted-foreground" aria-hidden />
        </span>
      )}
      <div className="grid min-w-0 flex-1">
        <a href={taskFileHref(file.id)} download={file.name} className="truncate font-medium hover:underline">
          {file.name}
        </a>
        <span className="truncate text-xs text-muted-foreground">
          {formatFileSize(file.sizeBytes)}
          {file.uploadedBy ? ` · ${file.uploadedBy.name}` : ""}
        </span>
      </div>
      {file.canDelete ? (
        confirmDelete ? (
          <div className="flex shrink-0 items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setConfirmDelete(false)}>
              Keep it
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={busy}
              onClick={async () => {
                setBusy(true)
                await change(() => deleteFileFromTask(file.id), "File deleted.")
                setBusy(false)
              }}
            >
              Delete file
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Delete ${file.name}`}
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2Icon className="size-4" />
          </Button>
        )
      ) : null}
    </li>
  )
}

/**
 * A picture drawn small. It is fetched and drawn from memory rather than
 * pointed at by an image tag, because the local dev server sends every
 * request a browser makes for an image to its own static files, which answer
 * 404 for Project's file address. The live server has no such step, but this
 * way the card shows the same picture on both.
 */
function SmallPicture({ fileId }: { fileId: string }) {
  const [src, setSrc] = React.useState<string | null>(null)
  const [failed, setFailed] = React.useState(false)

  React.useEffect(() => {
    let url: string | null = null
    let live = true
    fetch(taskFileHref(fileId, true))
      .then((response) => {
        if (!response.ok) throw new Error(String(response.status))
        return response.blob()
      })
      .then(
        (blob) => {
          if (!live) return
          url = URL.createObjectURL(blob)
          setSrc(url)
        },
        () => live && setFailed(true)
      )
    return () => {
      live = false
      if (url) URL.revokeObjectURL(url)
    }
  }, [fileId])

  if (!src) {
    return (
      <span className="flex size-10 items-center justify-center rounded-md border">
        {failed ? (
          <FileIcon className="size-4 text-muted-foreground" aria-hidden />
        ) : (
          <Loader2Icon className="size-4 animate-spin text-muted-foreground" aria-hidden />
        )}
      </span>
    )
  }
  return <img src={src} alt="" className="size-10 rounded-md border object-cover" />
}
