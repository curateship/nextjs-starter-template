import * as React from "react"

import { blockAndCloseThread, ConversationRecord } from "@/components/crm/conversation-record"
import type { CrmFrame } from "@/components/crm/crm-frame"
import { OutboxEmailPanel } from "@/components/crm/outbox-panels"
import {
  InboxListPanel,
  type InboxFilters,
  type InboxRowActions,
} from "@/components/crm/inbox-list-panel"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  getCrmErrorMessage,
  loadInbox,
  markConversationsRead,
  markConversationUnread,
  markMatchingConversationsRead,
  setConversationRobot,
  setConversationSaved,
  type InboxPage,
  type InboxThread,
  type ManyThreadsResult,
} from "@/lib/api/crm/inbox"
import type { DevOutboxItem } from "@/lib/api/email/dev-outbox"
import { CRM_MAX_THREADS_PER_PRESS } from "@/lib/crm/crm"
import { useReplyStore } from "@/components/crm/reply-store"
import { inboxListChoices } from "@/lib/crm/crm-search"
import { useClearSelectionOnListChange } from "@/lib/hooks/use-clear-selection"
import { useSelection } from "@/lib/hooks/use-selection"
import { STREAM_NUDGE_EVENT } from "@/lib/hooks/use-notification-stream"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * The CRM's Inbox section, in the Admin 3 panel design (7 Nov 2026,
 * `workspace/tasks/features/crm/36-crm-admin-3-panel.md`): the inbox in the
 * middle, and the open conversation with who it is with on the right. The
 * dashboard's one frame (`crm-frame.tsx`) holds the left page, remembers the
 * widths, opens the first conversation on arrival and goes back to the last
 * address.
 */
export function CrmWorkspace({
  page,
  outbox,
  filters,
  openThreadId: openId,
  heading,
  headingEnd,
  frame,
  onFiltersChange,
  onOpenThread,
  onReloadInbox,
  onOpenContact,
}: {
  page: InboxPage
  /** The local development outbox, read only while its pill is picked. */
  outbox: DevOutboxItem[] | null
  /** The start of the middle's header: the section's icon and name. */
  heading: React.ReactNode
  /** The end of the middle's header: the button that reopens a shut right panel. */
  headingEnd: React.ReactNode
  /** Draws the section into the dashboard's one frame. */
  frame: CrmFrame
  filters: InboxFilters
  openThreadId: string | null
  onFiltersChange: (next: Partial<InboxFilters>) => void
  onOpenThread: (threadId: string | null) => void
  /** Sends the route's loader round again, which is what redraws the list. */
  onReloadInbox: () => void
  /** Opens a lead's contact on the People tab, from the conversation's ⋮. */
  onOpenContact: (contactId: string) => void
}) {
  // Under the Outbox pill `?open=` names an outbox email, never a
  // conversation, so nothing below reads it as one.
  const openThreadId = filters.view === "outbox" ? null : openId
  // The ticked rows. They live here rather than in the panel, for the same
  // reason the open conversation does: this component survives every redraw
  // the panel below it does not.
  const ticks = useSelection()
  const [tickedBusy, setTickedBusy] = React.useState(false)
  // Mass select, held here and handed to the list. Off clears the ticks.
  const [massSelect, setMassSelect] = React.useState(false)
  const toggleMassSelect = (tickId?: string) => {
    if (massSelect) {
      ticks.clear()
      setMassSelect(false)
      return
    }
    setMassSelect(true)
    // Turned on from a row's right-click, that row starts ticked.
    if (tickId) ticks.setSelected(new Set([tickId]))
  }

  // Changing a filter, the search or the unread tab clears the ticks, because
  // the rows they pointed at are no longer the rows on screen. Same hook as
  // every dashboard table.
  useClearSelectionOnListChange(
    ticks.setSelected,
    [
      filters.search,
      filters.stage,
      filters.view,
      filters.toAddress,
      filters.tag,
      filters.followUpDue,
      // The order too: page 1 of "longest waiting" is a different set of rows
      // from page 1 of "newest first", so a tick made in one must not be
      // counted in the other.
      filters.sort,
    ].join("|")
  )

  // The first page comes from the route's loader; Load more appends to it. A
  // fresh loader result replaces the lot, checked during the render so the new
  // page is in the first paint rather than the second.
  const [threads, setThreads] = React.useState(page.threads)
  const [lastLoaded, setLastLoaded] = React.useState(page.threads)
  const [loadingMore, setLoadingMore] = React.useState(false)
  if (lastLoaded !== page.threads) {
    setLastLoaded(page.threads)
    setThreads(page.threads)
    // A tick must never outlive the row it pointed at. The filters clearing
    // the ticks covers a filter change, but a fresh loader result also arrives
    // after a conversation is opened or a press is made, and it comes back as
    // the first page only. Without this, a tick made on row 45 of a
    // loaded-more list survives into a list that stops at 30, and the bar
    // then counts a row nobody can see.
    const stillHere = new Set(page.threads.map((thread) => thread.id))
    ticks.setSelected((current) => {
      const kept = new Set(
        [...current].filter((threadId) => stillHere.has(threadId))
      )
      return kept.size === current.size ? current : kept
    })
  }

  // The half-written replies, for the rows' "Unsent draft" (`reply-store.ts`).
  const replyDrafts = useReplyStore().drafts

  // Bumped to read the open conversation again from here: a new message
  // in it from the live inbox, a press on ticked rows that included it, or a
  // row's own Save or Close on it.
  const [reloadToken, setReloadToken] = React.useState(0)
  const reloadThread = () => setReloadToken((count) => count + 1)
  // The row in the list already knows who the conversation is with, so the
  // header has a name to draw before the lead panel's own fetch lands.
  const openRow = threads.find((thread) => thread.id === openThreadId) ?? null

  // The live inbox (CRM task 33). The bell's stream nudges when mail lands;
  // this reads the first page again, quietly. **The rows never move under the
  // pointer**: what is new is counted for a bar, and pressing it redraws. The
  // tab counts change at once, because a number changing is not rows moving.
  // The conversation open on the right takes its new message in place. With
  // the live bell off there is no nudge, and the screen is what it was.
  const [live, setLive] = React.useState<{
    news: number
    counts: { all: number; unread: number; saved: number; waiting: number; other: number }
  } | null>(null)
  const liveRef = React.useRef({ threads, filters, openThreadId, pageSize: page.pageSize })
  React.useEffect(() => {
    liveRef.current = { threads, filters, openThreadId, pageSize: page.pageSize }
  })
  React.useEffect(() => {
    let cancelled = false
    const check = () => {
      const { threads: shown, filters: current, openThreadId: open } = liveRef.current
      void loadInbox(inboxListChoices(current))
        .then((fresh) => {
          if (cancelled) return
          const before = new Map(shown.map((row) => [row.id, row.last_message_at]))
          const news = fresh.threads.filter(
            (row) => before.get(row.id) !== row.last_message_at
          )
          setLive({
            news: news.length,
            counts: {
              all: fresh.allCount,
              unread: fresh.unreadCount,
              saved: fresh.savedCount,
              waiting: fresh.waitingCount,
              other: fresh.otherCount,
            },
          })
          if (open && news.some((row) => row.id === open)) reloadThread()
        })
        .catch(() => undefined)
    }
    window.addEventListener(STREAM_NUDGE_EVENT, check)
    return () => {
      cancelled = true
      window.removeEventListener(STREAM_NUDGE_EVENT, check)
    }
  }, [])
  // A fresh inbox from the route is the news shown, so the bar goes.
  const [liveFor, setLiveFor] = React.useState(page)
  if (liveFor !== page) {
    setLiveFor(page)
    setLive(null)
  }

  const reloadBoth = () => {
    reloadThread()
    onReloadInbox()
  }

  const loadMore = async () => {
    if (loadingMore) return
    setLoadingMore(true)
    try {
      const next = await loadInbox({
        // The order rides along: without it the next page comes back newest
        // first, so Load more would restart the order halfway down the list.
        ...inboxListChoices(filters),
        page: Math.floor(threads.length / page.pageSize) + 1,
      })
      // Filtered by id: a message arriving mid-scroll reorders the list on the
      // server, and without this the same conversation could appear twice.
      setThreads((current) => {
        const seen = new Set(current.map((thread) => thread.id))
        return [
          ...current,
          ...next.threads.filter((thread) => !seen.has(thread.id)),
        ]
      })
    } catch (error) {
      showErrorToast(getCrmErrorMessage(error))
    } finally {
      setLoadingMore(false)
    }
  }

  /** One ticked-rows press: one request, one redraw. */
  const runOnTicked = async (
    write: (threadIds: string[]) => Promise<ManyThreadsResult>
  ) => {
    const threadIds = Array.from(ticks.selected)
    if (threadIds.length === 0 || tickedBusy) return

    if (threadIds.length > CRM_MAX_THREADS_PER_PRESS) {
      showErrorToast(
        `${CRM_MAX_THREADS_PER_PRESS} conversations is the most one press can take. Untick some and go again.`
      )
      return
    }

    setTickedBusy(true)
    try {
      await write(threadIds)
      ticks.clear()
      // The list redraws itself, and the open conversation with it: closing a
      // set that includes the one on screen must not leave its header saying
      // "Open".
      reloadBoth()
    } catch (error) {
      showErrorToast(getCrmErrorMessage(error))
    } finally {
      setTickedBusy(false)
    }
  }

  // "Mark all 612 read" (CRM task 38, part 7): every unread conversation the
  // search, filters and view match, not only the ticked rows. It asks first
  // with the real number, and leaves alone mail newer than the list on screen.
  const [markAllAsk, setMarkAllAsk] = React.useState(false)
  const [markingAll, setMarkingAll] = React.useState(false)
  const markAllRead = async () => {
    setMarkingAll(true)
    try {
      await markMatchingConversationsRead(inboxListChoices(filters), page.listedAt)
      ticks.clear()
      reloadBoth()
    } catch (error) {
      showErrorToast(getCrmErrorMessage(error))
    } finally {
      setMarkingAll(false)
      setMarkAllAsk(false)
    }
  }

  const blockThread = (threadId: string, address: string) => blockAndCloseThread(threadId, address, reloadBoth)

  const markUnread = async (threadId: string) => {
    try {
      await markConversationUnread(threadId)
      // The list, not the conversation: the thread on screen is unchanged and
      // reloading it would stamp it read again the moment it came back.
      onReloadInbox()
    } catch (error) {
      showErrorToast(getCrmErrorMessage(error))
    }
  }

  const changeSaved = async (threadId: string, saved: boolean) => {
    try {
      await setConversationSaved(threadId, saved)
      if (threadId === openThreadId) reloadThread()
      onReloadInbox()
    } catch (error) {
      showErrorToast(getCrmErrorMessage(error))
    }
  }

  // A row's right-click asks before blocking, as the ⋮ does: a misclick that
  // quietly stopped a real customer's mail is the failure this is shaped around.
  const [blockAsk, setBlockAsk] = React.useState<InboxThread | null>(null)
  const [blockingRow, setBlockingRow] = React.useState(false)

  // "Not a robot" or "Move to Other" (CRM task 38, part 4): one press, kept
  // for the address, and the list read again so the row moves view.
  const changeRobot = async (threadId: string, robot: boolean) => {
    try {
      await setConversationRobot(threadId, robot)
      if (threadId === openThreadId) reloadThread()
      onReloadInbox()
    } catch (error) {
      showErrorToast(getCrmErrorMessage(error))
    }
  }

  const rowActions: InboxRowActions = {
    onSave: (thread, saved) => void changeSaved(thread.id, saved),
    onRobot: (thread, robot) => void changeRobot(thread.id, robot),
    onMarkUnread: (thread) => void markUnread(thread.id),
    onBlock: (thread) => setBlockAsk(thread),
  }

  const addressLabels = new Map(
    page.addresses.map((address) => [
      address.address.toLowerCase(),
      address.label.trim() || address.address,
    ])
  )

  const inbox = (
    <InboxListPanel
      threads={threads}
      allCount={live?.counts.all ?? page.allCount}
      unreadCount={live?.counts.unread ?? page.unreadCount}
      savedCount={live?.counts.saved ?? page.savedCount}
      waitingCount={live?.counts.waiting ?? page.waitingCount}
      otherCount={live?.counts.other ?? page.otherCount}
      waitingShown={page.unansweredDays > 0}
      outboxShown={page.outboxAvailable}
      outbox={outbox}
      openOutboxId={filters.view === "outbox" ? openId : null}
      onOpenOutbox={(emailId) => onOpenThread(emailId)}
      heading={heading}
      headingEnd={headingEnd}
      newMail={live?.news ?? 0}
      onShowNewMail={onReloadInbox}
      loading={false}
      loadingMore={loadingMore}
      hasMore={threads.length < page.total}
      openThreadId={openThreadId}
      massSelect={{ on: massSelect, onToggle: toggleMassSelect }}
      replyDrafts={replyDrafts}
      filters={filters}
      inboundAddress={page.inboundAddress}
      addressLabels={addressLabels}
      actions={rowActions}
      addresses={page.addresses}
      siteTags={page.tags}
      unansweredDays={page.unansweredDays}
      onStarted={(threadId) => {
        onReloadInbox()
        onOpenThread(threadId)
      }}
      ticked={ticks.selected}
      tickedBusy={tickedBusy}
      onFiltersChange={onFiltersChange}
      onOpen={(thread) => onOpenThread(thread.id)}
      onToggleTick={ticks.toggle}
      onClearTicks={ticks.clear}
      onMarkTickedRead={() =>
        void runOnTicked(markConversationsRead)
      }
      unreadInView={page.unreadInView}
      onMarkAllRead={() => setMarkAllAsk(true)}
      onLoadMore={loadMore}
    />
  )

  const right = (
    <ConversationRecord
      threadId={openThreadId}
      fallbackName={openRow?.leadName ?? null}
      fallbackEmail={openRow?.leadEmail ?? null}
      emptyLine={
        threads.length > 0
          ? null
          : filters.view === "saved"
            ? "No conversation is saved."
            : filters.view === "waiting"
              ? "Nobody is waiting on you."
              : filters.view === "other"
                ? "No mail from no-reply addresses or mailing lists."
              : filters.view === "unread" ||
                  filters.search ||
                  filters.stage !== "all" ||
                  filters.toAddress ||
                  filters.tag ||
                  filters.followUpDue
                ? "No conversation matches."
                : "No mail has arrived yet."
      }
      replyFromFallback={page.replyFrom}
      reloadToken={reloadToken}
      onListChanged={onReloadInbox}
      onOpenContact={onOpenContact}
    />
  )

  return frame({
    ids: filters.view === "outbox" ? (outbox ?? []).map((email) => email.id) : threads.map((thread) => thread.id),
    showMiddleFor: `${filters.toAddress}|${filters.stage}`,
    showRightFor: openId ?? undefined,
    middle: inbox,
    right: {
      label: filters.view === "outbox" ? "Email" : "Conversation",
      showLabel: filters.view === "outbox" ? "Show the email" : "Show the conversation",
      content:
        filters.view === "outbox" ? (
          <OutboxEmailPanel email={(outbox ?? []).find((email) => email.id === openId) ?? null} />
        ) : (
          right
        ),
    },
    windows: (
      <>
      <ConfirmDialog
        open={markAllAsk}
        onOpenChange={(open) => (open ? undefined : setMarkAllAsk(false))}
        destructive={false}
        title={`Mark ${page.unreadInView.toLocaleString()} ${page.unreadInView === 1 ? "conversation" : "conversations"} read?`}
        description="Every unread conversation this search, filter and view match, including the ones not loaded yet. Mail that arrived after the list was drawn stays unread."
        confirmLabel="Mark them read"
        loading={markingAll}
        onConfirm={() => void markAllRead()}
      />
      <ConfirmDialog
        open={blockAsk !== null}
        onOpenChange={(open) => (open ? undefined : setBlockAsk(null))}
        destructive={false}
        title="Block mail from this address?"
        description={`Mail from ${blockAsk?.leadEmail ?? "this address"} stops reaching the inbox and this conversation closes. Nothing is deleted: every message is still recorded, and Settings → Email → Blocked senders unblocks the address in one press.`}
        confirmLabel="Block the address"
        loading={blockingRow}
        onConfirm={() => {
          if (!blockAsk) return
          setBlockingRow(true)
          void blockThread(blockAsk.id, blockAsk.leadEmail).finally(() => {
            setBlockingRow(false)
            setBlockAsk(null)
          })
        }}
      />
      </>
    ),
  })
}
