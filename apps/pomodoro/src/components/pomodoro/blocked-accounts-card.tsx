import * as React from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { LoadingRow } from "@/components/ui/loading-row"
import {
  loadBlockedAccounts,
  unblockProfile,
} from "@/lib/api/pomodoro/following"
import { showErrorToast } from "@/lib/toast/error-toast"

type BlockedRow = Awaited<ReturnType<typeof loadBlockedAccounts>>[number]

/**
 * The accounts this person has blocked, on Settings → Profile.
 *
 * A block is undone here and nowhere else, because the blocked person's page
 * is a 404 to you once you have blocked them, so there is no Unblock button
 * to put on it.
 *
 * The card is not drawn at all when nobody is blocked. An empty "Blocked
 * people" card on everybody's settings page suggests a problem most people do
 * not have.
 */
export default function BlockedAccountsCard() {
  const [rows, setRows] = React.useState<BlockedRow[] | null>(null)
  const [busy, setBusy] = React.useState<string | null>(null)

  React.useEffect(() => {
    let cancelled = false
    void loadBlockedAccounts()
      .then((result) => {
        if (!cancelled) setRows(result)
      })
      .catch(() => {
        if (!cancelled) setRows([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (!rows) return <LoadingRow label="Loading blocked people…" />
  if (!rows.length) return null

  const unblock = async (row: BlockedRow) => {
    if (!row.handle) return
    setBusy(row.handle)
    try {
      await unblockProfile(row.handle)
      setRows((current) =>
        (current ?? []).filter((entry) => entry.handle !== row.handle)
      )
      toast.success("Unblocked.")
    } catch {
      showErrorToast("That could not be undone. Try again.")
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Blocked people</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-2">
        <p className="text-sm text-muted-foreground">
          You and these people cannot see each other anywhere in the app.
          Unblocking does not put back any follow the block removed.
        </p>
        {rows.map((row) => (
          <div
            key={row.handle}
            className="flex min-h-9 items-center gap-3 rounded-lg border bg-card px-3"
          >
            <span className="flex-1 truncate text-sm">
              {row.name?.trim() || row.handle}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={busy === row.handle}
              onClick={() => void unblock(row)}
            >
              {busy === row.handle ? "Undoing…" : "Unblock"}
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
