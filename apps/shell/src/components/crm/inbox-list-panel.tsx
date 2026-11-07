import * as React from "react"
import {
  ArchiveIcon,
  BanIcon,
  ClockIcon,
  ListChecksIcon,
  MailOpenIcon,
  SearchIcon,
  StarIcon,
} from "lucide-react"

import { NewEmailButton } from "@/components/crm/new-email-button"
import { PointAnchor } from "@/components/crm/point-anchor"
import { DashboardCardHeader } from "@/components/shared/dashboard-card-header"
import { DashboardTabs } from "@/components/shared/dashboard-tabs"
import { DashboardToolbarSearch } from "@/components/shared/dashboard-toolbar"
import { EmptyRow } from "@/components/shared/feed-card"
import { FilterPopover } from "@/components/shared/filter-popover"
import { FoldingMenu, MenuAction } from "@/components/shared/folding-menu"
import { LoadMoreButton } from "@/components/shared/load-more-button"
import {
  SelectedMenu,
  SelectedMenuRow,
} from "@/components/shared/mass-select"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { FieldLabel } from "@/components/ui/field-label"
import { LoadingRow } from "@/components/ui/loading-row"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { InboxThread } from "@/lib/api/crm/inbox"
import {
  CRM_DEFAULT_INBOX_SORT,
  CRM_INBOX_SORT_LABELS,
  CRM_INBOX_SORTS,
  CRM_STAGE_LABELS,
  CRM_STAGES,
  CRM_THREAD_STATUS_LABELS,
  CRM_THREAD_STATUSES,
  type CrmInboxSort,
  type CrmStage,
  type CrmThreadStatus,
} from "@/lib/crm/crm"
import { formatInboxTime, initialsFor } from "@/lib/crm/inbox-time"
import { hasReplyDraft, type ReplyDrafts } from "@/lib/crm/reply-drafts"
import { useSyncedDraft } from "@/lib/hooks/use-synced-draft"
import { focusRing } from "@/lib/layout/focus-ring"
import { cn } from "@/lib/utils"

export type InboxFilters = {
  search: string
  status: CrmThreadStatus | "all"
  stage: CrmStage | "all"
  unreadOnly: boolean
  /** The Saved tab. */
  savedOnly: boolean
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
  onSnooze: (thread: InboxThread, until: Date) => void
  onClose: (thread: InboxThread) => void
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
 * **One header:** the All, Unread and Saved tabs, the "N selected" menu while
 * rows are ticked, Filter, then the ⋮ holding Search and Mass select, always
 * last. Search opens its box in the header with the cursor in it.
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
  onCloseTicked,
  onSnoozeTicked,
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
  onCloseTicked: () => void
  onSnoozeTicked: (until: Date) => void
  onLoadMore: () => void
}) {
  // Typing writes straight to the box and the search itself is debounced, so
  // the caret never jumps while a request is in flight. The box follows the
  // address when the address changes, which is what fills it in when a
  // filtered link is opened.
  const appliedSearch = filters.search
  const [searchText, setSearchText] = useSyncedDraft(appliedSearch)
  // Open while there is something in it, so a search arriving in the address
  // is not hidden behind a menu nobody has opened.
  const [searchOpen, setSearchOpen] = React.useState(appliedSearch.length > 0)
  const [menuOpen, setMenuOpen] = React.useState(false)
  // Set by the menu's Search row, read once the menu has closed: an open menu
  // keeps the focus, so the box only gets the cursor after it shuts.
  const searchAsked = React.useRef(false)
  const [rightClick, setRightClick] = React.useState<{
    thread: InboxThread
    x: number
    y: number
  } | null>(null)

  // The owner rebuilds `onFiltersChange` every render, so it is held in a ref
  // rather than listed as a dependency. In the deps, any redraw would clear
  // and restart the timer, and a page that redrew every 300ms would never
  // search at all.
  const changeFiltersRef = React.useRef(onFiltersChange)
  React.useEffect(() => {
    changeFiltersRef.current = onFiltersChange
  })

  React.useEffect(() => {
    if (searchText === appliedSearch) return
    const timer = setTimeout(
      () => changeFiltersRef.current({ search: searchText }),
      300
    )
    return () => clearTimeout(timer)
  }, [searchText, appliedSearch])

  // What Filter holds, so its button can count what is on. The tabs are not
  // counted: they have their own place in the header.
  const narrowed =
    (filters.status !== "open" ? 1 : 0) +
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
    filters.unreadOnly ||
    filters.savedOnly ||
    appliedSearch.length > 0

  const clearFilters = () =>
    onFiltersChange({
      status: "open",
      stage: "all",
      toAddress: "",
      tag: "",
      followUpDue: false,
      sort: CRM_DEFAULT_INBOX_SORT,
    })

  const tab = filters.savedOnly ? "saved" : filters.unreadOnly ? "unread" : "all"
  const shownAddresses = addressLabels.size > 1

  return (
    <div className="@container flex h-full min-h-0 flex-col overflow-hidden bg-card">
      <DashboardCardHeader className="gap-2">
        <DashboardTabs
          value={tab}
          onValueChange={(value) =>
            onFiltersChange({
              unreadOnly: value === "unread",
              savedOnly: value === "saved",
            })
          }
          tabs={[
            {
              value: "all",
              label: "All",
              count: allCount,
              ariaLabel: `All conversations, ${allCount}`,
            },
            {
              value: "unread",
              label: "Unread",
              count: unreadCount,
              ariaLabel: `Unread conversations, ${unreadCount}`,
            },
            {
              value: "saved",
              label: "Saved",
              count: savedCount,
              ariaLabel: `Saved conversations, ${savedCount}`,
            },
          ]}
        />

        <div className="ml-auto flex min-w-0 shrink items-center gap-1">
          {massSelect.on && ticked.size > 0 ? (
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
                  <SelectedMenuRow
                    onClick={() => {
                      menu.close()
                      onCloseTicked()
                    }}
                  >
                    <ArchiveIcon className="size-4 text-muted-foreground" />
                    Close
                  </SelectedMenuRow>
                  <SelectedMenuRow page="snooze" onClick={() => menu.step("snooze")}>
                    <ClockIcon className="size-4 text-muted-foreground" />
                    Snooze until
                  </SelectedMenuRow>
                </>
              )}
              pages={{
                snooze: {
                  title: "Snooze until",
                  content: (menu) => (
                    <Calendar
                      mode="single"
                      autoFocus
                      onSelect={(date) => {
                        if (!date) return
                        menu.close()
                        onSnoozeTicked(date)
                      }}
                    />
                  ),
                },
              }}
            />
          ) : null}

          {searchOpen || searchText ? (
            <DashboardToolbarSearch
              autoFocus={searchOpen}
              className="min-w-0 shrink"
              inputClassName="sm:w-40 lg:w-48"
              name="crm-search"
              aria-label="Search the inbox"
              placeholder="Search mail"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              onBlur={() => setSearchOpen(false)}
              onKeyDown={(event) => {
                if (event.key !== "Escape") return
                // Escape clears first and closes second, which is the order
                // somebody pressing it twice expects.
                if (searchText) setSearchText("")
                else setSearchOpen(false)
              }}
            />
          ) : null}

          <FilterPopover
            count={filterCount}
            onClear={clearFilters}
            save={null}
          >
            <FilterRow id="inbox-status" label="Which conversations">
              <Select
                value={filters.status}
                onValueChange={(value) =>
                  onFiltersChange({ status: value as CrmThreadStatus | "all" })
                }
              >
                <SelectTrigger id="inbox-status" className="h-8 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All conversations</SelectItem>
                  {CRM_THREAD_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {CRM_THREAD_STATUS_LABELS[status]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterRow>

            <FilterRow id="inbox-stage" label="Stage">
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
                  <SelectItem value="all">Any stage</SelectItem>
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

          {/* The header's one primary button, before the ⋮. */}
          <NewEmailButton addresses={addresses} onSent={onStarted} />

          {/* Always last in the header. It holds Search and Mass select. */}
          <FoldingMenu
            label="More for the inbox"
            fit
            open={menuOpen}
            onOpenChange={setMenuOpen}
            onCloseAutoFocus={(event) => {
              if (!searchAsked.current) return
              searchAsked.current = false
              event.preventDefault()
              setSearchOpen(true)
            }}
          >
            <MenuAction
              icon={<SearchIcon className="size-4" />}
              onClick={() => {
                searchAsked.current = true
                setMenuOpen(false)
              }}
            >
              Search
            </MenuAction>
            <MenuAction
              icon={<ListChecksIcon className="size-4" />}
              onClick={() => {
                setMenuOpen(false)
                massSelect.onToggle()
              }}
            >
              {massSelect.on ? "Hide select" : "Mass select"}
            </MenuAction>
          </FoldingMenu>
        </div>
      </DashboardCardHeader>

      {newMail > 0 ? (
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

      <ScrollArea className="min-h-0 flex-1">
        <div className="grid grid-cols-[minmax(0,1fr)] gap-0.5 p-2">
          {loading && threads.length === 0 ? (
            <LoadingRow label="Reading the inbox…" />
          ) : threads.length === 0 ? (
            filtered ? (
              <div className="grid justify-items-center gap-2 py-8 text-center text-sm text-muted-foreground">
                <p>
                  {appliedSearch
                    ? `No conversations match "${appliedSearch}".`
                    : filters.savedOnly
                      ? "No conversation is saved."
                      : "No conversations match."}
                </p>
                {narrowed > 0 || appliedSearch ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSearchText("")
                      onFiltersChange({
                        search: "",
                        status: "open",
                        stage: "all",
                        toAddress: "",
                        tag: "",
                        followUpDue: false,
                      })
                    }}
                  >
                    Clear filters
                  </Button>
                ) : null}
              </div>
            ) : (
              <EmptyRow>
                {inboundAddress
                  ? `Nothing has arrived at ${inboundAddress} yet.`
                  : "No address is set for mail to arrive at. The + on the left adds one."}
              </EmptyRow>
            )
          ) : (
            threads.map((thread) => (
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
            ))
          )}

          {hasMore ? (
            <LoadMoreButton
              loading={loadingMore}
              onClick={onLoadMore}
              className="mt-1 justify-self-center"
            />
          ) : null}
        </div>
      </ScrollArea>

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
 * unread, Snooze and Close, then Block under a line. It opens at the pointer.
 * Snooze swaps the menu for a month at the same spot, a pick snoozing it.
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
  const [snoozing, setSnoozing] = React.useState(false)
  if (snoozing) {
    return (
      <Popover open onOpenChange={(open) => (open ? undefined : onClose())}>
        <PopoverTrigger asChild>
          <PointAnchor x={at.x} y={at.y} />
        </PopoverTrigger>
        <PopoverContent
          align="start"
          aria-label="Snooze until"
          className="w-auto p-0"
          onCloseAutoFocus={(event) => event.preventDefault()}
        >
          <Calendar
            mode="single"
            autoFocus
            onSelect={(date) => {
              if (!date) return
              onClose()
              actions.onSnooze(thread, date)
            }}
          />
        </PopoverContent>
      </Popover>
    )
  }
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
        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault()
            setSnoozing(true)
          }}
        >
          <ClockIcon className="size-4" />
          Snooze until
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => actions.onClose(thread)}>
          <ArchiveIcon className="size-4" />
          Close
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

  // The tick box sits on top of the avatar rather than beside it, so ticking a
  // row never moves the name under the pointer. It is a sibling of the row
  // button and not a child of it, because a button inside a button is invalid
  // and the inner one swallows the outer one's click.
  const tickLayer = (
    <span
      className={cn(
        "pointer-events-none absolute flex size-8 items-center justify-center transition-opacity",
        // The row's own padding and the avatar's nudge, repeated so the box
        // lands exactly where the initials were.
        "top-2 left-2.5 mt-0.5",
        showTick ? "opacity-100" : "hidden"
      )}
    >
      <Checkbox
        className="pointer-events-auto"
        checked={ticked}
        onCheckedChange={onToggleTick}
        aria-label={`Tick the conversation with ${who}`}
      />
    </span>
  )

  return (
    <div
      className="group/row relative"
      onContextMenu={(event) => {
        // With words selected, the browser's own menu stays, for Copy.
        const selected = window.getSelection()
        if (selected && !selected.isCollapsed) return
        event.preventDefault()
        onRightClick(event.clientX, event.clientY)
      }}
    >
      <button
        type="button"
        onClick={showTick ? onToggleTick : onOpen}
        aria-current={open ? "true" : undefined}
        className={cn(
          "flex w-full items-start gap-3 rounded-lg px-2.5 py-2 text-left transition-colors",
          // The open conversation is the darker fill. A ticked row takes the
          // hover fill, because the tick box itself is what says it is ticked
          // and two rows cannot both look like the one being read.
          open
            ? "bg-muted shadow-[inset_2px_0_0_var(--foreground)]"
            : ticked
              ? "bg-muted/60"
              : "hover:bg-muted/60",
          focusRing
        )}
      >
        <Avatar
          className={cn(
            "mt-0.5",
            // Hidden rather than removed, so the row keeps its shape.
            showTick && "invisible"
          )}
        >
          <AvatarFallback className="text-xs font-medium">
            {initialsFor(thread.leadName, thread.leadEmail)}
          </AvatarFallback>
        </Avatar>

        <span className="grid min-w-0 flex-1 gap-0.5">
          <span className="flex min-w-0 items-baseline gap-2">
            <span
              className={cn(
                "min-w-0 flex-1 truncate text-sm",
                thread.unread
                  ? "font-semibold text-foreground"
                  : "font-medium text-foreground"
              )}
            >
              {who}
            </span>
            {thread.saved ? (
              <StarIcon
                aria-label="Saved"
                className="size-3.5 shrink-0 self-center fill-amber-400 text-amber-500"
              />
            ) : null}
            <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
              {formatInboxTime(thread.last_message_at)}
            </span>
          </span>

          <span className="flex min-w-0 items-center gap-2">
            <span
              className={cn(
                "min-w-0 flex-1 truncate text-sm",
                thread.unread ? "text-foreground" : "text-muted-foreground"
              )}
            >
              {/* An answer of ours reads as a reply rather than as their words. */}
              {thread.lastDirection === "out" ? "You: " : null}
              {thread.snippet ?? thread.subject ?? ""}
            </span>
            {/* The dot and the weight both, so unread never rests on colour. */}
            {thread.unread ? (
              <span
                aria-hidden
                className="size-2 shrink-0 rounded-full bg-primary"
              />
            ) : null}
          </span>

          {hasDraft || followUpDue || waiting || thread.status !== "open" || addressLabel || thread.tags.length ? (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {/* In words, not a coloured dot, because "you left this half
                  written" is not something a shade can say. */}
              {hasDraft ? (
                <span className="font-medium text-foreground">Unsent draft</span>
              ) : null}
              {followUpDue ? (
                <span className="font-medium text-foreground">To follow up</span>
              ) : null}
              {waiting ? (
                <span className="font-medium text-foreground">
                  Waiting {waitedDays} {waitedDays === 1 ? "day" : "days"}
                </span>
              ) : null}
              {thread.status !== "open" ? (
                <span>{CRM_THREAD_STATUS_LABELS[thread.status]}</span>
              ) : null}
              {addressLabel ? (
                <span className="min-w-0 truncate">To {addressLabel}</span>
              ) : null}
              {thread.tags.slice(0, 3).map((tag) => (
                <span
                  key={tag}
                  className="max-w-24 shrink-0 truncate rounded-md bg-muted px-1.5 py-0.5"
                >
                  {tag}
                </span>
              ))}
            </span>
          ) : null}
        </span>

        <span className="sr-only">
          {thread.subject || "No subject"}. {thread.unread ? "Unread." : ""}
          {hasDraft ? "Has an unsent draft." : ""}
        </span>
      </button>
      {tickLayer}
    </div>
  )
}
