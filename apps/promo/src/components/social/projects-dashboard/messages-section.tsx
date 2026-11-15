import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import { MessageSquareIcon, SkipForwardIcon } from "lucide-react"

import { FilterRow } from "@/components/admin-dashboard/list-parts"
import type { CrmFrame } from "@/components/crm/crm-frame"
import { ActionRow } from "@/components/crm/crm-record-menu"
import { CrmListHeader, CrmRowMenu } from "@/components/crm/crm-row"
import { Chip, CrmTable, CrmTableRow, MainCell } from "@/components/crm/crm-table"
import { EmptyRecord, RecordFrame } from "@/components/crm/record-frame"
import { FilterPopover } from "@/components/shared/filter-popover"
import { SelectedMenu, SelectedMenuRow } from "@/components/shared/mass-select"
import { TabbedMenu } from "@/components/shared/notes/tabbed-menu"
import { MiddleHeading, PanelReopenButton } from "@/components/shared/three-panels"
import { InboxAnswer } from "@/components/social/phone-apps/inbox-answer"
import { ErrorRow } from "@/components/ui/error-row"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { TableCell } from "@/components/ui/table"
import { getPhoneAppErrorMessage, loadMessages, skipInboxItems, type InboxRow } from "@/lib/api/social/phone-apps"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { useClearSelectionOnListChange } from "@/lib/hooks/use-clear-selection"
import { useSelection } from "@/lib/hooks/use-selection"
import { useListSearchNavigate, useOpenRecord } from "@/lib/nav/list-search"
import { handleWords, isNetwork, NETWORK_NAMES, NETWORKS } from "@/lib/social/networks"
import { INBOX_STATUS_WORDS } from "@/lib/social/phone-apps"
import type { ProjectsSearch } from "@/lib/social/projects-dashboard-search"
import { postedDateText } from "@/lib/social/wording"

type Column = "from" | "account" | "status" | "when"

/** How often the list asks again while an answer is on its way. */
const SENDING_POLL_MS = 3_000

function networkName(platform: string) {
  return isNetwork(platform) ? NETWORK_NAMES[platform] : platform
}

/**
 * The Messages section (Tyler, 12 Nov 2026): every account's direct
 * messages on every network, newest first, read off a phone after its
 * notification said one arrived, or off an X or LinkedIn browser on a clock
 * (`workspace/docs/messages-dashboard.md`). The conversation opens on the
 * right, in place of the old window, with a suggested answer in the
 * account's voice. Nothing is sent until Send is pressed, and once answered
 * or skipped the conversation is deleted, words and all.
 *
 * The Projects block narrows the list to the conversations written to that
 * project's accounts.
 */
export function MessagesSection({
  initial,
  search,
  projectId,
  frame,
}: {
  initial: InboxRow[]
  search: ProjectsSearch
  projectId: string
  frame: CrmFrame
}) {
  const router = useRouter()
  const setListSearch = useListSearchNavigate()
  const setOpen = useOpenRecord()
  const [all, setAll] = React.useState(initial)
  const [error, setError] = React.useState<string | null>(null)
  const q = search.q ?? ""
  const platform = search.platform ?? null
  const [sort, setSort] = React.useState<Column>("when")
  const [direction, setDirection] = React.useState<"asc" | "desc">("desc")
  const toggleSort = (column: Column) => {
    if (column === sort) setDirection(direction === "asc" ? "desc" : "asc")
    else {
      setSort(column)
      setDirection(column === "when" ? "desc" : "asc")
    }
  }
  const [rightClick, setRightClick] = React.useState<{ id: string; x: number; y: number } | null>(null)
  const [massSelect, setMassSelect] = React.useState(false)
  const selection = useSelection()
  const [run, busy] = useAsyncAction(getPhoneAppErrorMessage)

  const refresh = React.useCallback(
    (): Promise<void> =>
      loadMessages().then(
        (next) => {
          setAll(next)
          setError(null)
        },
        (failure: unknown) => setError(getPhoneAppErrorMessage(failure))
      ),
    []
  )
  // An answer on its way is waited on, so the row says when it went.
  const sending = all.some((row) => row.status === "sending")
  React.useEffect(() => {
    if (!sending) return
    const timer = setInterval(() => void refresh(), SENDING_POLL_MS)
    return () => clearInterval(timer)
  }, [refresh, sending])

  const rows = React.useMemo(() => {
    const sign = direction === "asc" ? 1 : -1
    const needle = q.trim().toLowerCase()
    return all
      .filter((row) => !projectId || row.account.projectId === projectId)
      .filter((row) => !platform || row.platform === platform)
      .filter(
        (row) =>
          !needle ||
          [row.thread, row.author, row.account.handle, ...row.lines.map((line) => line.text)].some((value) =>
            value.toLowerCase().includes(needle)
          )
      )
      .sort((a, b) => {
        if (sort === "account") return (a.account.handle || "~").localeCompare(b.account.handle || "~") * sign
        if (sort === "status") return a.status.localeCompare(b.status) * sign
        if (sort === "from") return a.thread.localeCompare(b.thread) * sign
        return (new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()) * sign
      })
  }, [all, direction, platform, projectId, q, sort])
  const ids = rows.map((row) => row.id)
  const openId = search.open
  const openRow = rows.find((row) => row.id === openId) ?? null

  const firstId = rows[0]?.id
  const openInList = Boolean(openId && rows.some((row) => row.id === openId))
  React.useEffect(() => {
    if (firstId && !openInList) setListSearch({ open: firstId })
  }, [firstId, openInList, setListSearch])
  const [pressedId, setPressedId] = React.useState<string>()
  const pick = (id: string) => {
    setPressedId(id)
    setOpen(id)
  }

  useClearSelectionOnListChange(selection.setSelected, `${q}|${platform}|${projectId}`)
  const selected = rows.filter((row) => selection.selected.has(row.id))
  const toggleMassSelect = (tickId?: string) => {
    if (massSelect) {
      selection.clear()
      setMassSelect(false)
      return
    }
    setMassSelect(true)
    if (tickId) selection.setSelected(new Set([tickId]))
  }

  /** After a skip or a send, the list and the route's copy behind the left page's counts read again. */
  const changed = React.useCallback(async () => {
    await refresh()
    void router.invalidate()
  }, [refresh, router])

  /** Skip puts conversations away without a word; an answer already on its way can't be. */
  const canSkip = (row: InboxRow) => row.status === "open"
  async function skip(list: InboxRow[]) {
    const ok = await run(async () => {
      await skipInboxItems(list.filter(canSkip).map((row) => row.id))
      await changed()
    })
    if (ok) selection.clear()
  }

  const middle = (
    <div className="@container flex h-full min-h-0 flex-col overflow-hidden bg-card">
      <CrmListHeader
        tabs={<MiddleHeading icon={MessageSquareIcon} label="Messages" />}
        end={<PanelReopenButton side="right" label="Show the conversation" />}
        selected={
          massSelect && selected.length ? (
            <SelectedMenu
              count={selected.length}
              busy={busy}
              onClear={selection.clear}
              pages={{}}
              main={(menu) => (
                <SelectedMenuRow
                  onClick={() => {
                    menu.close()
                    void skip(selected)
                  }}
                >
                  <SkipForwardIcon className="size-4 text-muted-foreground" />
                  Skip
                </SelectedMenuRow>
              )}
            />
          ) : null
        }
        menuLabel="More for messages"
        search={{
          name: "message-search",
          label: "Search messages by name or words",
          placeholder: "Search messages",
          value: q,
          onChange: (text) => setListSearch({ q: text.trim() ? text : undefined }),
        }}
        massSelect={{ on: massSelect, onToggle: () => toggleMassSelect() }}
        filter={
          <FilterPopover count={platform ? 1 : 0} onClear={() => setListSearch({ platform: undefined })} save={null} contentClassName="w-60">
            <FilterRow id="messages-platform" label="Platform">
              <Select value={platform ?? "all"} onValueChange={(value) => setListSearch({ platform: value === "all" ? undefined : value })}>
                <SelectTrigger id="messages-platform" className="h-8 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All platforms</SelectItem>
                  {NETWORKS.map((network) => (
                    <SelectItem key={network} value={network}>
                      {NETWORK_NAMES[network]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterRow>
          </FilterPopover>
        }
      />
      {error ? (
        <div className="px-6 py-3">
          <ErrorRow message={error} onRetry={() => void refresh()} />
        </div>
      ) : null}
      <CrmTable<Column>
        columns={[
          { key: "from", label: "Conversation", column: "main", className: "min-w-40" },
          { key: "account", label: "To", column: "preview", className: "hidden md:hidden @2xl:table-cell" },
          { key: "status", label: "Status", column: "preview", className: "hidden md:hidden @lg:table-cell" },
          { key: "when", label: "Last message", column: "meta", className: "hidden md:hidden @xl:table-cell" },
        ]}
        sort={sort}
        direction={direction}
        onSort={toggleSort}
        actions={false}
        select={
          massSelect
            ? {
                noun: "conversations",
                disabled: ids.length === 0,
                checked: selection.selectAllState(ids),
                onToggle: () => selection.toggleVisible(ids),
              }
            : null
        }
        empty={
          rows.length > 0
            ? null
            : q || platform
              ? "No conversations match that."
              : "No messages waiting. A conversation shows here once an account's phone or browser reads one."
        }
      >
        {rows.map((row) => {
          const last = row.lines[row.lines.length - 1]
          return (
            <CrmTableRow
              key={row.id}
              open={row.id === openId}
              label={row.thread}
              tick={{ shown: massSelect, ticked: selection.selected.has(row.id), onToggle: () => selection.toggle(row.id) }}
              onOpen={() => pick(row.id)}
              onRightClick={(x, y) => setRightClick({ id: row.id, x, y })}
            >
              <MainCell name={row.thread} strong={row.status === "open"}>
                <span className="shrink-0 text-xs text-muted-foreground">{networkName(row.platform)}</span>
                {last ? <span className="hidden min-w-0 truncate text-xs text-muted-foreground @lg:inline">{last.text}</span> : null}
              </MainCell>
              <TableCell column="preview" className="hidden md:hidden @2xl:table-cell">
                <span className="block truncate">{handleWords(row.platform, row.account.handle) || "Not signed in"}</span>
              </TableCell>
              <TableCell column="preview" className="hidden md:hidden @lg:table-cell">
                <Chip muted={row.status !== "open" && !row.lastError} className={row.lastError ? "text-destructive" : undefined}>
                  {row.lastError ? "Answer failed" : INBOX_STATUS_WORDS[row.status]}
                </Chip>
              </TableCell>
              <TableCell column="mutedMeta" className="hidden md:hidden @xl:table-cell">
                {postedDateText(new Date(row.updatedAt))}
              </TableCell>
            </CrmTableRow>
          )
        })}
      </CrmTable>
      {rightClick ? (
        <CrmRowMenu
          key={`${rightClick.id}-${rightClick.x}-${rightClick.y}`}
          at={rightClick}
          massSelect={{ on: massSelect, onToggle: () => toggleMassSelect(!massSelect ? rightClick.id : undefined) }}
          items={(() => {
            const row = rows.find((each) => each.id === rightClick.id)
            return row && canSkip(row)
              ? [{ label: "Skip", icon: <SkipForwardIcon className="size-4" />, onSelect: () => void skip([row]) }]
              : []
          })()}
          onClose={() => setRightClick(null)}
        />
      ) : null}
    </div>
  )

  return frame({
    ids,
    showMiddleFor: `${q}|${platform}|${projectId}`,
    showRightFor: pressedId && pressedId === search.open ? pressedId : undefined,
    middle,
    right: {
      label: "Conversation",
      showLabel: "Show the conversation",
      content: openRow ? (
        <ConversationRecord key={openRow.id} row={openRow} busy={busy} onSkip={() => void skip([openRow])} onChanged={changed} />
      ) : (
        <EmptyRecord
          title="Conversation"
          icon={<MessageSquareIcon aria-hidden />}
          line={all.length ? "Click a conversation to answer it here." : "A conversation shows here once a phone reads one."}
          hideLabel="Hide the conversation"
        />
      ),
    },
  })
}

/**
 * One conversation on the right: its lines, the account's own on the right,
 * and the answer box with Write again and Send (`InboxAnswer`). Skip is in
 * the ⋮ as well as under the box.
 */
function ConversationRecord({
  row,
  busy,
  onSkip,
  onChanged,
}: {
  row: InboxRow
  busy: boolean
  onSkip: () => void
  onChanged: () => Promise<void>
}) {
  const [menuOpen, setMenuOpen] = React.useState(false)
  const to = handleWords(row.platform, row.account.handle) || "an account not signed in"
  return (
    <RecordFrame
      avatar={<MessageSquareIcon aria-hidden />}
      title={row.thread}
      line={`To ${to} on ${networkName(row.platform)}`}
      hideLabel="Hide the conversation"
      actions={
        row.status === "open" ? (
          <TabbedMenu
            label="Conversation menu"
            align="end"
            width="20.4rem"
            open={menuOpen}
            onOpenChange={setMenuOpen}
            tabs={[
              {
                value: "general",
                label: "General",
                content: (
                  <div className="grid p-3">
                    <ActionRow
                      icon={<SkipForwardIcon className="size-4" />}
                      disabled={busy}
                      onClick={() => {
                        setMenuOpen(false)
                        onSkip()
                      }}
                    >
                      Skip, deleting it without an answer
                    </ActionRow>
                  </div>
                ),
              },
            ]}
          />
        ) : null
      }
      body={
        <div className="pt-3.75">
          <InboxAnswer item={row} onChanged={() => onChanged()} />
        </div>
      }
    />
  )
}
