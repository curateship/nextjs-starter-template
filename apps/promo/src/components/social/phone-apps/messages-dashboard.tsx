import * as React from "react"
import { Loader2Icon, MailIcon, XIcon } from "lucide-react"
import { toast } from "sonner"

import { DashboardTable } from "@/components/shared/dashboard-table"
import {
  DashboardToolbarButton,
  DashboardToolbarSearch,
  DashboardToolbarSelectTrigger,
} from "@/components/shared/dashboard-toolbar"
import {
  SelectAllTableHead,
  SortableTableHeader,
  type TableHeaderColumn,
} from "@/components/shared/sortable-table-header"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectValue } from "@/components/ui/select"
import { TableCell, TableHead, TableRow } from "@/components/ui/table"
import {
  getPhoneAppErrorMessage,
  loadMessages,
  skipInboxItems,
  type InboxRow,
} from "@/lib/api/social/phone-apps"
import { describeBulkResult } from "@/lib/format/bulk-result"
import { useSelection } from "@/lib/hooks/use-selection"
import { useTableSort } from "@/lib/hooks/use-table-sort"
import { handleWords, isNetwork, NETWORK_NAMES, NETWORKS, type Network } from "@/lib/social/networks"
import { INBOX_STATUS_WORDS } from "@/lib/social/phone-apps"
import { postedDateText } from "@/lib/social/wording"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

import { Hint } from "../hint"
import { InboxAnswer } from "./inbox-answer"

type Column = "from" | "account" | "status" | "when"

const COLUMNS: TableHeaderColumn<Column>[] = [
  { key: "from", label: "Conversation", column: "main" },
  { key: "account", label: "To", column: "meta", className: "hidden md:table-cell" },
  { key: "status", label: "Status", column: "meta" },
  { key: "when", label: "Last message", column: "meta", className: "hidden sm:table-cell" },
]

const ALL = "all"

function compare(a: InboxRow, b: InboxRow, column: Column): number {
  switch (column) {
    case "account":
      return (a.account.handle || "~").localeCompare(b.account.handle || "~")
    case "status":
      return a.status.localeCompare(b.status)
    case "when":
      return new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()
    default:
      return a.thread.localeCompare(b.thread)
  }
}

/**
 * Every phone account's direct messages on Reddit, Instagram and TikTok, in
 * one list (phone farm file 06, part 38). Under Projects in the left menu,
 * after Accounts, with a Platform filter like the Accounts dashboard.
 *
 * A conversation lands here when the app's notification on the phone said a
 * message arrived and the phone read it, never on a timer (Tyler, 16 Oct
 * 2026). Opening one shows the conversation with a suggestion in the
 * account's voice; Send sends what is in the box from the account's phone,
 * once. A conversation is kept only while it is open here: once answered or
 * skipped it is deleted, words and all.
 */
export function MessagesDashboard({
  initial,
  platform,
  openId,
  onPlatformChange,
  onOpenChange,
}: {
  initial: InboxRow[]
  platform: Network | null
  /** The conversation open in its window, from `?open=`. */
  openId: string | null
  onPlatformChange: (platform: Network | null) => void
  onOpenChange: (id: string | null) => void
}) {
  const [rows, setRows] = React.useState(initial)
  const [error, setError] = React.useState<string | null>(null)
  const [search, setSearch] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const selection = useSelection()
  const { sort, direction, toggleSort } = useTableSort<Column>("when", "desc")

  const refresh = React.useCallback(
    (): Promise<void> =>
      loadMessages().then(
        (next) => {
          setRows(next)
          setError(null)
        },
        (failure: unknown) => setError(getPhoneAppErrorMessage(failure))
      ),
    []
  )

  // An answer on its way is waited on, so the row says when it went.
  const sending = rows.some((row) => row.status === "sending")
  React.useEffect(() => {
    if (!sending) return
    const timer = setInterval(() => void refresh(), 3_000)
    return () => clearInterval(timer)
  }, [refresh, sending])

  const shown = React.useMemo(() => {
    const query = search.trim().toLowerCase()
    const factor = direction === "asc" ? 1 : -1
    return rows
      .filter((row) => (platform ? row.platform === platform : true))
      .filter((row) =>
        query
          ? [row.thread, row.author, row.account.handle, ...row.lines.map((line) => line.text)]
              .some((value) => value.toLowerCase().includes(query))
          : true
      )
      .sort((a, b) => factor * compare(a, b, sort))
  }, [direction, platform, rows, search, sort])
  const visibleIds = shown.map((row) => row.id)
  const open = rows.find((row) => row.id === openId) ?? null

  async function skip(ids: string[]) {
    setBusy(true)
    try {
      const answer = await skipInboxItems(ids)
      toast.success(
        describeBulkResult({
          done: answer.completed.length,
          kept: answer.skipped.length,
          one: "conversation",
          many: "conversations",
          verb: "skipped and deleted",
          keptReason: "an answer is on its way",
        })
      )
      selection.clear()
      await refresh()
    } catch (failure) {
      showErrorToast(getPhoneAppErrorMessage(failure))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <DashboardTable
        title="Messages"
        icon={<MailIcon />}
        count={shown.length}
        error={error ? { message: error, onRetry: () => void refresh() } : null}
        selectedCount={selection.selected.size}
        onClearSelection={selection.clear}
        controls={
          <>
            {selection.selected.size ? (
              <DashboardToolbarButton type="button" variant="outline" disabled={busy} onClick={() => void skip([...selection.selected])}>
                {busy ? <Loader2Icon className="size-4 animate-spin" /> : <XIcon className="size-4" />}
                Skip ({selection.selected.size})
              </DashboardToolbarButton>
            ) : null}
            <DashboardToolbarSearch
              name="messages-search"
              aria-label="Search messages"
              placeholder="Search messages…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <Select value={platform ?? ALL} onValueChange={(value) => onPlatformChange(isNetwork(value) ? value : null)}>
              <DashboardToolbarSelectTrigger aria-label="Filter by platform" className="hidden sm:flex">
                <SelectValue />
              </DashboardToolbarSelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All platforms</SelectItem>
                {/* Medium has no direct messages, so it is not offered. */}
                {NETWORKS.filter((network) => network !== "medium").map((network) => (
                  <SelectItem key={network} value={network}>
                    {NETWORK_NAMES[network]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        }
        header={
          <SortableTableHeader
            columns={COLUMNS}
            sort={sort}
            direction={direction}
            onSort={toggleSort}
            leading={
              <SelectAllTableHead
                noun="conversations"
                checked={selection.selectAllState(visibleIds)}
                onCheckedChange={() => selection.toggleVisible(visibleIds)}
              />
            }
            trailing={<TableHead column="meta">Actions</TableHead>}
          />
        }
        isEmpty={shown.length === 0}
        emptyText={
          rows.length
            ? "No conversations match that."
            : "No messages waiting. When Reddit, Instagram or TikTok tells a phone a message arrived, the phone reads it and it shows here."
        }
        emptyColSpan={COLUMNS.length + 2}
        footer={{ type: "summary", count: shown.length, label: "conversations" }}
      >
        {shown.map((row) => {
          const last = row.lines[row.lines.length - 1]
          const to = handleWords(row.platform, row.account.handle) || "An account not signed in"
          const network = isNetwork(row.platform) ? NETWORK_NAMES[row.platform] : row.platform
          return (
            <TableRow key={row.id} className="group" rowAction={() => onOpenChange(row.id)}>
              <TableCell column="select">
                <Checkbox
                  checked={selection.selected.has(row.id)}
                  onCheckedChange={() => selection.toggle(row.id)}
                  aria-label={`Select the conversation with ${row.thread}`}
                />
              </TableCell>
              <TableCell column="main" className="max-w-0">
                <button
                  type="button"
                  onClick={() => onOpenChange(row.id)}
                  className="block max-w-full truncate text-left text-sm font-medium group-hover:underline"
                >
                  {row.thread}
                  <span className="font-normal text-muted-foreground"> · {network}</span>
                </button>
                <span className="block truncate text-xs text-muted-foreground">
                  {last ? `${last.mine ? "You" : last.from || row.thread}: ${last.text}` : ""}
                </span>
                <span className="block truncate text-xs text-muted-foreground md:hidden">To {to}</span>
              </TableCell>
              <TableCell column="meta" className="hidden max-w-40 md:table-cell">
                <span className="block truncate">{to}</span>
              </TableCell>
              <TableCell column="meta">
                <span className={cn(row.lastError ? "text-destructive" : row.status === "open" ? "font-medium" : "text-muted-foreground")}>
                  {row.lastError ? "Answer failed" : INBOX_STATUS_WORDS[row.status]}
                </span>
              </TableCell>
              <TableCell column="meta" className="hidden text-muted-foreground sm:table-cell">
                {postedDateText(new Date(row.updatedAt))}
              </TableCell>
              <TableCell column="actions">
                {row.status === "open" ? (
                  <Hint label="Skip: delete it from Promo without answering">
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => void skip([row.id])}
                      aria-label={`Skip the conversation with ${row.thread}`}
                    >
                      <XIcon className="size-4" />
                    </Button>
                  </Hint>
                ) : null}
              </TableCell>
            </TableRow>
          )
        })}
      </DashboardTable>

      <Dialog open={open !== null} onOpenChange={(next) => (next ? null : onOpenChange(null))}>
        {open ? (
          <DialogContent variant="admin">
            <DialogHeader>
              <DialogTitle>{open.thread}</DialogTitle>
              <DialogDescription>
                To {handleWords(open.platform, open.account.handle) || "an account not signed in"} on{" "}
                {isNetwork(open.platform) ? NETWORK_NAMES[open.platform] : open.platform}. Nothing is sent until you
                press Send.
              </DialogDescription>
            </DialogHeader>
            <DialogBody>
              <InboxAnswer
                key={open.id}
                item={open}
                onChanged={async () => {
                  onOpenChange(null)
                  await refresh()
                }}
              />
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(null)}>
                Done
              </Button>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>
    </>
  )
}
