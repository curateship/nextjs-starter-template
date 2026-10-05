import * as React from "react"
import {
  ArchiveIcon,
  ClockIcon,
  ListFilterIcon,
  MailOpenIcon,
  SearchIcon,
  XIcon,
} from "lucide-react"

import { EmptyRow } from "@/components/shared/feed-card"
import { LoadMoreButton } from "@/components/shared/load-more-button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { DashboardCardHeader } from "@/components/shared/dashboard-card-header"
import { DatePicker } from "@/components/ui/date-picker"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
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
import { Tabs, TabsCount, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
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
import { plural } from "@/lib/format/plural"
import { useSyncedDraft } from "@/lib/hooks/use-synced-draft"
import { focusRing } from "@/lib/layout/focus-ring"
import type { InboxThread } from "@/lib/api/crm/inbox"
import { cn } from "@/lib/utils"

export type InboxFilters = {
  search: string
  status: CrmThreadStatus | "all"
  stage: CrmStage | "all"
  unreadOnly: boolean
  followUpDue: boolean
  /** Which end of the list comes first. Not a filter: it hides nothing. */
  sort: CrmInboxSort
}

/**
 * The left panel: every conversation, newest first until the funnel's Order
 * says longest waiting.
 *
 * One row per conversation, never one per message. A thread somebody has
 * answered three times would otherwise fill the list with four near-identical
 * rows and bury the new mail underneath them.
 *
 * The header is the two things looked at constantly — everything, or just what
 * is unread — with search and the rest of the filters behind a button each.
 * Five controls on permanent display would take a third of the panel's height
 * from the list they are there to narrow.
 *
 * Rows are built by hand rather than with `DashboardTable`. That component's
 * main column is fixed at 320px, which inside a panel this narrow clips the
 * subject and the time both.
 *
 * **Rows can be ticked**, and then a bar above the list deals with the lot in
 * one press. A morning of newsletters was otherwise twenty conversations
 * opened and closed one at a time.
 */
export function InboxListPanel({
  threads,
  allCount,
  unreadCount,
  loading,
  loadingMore,
  hasMore,
  openThreadId,
  ticked,
  tickedBusy,
  replyDrafts,
  filters,
  inboundAddress,
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
   * The two tab counts. Both obey every filter except the unread one, so
   * neither changes when the other tab is pressed.
   */
  allCount: number
  unreadCount: number
  loading: boolean
  loadingMore: boolean
  hasMore: boolean
  openThreadId: string | null
  /** The ticked conversations, by id. Owned above, so a redraw keeps them. */
  ticked: Set<string>
  /** True while a ticked-rows press is still in flight. */
  tickedBusy: boolean
  /** The half-written replies, so a row can say it was left half finished. */
  replyDrafts: ReplyDrafts
  filters: InboxFilters
  inboundAddress: string | null
  onFiltersChange: (next: Partial<InboxFilters>) => void
  onOpen: (thread: InboxThread) => void
  onToggleTick: (threadId: string) => void
  onClearTicks: () => void
  onMarkTickedRead: () => void
  onCloseTicked: () => void
  onSnoozeTicked: (until: Date) => void
  onLoadMore: () => void
}) {
  // Typing writes straight to the box and the search itself is debounced by
  // the owner, so the caret never jumps while a request is in flight. The box
  // follows the address when the address changes, which is what fills it in
  // when a filtered link is opened.
  const appliedSearch = filters.search
  const [searchText, setSearchText] = useSyncedDraft(appliedSearch)
  // Open while there is something in it, so a search arriving in the address
  // is not hidden behind a button nobody has pressed.
  const [searchOpen, setSearchOpen] = React.useState(appliedSearch.length > 0)

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

  // What is behind the funnel, so the button can say it is doing something.
  // The unread tab is not counted: it has its own place in the header.
  const narrowed =
    (filters.status !== "open" ? 1 : 0) +
    (filters.stage !== "all" ? 1 : 0) +
    (filters.followUpDue ? 1 : 0)

  // Counted for the dot but kept out of `filtered`, because the order hides
  // nothing. An empty inbox that is merely reordered must not claim "nothing
  // matches that" when the real answer is that no mail has arrived.
  const reordered = filters.sort !== CRM_DEFAULT_INBOX_SORT
  const funnelCount = narrowed + (reordered ? 1 : 0)

  const filtered = narrowed > 0 || filters.unreadOnly || appliedSearch.length > 0

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-card">
      <DashboardCardHeader className="gap-2">
        <Tabs
          value={filters.unreadOnly ? "unread" : "all"}
          onValueChange={(value) =>
            onFiltersChange({ unreadOnly: value === "unread" })
          }
          className="min-w-0"
        >
          <TabsList>
            <TabsTrigger
              value="all"
              aria-label={`All conversations, ${allCount}`}
            >
              All
              <TabsCount>{allCount}</TabsCount>
            </TabsTrigger>
            <TabsTrigger
              value="unread"
              aria-label={`Unread conversations, ${unreadCount}`}
            >
              Unread
              <TabsCount>{unreadCount}</TabsCount>
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="ml-auto flex shrink-0 items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label={searchOpen ? "Hide the search box" : "Search the inbox"}
            aria-expanded={searchOpen}
            onClick={() => {
              if (searchOpen && searchText) setSearchText("")
              setSearchOpen((open) => !open)
            }}
          >
            {searchOpen ? (
              <XIcon className="size-4" />
            ) : (
              <SearchIcon className="size-4" />
            )}
          </Button>

          <Popover>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="relative size-8"
                aria-label={
                  funnelCount > 0
                    ? `Filters and order, ${funnelCount} on`
                    : "Filter and order the inbox"
                }
              >
                <ListFilterIcon className="size-4" />
                {funnelCount > 0 ? (
                  <span
                    aria-hidden
                    className="absolute top-1 right-1 size-1.5 rounded-full bg-primary"
                  />
                ) : null}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-60">
              <div className="grid gap-3">
                <div className="grid gap-1.5">
                  <FieldLabel htmlFor="inbox-status">
                    Which conversations
                  </FieldLabel>
                  <Select
                    value={filters.status}
                    onValueChange={(value) =>
                      onFiltersChange({
                        status: value as CrmThreadStatus | "all",
                      })
                    }
                  >
                    <SelectTrigger id="inbox-status" className="h-8">
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
                </div>

                <div className="grid gap-1.5">
                  <FieldLabel htmlFor="inbox-stage">Stage</FieldLabel>
                  <Select
                    value={filters.stage}
                    onValueChange={(value) =>
                      onFiltersChange({ stage: value as CrmStage | "all" })
                    }
                  >
                    <SelectTrigger id="inbox-stage" className="h-8">
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
                </div>

                <div className="grid gap-1.5">
                  <FieldLabel
                    htmlFor="inbox-sort"
                    hint="Longest waiting puts the person who has been waiting the most days at the top, which is the order for clearing the inbox rather than reading it."
                  >
                    Order
                  </FieldLabel>
                  <Select
                    value={filters.sort}
                    onValueChange={(value) =>
                      onFiltersChange({ sort: value as CrmInboxSort })
                    }
                  >
                    <SelectTrigger id="inbox-sort" className="h-8">
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
                </div>

                <button
                  type="button"
                  aria-pressed={filters.followUpDue}
                  onClick={() =>
                    onFiltersChange({ followUpDue: !filters.followUpDue })
                  }
                  className={cn(
                    "h-8 rounded-md border px-2 text-xs font-medium transition-colors",
                    filters.followUpDue
                      ? "border-transparent bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    focusRing
                  )}
                >
                  Only the ones to follow up
                </button>

                {funnelCount > 0 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      onFiltersChange({
                        status: "open",
                        stage: "all",
                        followUpDue: false,
                        sort: CRM_DEFAULT_INBOX_SORT,
                      })
                    }
                  >
                    Clear the filters
                  </Button>
                ) : null}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </DashboardCardHeader>

      {searchOpen ? (
        <div className="shrink-0 border-b p-2">
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="Search mail, names and companies"
              aria-label="Search the inbox"
              className="h-8 pl-8"
              onKeyDown={(event) => {
                if (event.key !== "Escape") return
                // Escape clears first and closes second, which is the order
                // somebody pressing it twice expects.
                if (searchText) setSearchText("")
                else setSearchOpen(false)
              }}
            />
          </div>
        </div>
      ) : null}

      {ticked.size > 0 ? (
        <TickedBar
          count={ticked.size}
          busy={tickedBusy}
          onClear={onClearTicks}
          onMarkRead={onMarkTickedRead}
          onClose={onCloseTicked}
          onSnooze={onSnoozeTicked}
        />
      ) : null}

      <ScrollArea className="min-h-0 flex-1">
        <div className="grid gap-0.5 p-2">
          {loading && threads.length === 0 ? (
            <LoadingRow label="Reading the inbox…" />
          ) : threads.length === 0 ? (
            <EmptyRow>
              {filtered
                ? "Nothing matches that."
                : inboundAddress
                  ? `Nothing has arrived at ${inboundAddress} yet.`
                  : "No address is set for mail to arrive at. Settings → Email is where that goes."}
            </EmptyRow>
          ) : (
            threads.map((thread) => (
              <InboxRow
                key={thread.id}
                thread={thread}
                open={thread.id === openThreadId}
                ticked={ticked.has(thread.id)}
                // Once anything is ticked, every row's box stays out. Boxes
                // that only appear under the pointer make picking the fifth
                // row a hunt for where the fourth one was.
                showTick={ticked.size > 0}
                hasDraft={hasReplyDraft(replyDrafts, thread.id)}
                onOpen={() => onOpen(thread)}
                onToggleTick={() => onToggleTick(thread.id)}
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
    </div>
  )
}

/**
 * The bar that appears above the list once a row is ticked.
 *
 * Icon buttons, not words. The panel is a fifth of the window, and "Mark
 * read", "Close" and "Snooze" spelled out leave no room for the count. They
 * are the same three icons the conversation header uses for the same three
 * actions, so the bar teaches nothing new.
 */
function TickedBar({
  count,
  busy,
  onClear,
  onMarkRead,
  onClose,
  onSnooze,
}: {
  count: number
  busy: boolean
  onClear: () => void
  onMarkRead: () => void
  onClose: () => void
  onSnooze: (until: Date) => void
}) {
  const [snoozeOpen, setSnoozeOpen] = React.useState(false)

  return (
    <div className="flex shrink-0 items-center gap-1 border-b px-2 py-1.5">
      <span className="text-xs font-medium" aria-live="polite">
        {count} ticked
      </span>

      <div className="ml-auto flex shrink-0 items-center gap-1">
        <TickedAction
          label={`Mark ${count} ${plural(count, "conversation")} read`}
          busy={busy}
          onClick={onMarkRead}
          icon={<MailOpenIcon className="size-4" />}
        />

        <TickedAction
          label={`Close ${count} ${plural(count, "conversation")}`}
          busy={busy}
          onClick={onClose}
          icon={<ArchiveIcon className="size-4" />}
        />

        <Popover open={snoozeOpen} onOpenChange={setSnoozeOpen}>
          <Tooltip>
            <TooltipTrigger asChild>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  disabled={busy}
                  aria-label={`Snooze ${count} ${plural(count, "conversation")} until a date`}
                >
                  <ClockIcon className="size-4" />
                </Button>
              </PopoverTrigger>
            </TooltipTrigger>
            <TooltipContent>Snooze until a date</TooltipContent>
          </Tooltip>
          <PopoverContent align="end" className="w-64">
            <div className="grid gap-2">
              <p className="text-xs text-muted-foreground">
                They leave the inbox until this date, then come back on their
                own.
              </p>
              <DatePicker
                value={undefined}
                placeholder="Pick a date"
                onChange={(date) => {
                  if (!date) return
                  setSnoozeOpen(false)
                  onSnooze(date)
                }}
              />
            </div>
          </PopoverContent>
        </Popover>

        {/* Never busy: letting go of the ticks writes nothing, so there is
            no reason to wait for a press that is still in flight. */}
        <TickedAction
          label="Clear the ticks"
          busy={false}
          onClick={onClear}
          icon={<XIcon className="size-4" />}
        />
      </div>
    </div>
  )
}

function TickedAction({
  label,
  busy,
  onClick,
  icon,
}: {
  label: string
  busy: boolean
  onClick: () => void
  icon: React.ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8"
          disabled={busy}
          aria-label={label}
          onClick={onClick}
        >
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

function InboxRow({
  thread,
  open,
  ticked,
  showTick,
  hasDraft,
  onOpen,
  onToggleTick,
}: {
  thread: InboxThread
  open: boolean
  /** This row is ticked. */
  ticked: boolean
  /** Keep the tick box out whether or not the pointer is over the row. */
  showTick: boolean
  /** A reply was started in this conversation and never sent. */
  hasDraft: boolean
  onOpen: () => void
  onToggleTick: () => void
}) {
  const who = thread.leadName?.trim() || thread.leadEmail
  const followUpDue =
    thread.follow_up_at !== null && new Date(thread.follow_up_at) <= new Date()

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
        showTick
          ? "opacity-100"
          : "opacity-0 group-hover/row:opacity-100 group-focus-within/row:opacity-100"
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
    <div className="group/row relative">
      <button
        type="button"
        onClick={onOpen}
        aria-current={open ? "true" : undefined}
        className={cn(
          "flex w-full items-start gap-3 rounded-lg px-2.5 py-2 text-left transition-colors",
          // The open conversation is the darker fill. A ticked row takes the
          // hover fill, because the tick box itself is what says it is ticked
          // and two rows cannot both look like the one being read.
          open ? "bg-muted" : ticked ? "bg-muted/60" : "hover:bg-muted/60",
          focusRing
        )}
      >
        <Avatar
          className={cn(
            "mt-0.5",
            // Hidden rather than removed, so the row keeps its shape.
            showTick
              ? "invisible"
              : "group-hover/row:invisible group-focus-within/row:invisible"
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

          {hasDraft || followUpDue || thread.status !== "open" ? (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {/* In words, not a coloured dot, because "you left this half
                  written" is not something a shade can say. */}
              {hasDraft ? (
                <span className="font-medium text-foreground">Unsent draft</span>
              ) : null}
              {followUpDue ? (
                <span className="font-medium text-foreground">To follow up</span>
              ) : null}
              {thread.status !== "open" ? (
                <span>{CRM_THREAD_STATUS_LABELS[thread.status]}</span>
              ) : null}
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
