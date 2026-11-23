import * as React from "react"
import {
  BanIcon,
  ListChecksIcon,
  MailOpenIcon,
  StarIcon,
} from "lucide-react"

import { NewEmailButton } from "@/components/crm/new-email-button"
import { PointAnchor } from "@/components/crm/point-anchor"
import { CrmListHeader } from "@/components/crm/crm-row"
import { Chip, CrmGroupRow, CrmTable, CrmTableRow, Dot, DOT, MainCell, useFolds } from "@/components/crm/crm-table"
import { OutboxTable } from "@/components/crm/outbox-panels"
import { ViewMenu, type ViewChoice } from "@/components/shared/view-menu"
import { FilterPopover } from "@/components/shared/filter-popover"
import { LoadMoreButton } from "@/components/shared/load-more-button"
import {
  SelectedMenu,
  SelectedMenuRow,
} from "@/components/shared/mass-select"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { FieldLabel } from "@/components/ui/field-label"
import { LoadingRow } from "@/components/ui/loading-row"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { TableHeaderColumn } from "@/components/shared/sortable-table-header"
import { TableCell } from "@/components/ui/table"
import type { InboxThread } from "@/lib/api/crm/inbox"
import type { DevOutboxItem } from "@/lib/api/email/dev-outbox"
import type { CrmInboxView } from "@/lib/crm/crm-search"
import {
  CRM_DEFAULT_INBOX_SORT,
  CRM_INBOX_SORT_LABELS,
  CRM_INBOX_SORTS,
  CRM_STAGE_LABELS,
  CRM_STAGES,
  type CrmInboxSort,
  type CrmStage,
} from "@/lib/crm/crm"
import { formatInboxTime } from "@/lib/crm/inbox-time"
import { cn } from "@/lib/utils"
import { hasReplyDraft, type ReplyDrafts } from "@/lib/crm/reply-drafts"

export type InboxFilters = {
  search: string
  stage: CrmStage | "all"
  /** The pill under the header: All, Unread, Saved, Waiting, or the local Outbox. */
  view: CrmInboxView
  /** Only mail that arrived at this address; "" is every address. */
  toAddress: string
  /** Only leads with this tag; "" is any. */
  tag: string
  followUpDue: boolean
  /** Which end of the list comes first. Not a filter: it hides nothing. */
  sort: CrmInboxSort
}

/** What a row's right-click menu, or the "N selected" menu, can do to conversations. */
export type InboxRowActions = {
  onSave: (thread: InboxThread, saved: boolean) => void
  onMarkUnread: (thread: InboxThread) => void
  onBlock: (thread: InboxThread) => void
}

/**
 * The CRM dashboard's middle panel: the inbox (the Admin 3 panel design,
 * 7 Nov 2026; Tyler: "Middle panel shows the inbox, second tab unread, 3rd tab
 * saved").
 *
 * One row per conversation, never one per message. A thread somebody has
 * answered three times would otherwise fill the list with four near-identical
 * rows and bury the new mail underneath them.
 *
 * **One header, one pill row** (`CrmListHeader`, the same on every CRM
 * section): the section's icon and name, the "N selected" menu while rows are
 * ticked, Filter, New email, then the ⋮ holding Search and Mass select. Under
 * it the All, Unread, Saved and Waiting pills, and Outbox on a laptop.
 *
 * Rows are built by hand rather than with `DashboardTable`. That component's
 * main column is fixed at 320px, which in a panel this size clips the
 * subject and the time both.
 *
 * **Mass select** shows a tick box on every row, and the "N selected" menu
 * deals with the ticked lot in one press: a morning of newsletters was
 * otherwise twenty conversations opened and closed one at a time. A row's
 * right-click menu starts with it too, and turning it on from a row ticks
 * that row.
 */
export function InboxListPanel({
  threads,
  allCount,
  unreadCount,
  savedCount,
  waitingCount,
  waitingShown,
  outboxShown,
  outbox,
  openOutboxId,
  onOpenOutbox,
  heading,
  headingEnd,
  newMail,
  onShowNewMail,
  loading,
  loadingMore,
  hasMore,
  openThreadId,
  massSelect,
  ticked,
  tickedBusy,
  replyDrafts,
  filters,
  inboundAddress,
  addressLabels,
  actions,
  addresses,
  siteTags,
  unansweredDays,
  onStarted,
  onFiltersChange,
  onOpen,
  onToggleTick,
  onClearTicks,
  onMarkTickedRead,
  onLoadMore,
}: {
  threads: InboxThread[]
  /**
   * The three tab counts. Each obeys every filter except the tabs' own, so
   * none changes when another tab is pressed.
   */
  allCount: number
  unreadCount: number
  savedCount: number
  /** The Waiting pill's count, worked out the same way. */
  waitingCount: number
  /** False while the chase is off (0 days), which hides the Waiting pill. */
  waitingShown: boolean
  /** True where the server keeps a development outbox, which draws its pill. */
  outboxShown: boolean
  /** The outbox's emails, read only while its pill is picked. */
  outbox: DevOutboxItem[] | null
  openOutboxId: string | null
  onOpenOutbox: (emailId: string) => void
  /** The start of the header: the section's icon and name. */
  heading: React.ReactNode
  /** The end of the header: the button that reopens a shut right panel. */
  headingEnd: React.ReactNode
  /** Conversations with mail that came since the list was drawn (CRM task 33). */
  newMail: number
  /** Redraws the list with the new mail in it. */
  onShowNewMail: () => void
  loading: boolean
  loadingMore: boolean
  hasMore: boolean
  openThreadId: string | null
  /**
   * Mass select, held by the dashboard. `onToggle` with a row's id turns it on
   * with that row ticked, as a row's right-click does.
   */
  massSelect: { on: boolean; onToggle: (tickId?: string) => void }
  /** The ticked conversations, by id. Owned above, so a redraw keeps them. */
  ticked: Set<string>
  /** True while a ticked-rows press is still in flight. */
  tickedBusy: boolean
  /** The half-written replies, so a row can say it was left half finished. */
  replyDrafts: ReplyDrafts
  filters: InboxFilters
  inboundAddress: string | null
  /**
   * Each address mail arrives at, lowered, with what a row calls it. A row
   * names its address only when there is more than one, because a label on
   * everything is noise.
   */
  addressLabels: Map<string, string>
  actions: InboxRowActions
  /** The addresses a new email can go out from, first one first. */
  addresses: { address: string; label: string }[]
  /** Every tag the site's leads carry, for the filter. */
  siteTags: string[]
  /** After how many days a row says "Waiting"; 0 is never (CRM task 11). */
  unansweredDays: number
  /** A new email went out; its conversation opens. */
  onStarted: (threadId: string) => void
  onFiltersChange: (next: Partial<InboxFilters>) => void
  onOpen: (thread: InboxThread) => void
  onToggleTick: (threadId: string) => void
  onClearTicks: () => void
  onMarkTickedRead: () => void
  onLoadMore: () => void
}) {
  const appliedSearch = filters.search
  const folds = useFolds()
  const [rightClick, setRightClick] = React.useState<{
    thread: InboxThread
    x: number
    y: number
  } | null>(null)

  // What Filter holds, so its button can count what is on. The tabs are not
  // counted: they have their own place in the header.
  const narrowed =
    (filters.stage !== "all" ? 1 : 0) +
    (filters.toAddress ? 1 : 0) +
    (filters.tag ? 1 : 0) +
    (filters.followUpDue ? 1 : 0)

  // Counted on the button but kept out of `filtered`, because the order hides
  // nothing. An empty inbox that is merely reordered must not claim "nothing
  // matches" when the real answer is that no mail has arrived.
  const reordered = filters.sort !== CRM_DEFAULT_INBOX_SORT
  const filterCount = narrowed + (reordered ? 1 : 0)

  const filtered =
    narrowed > 0 ||
    filters.view !== "all" ||
    appliedSearch.length > 0

  const clearFilters = () =>
    onFiltersChange({
      stage: "all",
      toAddress: "",
      tag: "",
      followUpDue: false,
      sort: CRM_DEFAULT_INBOX_SORT,
    })

  // The pills (Part C of the CRM task: "inbox will have subnav for unread,
  // saved etc..."). Each count obeys every filter but the pills' own, so none
  // moves when another is pressed.
  const pills: ViewChoice[] = [
    { value: "all", label: "All", count: allCount },
    { value: "unread", label: "Unread", count: unreadCount },
    { value: "saved", label: "Saved", count: savedCount },
    ...(waitingShown || filters.view === "waiting"
      ? [{ value: "waiting", label: "Waiting", count: waitingCount }]
      : []),
    ...(outboxShown ? [{ value: "outbox", label: "Outbox" }] : []),
  ]
  const shownAddresses = addressLabels.size > 1

  return (
    <div className="@container flex h-full min-h-0 flex-col overflow-hidden bg-card">
      <CrmListHeader
        tabs={heading}
        end={headingEnd}
        selected={
          massSelect.on && ticked.size > 0 ? (
            <SelectedMenu
              count={ticked.size}
              busy={tickedBusy}
              onClear={onClearTicks}
              main={(menu) => (
                <>
                  <SelectedMenuRow
                    onClick={() => {
                      menu.close()
                      onMarkTickedRead()
                    }}
                  >
                    <MailOpenIcon className="size-4 text-muted-foreground" />
                    Mark read
                  </SelectedMenuRow>
                </>
              )}
              pages={{}}
            />
          ) : null
        }
        filter={
          <FilterPopover
            count={filterCount}
            onClear={clearFilters}
            save={null}
            // 240px, as every Admin list's (Tyler, 8 Nov 2026: "filter
            // dropdown is too wide").
            contentClassName="w-60"
          >
            <FilterRow id="inbox-stage" label="Status">
              <Select
                value={filters.stage}
                onValueChange={(value) =>
                  onFiltersChange({ stage: value as CrmStage | "all" })
                }
              >
                <SelectTrigger id="inbox-stage" className="h-8 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any status</SelectItem>
                  {CRM_STAGES.map((stage) => (
                    <SelectItem key={stage} value={stage}>
                      {CRM_STAGE_LABELS[stage]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterRow>

            {shownAddresses || filters.toAddress ? (
              <FilterRow id="inbox-address" label="Arrived at">
                <Select
                  value={filters.toAddress || "all"}
                  onValueChange={(value) =>
                    onFiltersChange({ toAddress: value === "all" ? "" : value })
                  }
                >
                  <SelectTrigger id="inbox-address" className="h-8 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Every address</SelectItem>
                    {[...addressLabels].map(([address, label]) => (
                      <SelectItem key={address} value={address}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FilterRow>
            ) : null}

            {siteTags.length || filters.tag ? (
              <FilterRow id="inbox-tag" label="Tag">
                <Select
                  value={filters.tag || "any"}
                  onValueChange={(value) =>
                    onFiltersChange({ tag: value === "any" ? "" : value })
                  }
                >
                  <SelectTrigger id="inbox-tag" className="h-8 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any tag</SelectItem>
                    {siteTags.map((tag) => (
                      <SelectItem key={tag} value={tag}>
                        {tag}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FilterRow>
            ) : null}

            <FilterRow
              id="inbox-sort"
              label="Order"
              hint="Longest waiting puts the person who has been waiting the most days at the top, which is the order for clearing the inbox rather than reading it."
            >
              <Select
                value={filters.sort}
                onValueChange={(value) =>
                  onFiltersChange({ sort: value as CrmInboxSort })
                }
              >
                <SelectTrigger id="inbox-sort" className="h-8 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CRM_INBOX_SORTS.map((sort) => (
                    <SelectItem key={sort} value={sort}>
                      {CRM_INBOX_SORT_LABELS[sort]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterRow>

            <FilterRow id="inbox-due" label="Follow up">
              <Select
                value={filters.followUpDue ? "due" : "any"}
                onValueChange={(value) =>
                  onFiltersChange({ followUpDue: value === "due" })
                }
              >
                <SelectTrigger id="inbox-due" className="h-8 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any</SelectItem>
                  <SelectItem value="due">Only the ones to follow up</SelectItem>
                </SelectContent>
              </Select>
            </FilterRow>
          </FilterPopover>
        }
        view={
          <ViewMenu
        label="Which conversations"
        value={filters.view}
        onValueChange={(value) => onFiltersChange({ view: value as CrmInboxView })}
        choices={pills}
        />
        }
        primary={<NewEmailButton addresses={addresses} onSent={onStarted} />}
        menuLabel="More for the inbox"
        search={{
          name: "crm-search",
          label: "Search the inbox",
          placeholder: "Search mail",
          value: appliedSearch,
          onChange: (search) => onFiltersChange({ search }),
        }}
        massSelect={{ on: massSelect.on, onToggle: () => massSelect.onToggle() }}
      />


      {newMail > 0 && filters.view !== "outbox" ? (
        <div className="shrink-0 border-b px-2 py-1.5" aria-live="polite">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="w-full"
            onClick={onShowNewMail}
          >
            New mail in {newMail} {newMail === 1 ? "conversation" : "conversations"}. Show it.
          </Button>
        </div>
      ) : null}

      {filters.view === "outbox" ? (
        <OutboxTable emails={outbox ?? []} openId={openOutboxId} onOpen={onOpenOutbox} />
      ) : (
        <CrmTable
          columns={INBOX_COLUMNS(filters.sort)}
          sort="when"
          direction={filters.sort === "oldest" ? "asc" : "desc"}
          onSort={() => onFiltersChange({ sort: filters.sort === "oldest" ? "newest" : "oldest" })}
          select={
            massSelect.on
              ? {
                  noun: "conversations",
                  disabled: threads.length === 0,
                  checked:
                    threads.length > 0 && threads.every((thread) => ticked.has(thread.id))
                      ? true
                      : threads.some((thread) => ticked.has(thread.id))
                        ? "indeterminate"
                        : false,
                  onToggle: () => {
                    const all = threads.every((thread) => ticked.has(thread.id))
                    for (const thread of threads) {
                      if (all === ticked.has(thread.id)) onToggleTick(thread.id)
                    }
                  },
                }
              : null
          }
          empty={
            loading && threads.length === 0 ? (
              <LoadingRow label="Reading the inbox…" />
            ) : threads.length > 0 ? null : filtered ? (
              <span className="grid justify-items-center gap-2">
                {appliedSearch
                  ? `No conversations match "${appliedSearch}".`
                  : filters.view === "saved"
                    ? "No conversation is saved."
                    : filters.view === "waiting"
                      ? "Nobody is waiting on you."
                      : "No conversations match."}
                {narrowed > 0 || appliedSearch ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      onFiltersChange({
                        search: "",
                        stage: "all",
                        toAddress: "",
                        tag: "",
                        followUpDue: false,
                      })
                    }
                  >
                    Clear filters
                  </Button>
                ) : null}
              </span>
            ) : inboundAddress ? (
              `Nothing has arrived at ${inboundAddress} yet.`
            ) : (
              "No address is set for mail to arrive at. The + on the left adds one."
            )
          }
          after={
            hasMore ? <LoadMoreButton loading={loadingMore} onClick={onLoadMore} /> : null
          }
        >
          {groupByDay(threads).map((group) => (
            <React.Fragment key={group.key}>
              <CrmGroupRow
                label={group.label}
                count={group.threads.length}
                folded={folds.folded(group.key)}
                onToggle={() => folds.toggle(group.key)}
              />
              {folds.folded(group.key)
                ? null
                : group.threads.map((thread) => (
                    <InboxRow
                      key={thread.id}
                      thread={thread}
                      open={thread.id === openThreadId}
                      showTick={massSelect.on}
                      ticked={ticked.has(thread.id)}
                      addressLabel={
                        shownAddresses && thread.toAddress
                          ? (addressLabels.get(thread.toAddress.toLowerCase()) ?? null)
                          : null
                      }
                      hasDraft={hasReplyDraft(replyDrafts, thread.id)}
                      unansweredDays={unansweredDays}
                      onOpen={() => onOpen(thread)}
                      onToggleTick={() => onToggleTick(thread.id)}
                      onRightClick={(x, y) => setRightClick({ thread, x, y })}
                    />
                  ))}
            </React.Fragment>
          ))}
        </CrmTable>
      )}

      {rightClick ? (
        <RowRightClickMenu
          key={`${rightClick.thread.id}-${rightClick.x}-${rightClick.y}`}
          at={rightClick}
          thread={rightClick.thread}
          massSelectOn={massSelect.on}
          onMassSelect={() =>
            massSelect.onToggle(massSelect.on ? undefined : rightClick.thread.id)
          }
          actions={actions}
          onClose={() => setRightClick(null)}
        />
      ) : null}
    </div>
  )
}

/** One filter: its label, then its control. */
function FilterRow({
  id,
  label,
  hint,
  children,
}: {
  id: string
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="grid gap-1.5">
      <FieldLabel htmlFor={id} hint={hint}>
        {label}
      </FieldLabel>
      {children}
    </div>
  )
}

/**
 * A row's right-click menu (the Admin 3 panel design; Tyler picked it on
 * 7 Nov 2026): Mass select first ("Hide select" while on), then Save, Mark
 * unread, then Block under a line. It opens at the pointer. Snooze and Close
 * were taken out on 9 Nov 2026.
 */
function RowRightClickMenu({
  at,
  thread,
  massSelectOn,
  onMassSelect,
  actions,
  onClose,
}: {
  at: { x: number; y: number }
  thread: InboxThread
  massSelectOn: boolean
  onMassSelect: () => void
  actions: InboxRowActions
  onClose: () => void
}) {
  return (
    // Not modal, so a right-click on another row moves the menu there in one go.
    <DropdownMenu open onOpenChange={(open) => (open ? undefined : onClose())} modal={false}>
      <DropdownMenuTrigger asChild>
        <PointAnchor x={at.x} y={at.y} />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-48"
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <DropdownMenuItem onSelect={onMassSelect}>
          <ListChecksIcon className="size-4" />
          {massSelectOn ? "Hide select" : "Mass select"}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => actions.onSave(thread, !thread.saved)}>
          <StarIcon className="size-4" />
          {thread.saved ? "Take out of Saved" : "Save"}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => actions.onMarkUnread(thread)}>
          <MailOpenIcon className="size-4" />
          Mark unread
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => actions.onBlock(thread)}>
          <BanIcon className="size-4" />
          Block this address
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function InboxRow({
  thread,
  open,
  ticked,
  showTick,
  addressLabel,
  hasDraft,
  unansweredDays,
  onOpen,
  onToggleTick,
  onRightClick,
}: {
  thread: InboxThread
  open: boolean
  /** This row is ticked. */
  ticked: boolean
  /** Mass select is on, so the tick box shows in place of the initials. */
  showTick: boolean
  /** What to call the address the mail came to, when there is more than one. */
  addressLabel: string | null
  /** A reply was started in this conversation and never sent. */
  hasDraft: boolean
  unansweredDays: number
  onOpen: () => void
  onToggleTick: () => void
  onRightClick: (x: number, y: number) => void
}) {
  const who = thread.leadName?.trim() || thread.leadEmail
  const followUpDue =
    thread.follow_up_at !== null && new Date(thread.follow_up_at) <= new Date()
  // They wrote last and nobody answered for the site's number of days.
  const waitedDays =
    unansweredDays > 0 && thread.status === "open" && thread.lastDirection === "in"
      ? Math.floor((new Date().getTime() - new Date(thread.last_message_at).getTime()) / 86_400_000)
      : 0
  const waiting = waitedDays >= unansweredDays && unansweredDays > 0

  return (
    <CrmTableRow
      open={open}
      label={`the conversation with ${who}`}
      tick={{ shown: showTick, ticked, onToggle: onToggleTick }}
      onOpen={onOpen}
      onRightClick={onRightClick}
    >
      <MainCell
        name={who}
        avatar={{ name: thread.leadName, email: thread.leadEmail }}
        strong={thread.unread}
        lead={<Dot className={thread.unread ? DOT.unread : DOT.read} label={thread.unread ? "Unread" : "Read"} />}
      >
        {thread.saved ? (
          <StarIcon aria-label="Saved" className="size-3.5 shrink-0 fill-amber-400 text-amber-500" />
        ) : null}
        {/* In words, not a coloured dot, because "you left this half
            written" is not something a shade can say. */}
        {hasDraft ? <Chip>Unsent draft</Chip> : null}
        {waiting ? <Chip>Waiting {waitedDays} {waitedDays === 1 ? "day" : "days"}</Chip> : null}
        {followUpDue ? <Chip>To follow up</Chip> : null}
      </MainCell>
      <TableCell column="preview" className="w-full max-w-0 min-w-56">
        <span className={cn("block truncate", thread.unread ? "text-foreground" : "text-muted-foreground")}>
          {/* An answer of ours reads as a reply rather than as their words. */}
          {thread.lastDirection === "out" ? "You: " : null}
          {thread.snippet ?? thread.subject ?? ""}
        </span>
      </TableCell>
      <TableCell column="preview" className="hidden md:hidden @4xl:table-cell">
        <Chip muted={thread.leadStage === "new"}>{CRM_STAGE_LABELS[thread.leadStage]}</Chip>
      </TableCell>
      <TableCell column="preview" className="hidden md:hidden @5xl:table-cell">
        <span className="flex items-center gap-1">
          {addressLabel ? <Chip muted>To {addressLabel}</Chip> : null}
          {thread.tags.slice(0, 2).map((tag) => (
            <Chip key={tag} muted>{tag}</Chip>
          ))}
          {thread.status === "open" && !addressLabel && thread.tags.length === 0 ? (
            <span className="text-muted-foreground">None</span>
          ) : null}
        </span>
      </TableCell>
      <TableCell column="mutedMeta">{formatInboxTime(thread.last_message_at)}</TableCell>
    </CrmTableRow>
  )
}

/** The inbox's columns, as Project's list has them: the name, then the words, then the facts. */
function INBOX_COLUMNS(sort: CrmInboxSort): TableHeaderColumn<"who" | "words" | "stage" | "more" | "when">[] {
  void sort
  return [
    // From takes only what the names need and Email takes the rest, so the
    // words sit next to who sent them (Tyler, 7 Nov 2026: "move the latest
    // col closer to the from col and rename latest to Email").
    { key: "who", label: "From", sortable: false, column: "main", className: "w-px min-w-40" },
    { key: "words", label: "Email", sortable: false, column: "preview", className: "w-full max-w-none min-w-56" },
    // `md:hidden` takes away a preview column's own `md:table-cell`, which
    // showed it on any laptop however narrow the middle, running the table
    // past it. Each shows only once there is room for every column before it.
    { key: "stage", label: "Status", sortable: false, column: "preview", className: "hidden md:hidden @4xl:table-cell" },
    { key: "more", label: "Tags", sortable: false, column: "preview", className: "hidden md:hidden @5xl:table-cell" },
    { key: "when", label: "When", column: "meta" },
  ]
}

/**
 * The inbox's group headings: Today, Yesterday, This week, then Earlier, by
 * when the newest message came. Empty ones are left out, and the rows keep
 * the order the list came in, so Longest waiting first still reads oldest
 * first inside each heading.
 */
function groupByDay(threads: InboxThread[]) {
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  const day = 86_400_000
  const keyOf = (iso: string) => {
    const at = new Date(iso).getTime()
    if (at >= startOfToday.getTime()) return "today"
    if (at >= startOfToday.getTime() - day) return "yesterday"
    if (at >= startOfToday.getTime() - 6 * day) return "week"
    return "earlier"
  }
  const labels = { today: "Today", yesterday: "Yesterday", week: "This week", earlier: "Earlier" } as const
  const order: (keyof typeof labels)[] = []
  const byKey = new Map<keyof typeof labels, InboxThread[]>()
  for (const thread of threads) {
    const key = keyOf(thread.last_message_at)
    if (!byKey.has(key)) {
      byKey.set(key, [])
      order.push(key)
    }
    byKey.get(key)!.push(thread)
  }
  return order.map((key) => ({ key, label: labels[key], threads: byKey.get(key)! }))
}
