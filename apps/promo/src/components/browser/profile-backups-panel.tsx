import * as React from "react"
import { ArchiveRestoreIcon, CloudUploadIcon, Loader2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ErrorRow } from "@/components/ui/error-row"
import { InlineError } from "@/components/ui/inline-error"
import { LoadingRow } from "@/components/ui/loading-row"
import {
  getProfileErrorMessage,
  loadProfileBackups,
  profileJob,
  restoreProfileBackup,
  type ProfileBackups,
  type ProfileRow,
} from "@/lib/api/browser/profiles"
import { formatDateTime } from "@/lib/format/format-time"
import { showErrorToast } from "@/lib/toast/error-toast"

/** A backup moves tens of megabytes; a look every two seconds is plenty. */
const POLL_MS = 2_000

/** The words a refused restore starts with when a volume is already here. */
const ALREADY_HERE = "already has browser data on this machine"

/**
 * The Backups tab of a profile's window: back the profile up, see the ones
 * kept, and restore one.
 *
 * Both run as jobs in the browser program, so this writes a job and follows
 * it. A restore is first asked for without replacing anything. Only when the
 * machine already holds this profile's browser data does it come back refused,
 * and only then is "Replace and restore" offered, beside the reason.
 */
export function ProfileBackupsPanel({
  profile,
  onChanged,
}: {
  profile: ProfileRow
  onChanged: () => Promise<void>
}) {
  const [state, setState] = React.useState<{ data: ProfileBackups | null; error: string | null }>({
    data: null,
    error: null,
  })
  const [attempt, setAttempt] = React.useState(0)
  const [asking, setAsking] = React.useState<"backup" | "restore" | null>(null)

  const read = React.useCallback(async () => {
    try {
      const data = await loadProfileBackups(profile.id)
      setState({ data, error: null })
      return data
    } catch (error) {
      setState({ data: null, error: getProfileErrorMessage(error) })
      return null
    }
  }, [profile.id])

  // Every `setState` happens in the fetch's own callbacks, never in the body
  // of the effect.
  React.useEffect(() => {
    let live = true
    loadProfileBackups(profile.id).then(
      (data) => {
        if (live) setState({ data, error: null })
      },
      (error: unknown) => {
        if (live) setState({ data: null, error: getProfileErrorMessage(error) })
      }
    )
    return () => {
      live = false
    }
  }, [profile.id, attempt])

  const last = state.data?.last ?? null
  const working = last?.status === "queued" || last?.status === "running"

  // Followed while a backup or restore is going, then the dashboard is told
  // once, so its row stops saying the profile is busy.
  React.useEffect(() => {
    if (!working) return
    const timer = setInterval(() => {
      void read().then((data) => {
        const done = data?.last && data.last.status !== "queued" && data.last.status !== "running"
        if (done) void onChanged()
      })
    }, POLL_MS)
    return () => clearInterval(timer)
  }, [working, read, onChanged])

  async function ask(kind: "backup" | "restore", work: () => Promise<void>) {
    if (profile.browser !== "stopped") {
      showErrorToast(`Stop ${profile.name}'s browser first. An open browser is still writing its cookies.`)
      return
    }
    setAsking(kind)
    try {
      await work()
      await read()
      await onChanged()
    } catch (error) {
      showErrorToast(getProfileErrorMessage(error))
    } finally {
      setAsking(null)
    }
  }

  function backUp() {
    void ask("backup", () => profileJob(profile.id, "backup"))
  }

  function restore(backupId: string, replace: boolean) {
    void ask("restore", () => restoreProfileBackup(profile.id, backupId, replace))
  }

  if (state.error) {
    return <ErrorRow message={state.error} onRetry={() => setAttempt((count) => count + 1)} />
  }
  if (!state.data) return <LoadingRow label="Reading the backups" className="min-h-48" />

  const { backups } = state.data
  const refusedHere = last?.kind === "restore" && last.status === "failed" && last.lastError?.includes(ALREADY_HERE)

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Backups</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 text-sm">
        <p className="text-muted-foreground">
          A backup is this profile&apos;s cookies and identity, encrypted with the server&apos;s key
          and kept in R2, so its sign-ins survive a lost machine and can move to another one. The
          newest 5 are kept. Its browser has to be stopped.
        </p>

        {working ? (
          <p role="status" className="flex items-center gap-2 text-muted-foreground">
            <Loader2Icon className="size-4 animate-spin" />
            {last?.kind === "restore" ? "Restoring" : "Backing up"}
          </p>
        ) : last?.status === "failed" && last.lastError ? (
          <div className="grid gap-3">
            <InlineError>{last.lastError}</InlineError>
            {refusedHere && last.backupId ? (
              <div>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  disabled={Boolean(asking)}
                  onClick={() => restore(last.backupId!, true)}
                >
                  {asking === "restore" ? <Loader2Icon className="animate-spin" /> : null}
                  Replace and restore
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}

        <div>
          <Button type="button" variant="outline" size="sm" disabled={Boolean(asking) || working} onClick={backUp}>
            {asking === "backup" ? <Loader2Icon className="animate-spin" /> : <CloudUploadIcon />}
            Back up now
          </Button>
        </div>

        {backups.length ? (
          <ul className="grid divide-y rounded-lg border">
            {backups.map((backup) => (
              <li key={backup.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <span className="min-w-0">
                  <span className="font-medium">{formatDateTime(backup.createdAt)}</span>
                  <span className="text-muted-foreground"> · {megabytes(backup.sizeBytes)}</span>
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={Boolean(asking) || working}
                  onClick={() => restore(backup.id, false)}
                >
                  <ArchiveRestoreIcon />
                  Restore
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground">No backups yet.</p>
        )}
      </CardContent>
    </Card>
  )
}

function megabytes(bytes: number): string {
  return `${Math.max(1, Math.round(bytes / 1024 ** 2))}MB`
}
