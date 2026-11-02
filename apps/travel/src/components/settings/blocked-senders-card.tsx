import * as React from "react"
import { Loader2Icon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"

import { CollapsibleSettingsCard } from "@/components/settings/collapsible-settings-card"
import { Button } from "@/components/ui/button"
import { ErrorRow } from "@/components/ui/error-row"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import { LoadingRow } from "@/components/ui/loading-row"
import {
  blockAddress,
  getBlockedSenderErrorMessage,
  loadBlockedSenders,
  unblockAddress,
  type BlockedSender,
} from "@/lib/api/crm/blocked"
import { formatDate } from "@/lib/format/format-time"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * Settings → Email → Blocked senders. The addresses and domains whose mail
 * never reaches the inbox.
 *
 * **Nothing here deletes mail.** A blocked sender's message is still written
 * and its conversation is closed and read, so it stays out of the default
 * inbox and is still there when the status filter is set to All. That is why
 * the note and the date are kept: a customer blocked by accident has to be
 * findable and the block has to be undoable in one press.
 *
 * The list is short by nature, so it is rows in a card rather than a table.
 */
export function BlockedSendersCard() {
  const [rows, setRows] = React.useState<BlockedSender[] | null>(null)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [reloads, setReloads] = React.useState(0)
  const [pattern, setPattern] = React.useState("")
  const [note, setNote] = React.useState("")
  const [run, busy] = useAsyncAction(getBlockedSenderErrorMessage)
  // Which row's Remove is running, so only that one spins.
  const [removingId, setRemovingId] = React.useState<string | null>(null)

  React.useEffect(() => {
    let cancelled = false
    loadBlockedSenders()
      .then((next) => {
        if (cancelled) return
        setRows(next)
        setLoadError(null)
      })
      .catch((error) => {
        if (!cancelled) setLoadError(getBlockedSenderErrorMessage(error))
      })
    return () => {
      cancelled = true
    }
  }, [reloads])

  const reload = () => setReloads((count) => count + 1)

  const add = async () => {
    const typed = pattern.trim()
    // Never disabled while idle: a disabled button fades to near-invisible and
    // cannot say why. Pressed with nothing typed, it explains itself instead.
    if (!typed) {
      showErrorToast(
        "Type an address, or a domain as @example.com, then press Block it."
      )
      return
    }

    // The sentence says which of the two happened, because pressing Block on
    // somebody already blocked is not a failure and not a second row.
    const done = await run(async () => {
      const { pattern: saved, added } = await blockAddress(
        typed,
        note.trim() || undefined
      )
      toast.success(
        added
          ? `Mail from ${saved} will not reach the inbox.`
          : `${saved} was already blocked.`
      )
    })
    if (!done) return
    setPattern("")
    setNote("")
    reload()
  }

  const remove = async (row: BlockedSender) => {
    setRemovingId(row.id)
    try {
      const done = await run(
        () => unblockAddress(row.id),
        `${row.pattern} is unblocked. Their next message lands in the inbox.`
      )
      if (done) reload()
    } finally {
      setRemovingId(null)
    }
  }

  return (
    <CollapsibleSettingsCard
      storageId="crm-blocked-senders"
      title="Blocked senders"
      description="Mail from these addresses never reaches the inbox, so a spam run does not fill the pipeline. Nothing is deleted: the message is still recorded, in a conversation that arrives already closed, and setting the inbox's status filter to All finds it."
      contentClassName="space-y-6"
    >
      {loadError ? (
        <ErrorRow
          className="min-h-32"
          message={loadError}
          onRetry={() => {
            setLoadError(null)
            reload()
          }}
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
            <div className="grid gap-2">
              <FieldLabel
                htmlFor="crm-block-pattern"
                hint="A whole address, spam@example.com, or a whole domain written @example.com. A domain catches anyone at that domain and nothing else: @example.com leaves me@notexample.com and sales@mail.example.com alone."
              >
                Address or domain
              </FieldLabel>
              <Input
                id="crm-block-pattern"
                autoComplete="off"
                maxLength={255}
                placeholder="e.g. @example.com"
                value={pattern}
                onChange={(event) => setPattern(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void add()
                }}
              />
            </div>

            <div className="grid gap-2">
              <FieldLabel
                htmlFor="crm-block-note"
                hint="Why you blocked them, in your own words. It is the only record of the reason, and it is what you read before unblocking somebody."
              >
                Why
              </FieldLabel>
              <Input
                id="crm-block-note"
                autoComplete="off"
                maxLength={500}
                placeholder="e.g. a spam run, six addresses"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void add()
                }}
              />
            </div>

            <Button
              type="button"
              variant="outline"
              className="sm:shrink-0"
              disabled={busy}
              onClick={() => void add()}
            >
              {busy && removingId === null ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : null}
              Block it
            </Button>
          </div>

          {rows === null ? (
            <LoadingRow label="Reading the blocked list…" className="min-h-13 py-2" />
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing is blocked. Every address that writes in reaches the
              inbox.
            </p>
          ) : (
            // The divider runs the card's full width and the rows keep their
            // inset, so the line never stops short of the surface's edges.
            <ul className="-mx-4 group-data-[size=sm]/card:-mx-3">
              {rows.map((row) => (
                <li
                  key={row.id}
                  className="flex items-center gap-3 border-b px-4 py-2 group-data-[size=sm]/card:px-3 last:border-b-0"
                >
                  <span className="grid min-w-0 flex-1 gap-0.5">
                    <span className="truncate text-sm font-medium">
                      {row.pattern}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {row.note
                        ? `${row.note} · blocked ${formatDate(row.created_at)}`
                        : `Blocked ${formatDate(row.created_at)}`}
                    </span>
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8 shrink-0"
                    disabled={busy}
                    aria-label={`Unblock ${row.pattern}`}
                    onClick={() => void remove(row)}
                  >
                    {removingId === row.id ? (
                      <Loader2Icon className="size-4 animate-spin" />
                    ) : (
                      <Trash2Icon className="size-4" />
                    )}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </CollapsibleSettingsCard>
  )
}
