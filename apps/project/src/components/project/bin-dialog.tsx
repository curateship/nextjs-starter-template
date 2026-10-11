import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import { ArchiveRestoreIcon, Loader2Icon, Trash2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ErrorRow } from "@/components/ui/error-row"
import { LoadingRow } from "@/components/ui/loading-row"
import { emptyBin, loadBin, restoreProjectTask, type ProjectBin } from "@/lib/api/project/tasks"
import { formatDateTime } from "@/lib/format/format-time"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { getProjectErrorMessage } from "@/lib/project/errors"
import { BIN_DAYS } from "@/lib/project/rules"

type Loaded = { state: "loading" } | { state: "error"; message: string } | { state: "ready"; bin: ProjectBin }

/**
 * The project's bin: tasks deleted in the last 30 days, who deleted them and
 * when, with Bring back. The owner and admins can empty it early.
 */
export function BinDialog({
  projectId,
  open,
  onClose,
}: {
  projectId: string
  open: boolean
  onClose: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => (next ? null : onClose())}>
      <DialogContent variant="admin" className="sm:max-w-lg">
        {/* Mounted only while open, so each opening starts with a fresh load. */}
        {open ? <BinContents projectId={projectId} onClose={onClose} /> : null}
      </DialogContent>
    </Dialog>
  )
}

function BinContents({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const router = useRouter()
  const [loaded, setLoaded] = React.useState<Loaded>({ state: "loading" })
  const [reloads, setReloads] = React.useState(0)
  const [emptying, setEmptying] = React.useState(false)
  const [run, busy] = useAsyncAction(getProjectErrorMessage)

  React.useEffect(() => {
    let live = true
    loadBin(projectId).then(
      (bin) => live && setLoaded({ state: "ready", bin }),
      (error: unknown) => live && setLoaded({ state: "error", message: getProjectErrorMessage(error) })
    )
    return () => {
      live = false
    }
  }, [projectId, reloads])

  async function restore(taskId: string, title: string) {
    if (await run(() => restoreProjectTask(taskId), `"${title}" is back.`)) {
      setReloads((n) => n + 1)
      await router.invalidate()
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Bin</DialogTitle>
        <DialogDescription>
          Deleted tasks wait here for {BIN_DAYS} days, then they're gone for good with their files.
        </DialogDescription>
      </DialogHeader>
      <DialogBody>
        {loaded.state === "loading" ? (
          <LoadingRow label="Loading the bin…" />
        ) : loaded.state === "error" ? (
          <ErrorRow message={loaded.message} onRetry={() => setReloads((n) => n + 1)} />
        ) : loaded.bin.entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">The bin is empty.</p>
        ) : (
          <ul className="grid gap-3">
            {loaded.bin.entries.map((entry) => (
              <li key={entry.id} className="flex items-center gap-3 text-sm">
                <div className="grid min-w-0 flex-1">
                  <span className="truncate font-medium">{entry.title}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    Deleted {entry.deletedByName ? `by ${entry.deletedByName}, ` : ""}
                    {formatDateTime(entry.deletedAt)}
                  </span>
                </div>
                {entry.canRestore ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => void restore(entry.id, entry.title)}
                  >
                    <ArchiveRestoreIcon className="size-4" />
                    Bring back
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </DialogBody>
      <DialogFooter>
        {loaded.state === "ready" && loaded.bin.canEmpty && loaded.bin.entries.length ? (
          <Button type="button" variant="outline" className="mr-auto" onClick={() => setEmptying(true)}>
            <Trash2Icon className="size-4" />
            Empty bin
          </Button>
        ) : null}
        <Button type="button" onClick={onClose}>
          {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
          Done
        </Button>
      </DialogFooter>
      <ConfirmDialog
        open={emptying}
        onOpenChange={setEmptying}
        title="Empty the bin?"
        description="Every task in it is deleted for good now, with its steps, chat and files. This can't be undone."
        confirmLabel="Empty bin"
        destructive
        loading={busy}
        onConfirm={async () => {
          if (!(await run(() => emptyBin(projectId), "The bin is empty."))) return
          setEmptying(false)
          setReloads((n) => n + 1)
        }}
      />
    </>
  )
}
