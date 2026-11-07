import * as React from "react"
import { toast } from "sonner"

import { ConversationPanel } from "@/components/crm/conversation-panel"
import { CrmPagePanel } from "@/components/crm/crm-page-panel"
import {
  InboxListPanel,
  type InboxFilters,
  type InboxRowActions,
} from "@/components/crm/inbox-list-panel"
import { ThreePanels } from "@/components/shared/three-panels"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  blockAddress,
  getBlockedSenderErrorMessage,
} from "@/lib/api/crm/blocked"
import {
  draftReply,
  fetchMessageBody,
  getCrmErrorMessage,
  loadConversation,
  loadInbox,
  markConversationRead,
  markConversationsRead,
  markConversationUnread,
  setConversationSaved,
  setConversationStatus,
  setConversationsStatus,
  summariseConversation,
  type Conversation,
  type InboxPage,
  type InboxThread,
  type ManyThreadsResult,
} from "@/lib/api/crm/inbox"
import { loadLead, type LeadBundle } from "@/lib/api/crm/leads"
import {
  getCrmPageErrorMessage,
  loadCrmBlockFigures,
  loadCrmPage,
  type CrmBlockFigures,
} from "@/lib/api/crm/page"
import { CRM_MAX_THREADS_PER_PRESS, type CrmThreadStatus } from "@/lib/crm/crm"
import {
  applyReplyDraft,
  noReplyDrafts,
  replyDraftFor,
  type ReplyDraftUpdate,
  type ReplyDrafts,
} from "@/lib/crm/reply-drafts"
import { describeBulkResult } from "@/lib/format/bulk-result"
import { useClearSelectionOnListChange } from "@/lib/hooks/use-clear-selection"
import { useSelection } from "@/lib/hooks/use-selection"
import { STREAM_NUDGE_EVENT } from "@/lib/hooks/use-notification-stream"
import { panelLayoutKey } from "@/lib/layout/panel-layout"
import type { StoredPage } from "@/lib/notes/page-body"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * The CRM dashboard in the Admin 3 panel design (7 Nov 2026,
 * `workspace/tasks/features/crm/36-crm-admin-3-panel.md`): the site's page
 * of blocks on the left, the inbox in the middle, and the open conversation
 * with who it is with on the right. `ThreePanels` draws the frame, remembers
 * the widths, opens the first conversation on arrival and goes back to the
 * last address.
 */
export function CrmWorkspace({
  page,
  filters,
  search,
  openThreadId,
  onFiltersChange,
  onOpenThread,
  onReloadInbox,
}: {
  page: InboxPage
  filters: InboxFilters
  /** The route's whole search, which `ThreePanels` keeps to come back to. */
  search: Record<string, unknown>
  openThreadId: string | null
  onFiltersChange: (next: Partial<InboxFilters>) => void
  onOpenThread: (threadId: string | null) => void
  /** Sends the route's loader round again, which is what redraws the list. */
  onReloadInbox: () => void
}) {
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

  // The left page and what its blocks draw. Read once here, and the figures
  // again whenever the inbox is, so a count never disagrees with the list.
  const [crmPage, setCrmPage] = React.useState<StoredPage | null>(null)
  const [figures, setFigures] = React.useState<CrmBlockFigures | null>(null)
  React.useEffect(() => {
    let cancelled = false
    loadCrmPage()
      .then((loaded) => {
        if (cancelled) return
        setCrmPage(loaded.page)
        setFigures(loaded.figures)
      })
      .catch((error) => {
        if (!cancelled) showErrorToast(getCrmPageErrorMessage(error))
      })
    return () => {
      cancelled = true
    }
  }, [])
  // Each fresh inbox (a filter, a press, a reply) reads the figures again.
  // The first inbox is skipped: the page's own read above brought them.
  const firstPage = React.useRef(page)
  React.useEffect(() => {
    if (page === firstPage.current) return
    let cancelled = false
    loadCrmBlockFigures()
      .then((next) => {
        if (!cancelled) setFigures(next)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [page])

  // Changing a filter, the search or the unread tab clears the ticks, because
  // the rows they pointed at are no longer the rows on screen. Same hook as
  // every dashboard table.
  useClearSelectionOnListChange(
    ticks.setSelected,
    [
      filters.search,
      filters.status,
      filters.stage,
      filters.unreadOnly,
      filters.savedOnly,
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

  // The half-written replies, one per conversation. They live here because
  // this component stays mounted while the conversation panel below it is
  // rebuilt for every thread opened, so state inside that panel is lost on
  // every switch. A reload clears them on purpose.
  const [replyDrafts, setReplyDrafts] =
    React.useState<ReplyDrafts>(noReplyDrafts)
  const changeReplyDraft = (threadId: string, update: ReplyDraftUpdate) =>
    setReplyDrafts((current) => applyReplyDraft(current, threadId, update))

  const [loaded, setLoaded] = React.useState<{
    conversation: Conversation
    lead: LeadBundle | null
  } | null>(null)
  // Bumped to pull the conversation and the lead down again after a change.
  const [reloads, setReloads] = React.useState(0)
  // Which request has finished, which is what "still loading" is worked out
  // from. Stamped when the fetch settles rather than flipped on at the start:
  // turning a flag on inside an effect body is a second render for nothing,
  // and `react-hooks/set-state-in-effect` refuses it. The same shape as
  // `SystemEmailSendsPanel`.
  const requestKey = openThreadId ? `${openThreadId}:${reloads}` : null
  const [settledRequest, setSettledRequest] = React.useState<string | null>(
    null
  )
  const loadingThread = requestKey !== null && settledRequest !== requestKey

  // Which conversation is shown is worked out from the address, not stored.
  // Keeping it in state meant clearing that state whenever the address said
  // "none", which is a write inside an effect and one paint of the wrong
  // conversation.
  const conversation =
    loaded && loaded.conversation.id === openThreadId
      ? loaded.conversation
      : null
  const lead = conversation ? loaded?.lead ?? null : null
  // The row in the list already knows who the conversation is with, so the
  // header has a name to draw before the lead panel's own fetch lands, and
  // blocking has an address to send before it too.
  const openRow = threads.find((thread) => thread.id === openThreadId) ?? null

  // Held in a ref so the fetch below is keyed on which conversation is open,
  // not on a callback the owner rebuilds every render. In the deps it would
  // re-run the whole fetch on any parent redraw.
  const reloadInboxRef = React.useRef(onReloadInbox)
  React.useEffect(() => {
    reloadInboxRef.current = onReloadInbox
  })

  React.useEffect(() => {
    if (!openThreadId) return

    let cancelled = false
    loadConversation(openThreadId)
      .then(async (opened) => {
        if (cancelled) return
        // The conversation lands first so it can be read while the lead is
        // still coming. The same conversation read again keeps the lead it
        // had meanwhile: dropping it would empty the ⋮ under a box somebody
        // is typing in, every time a field saves.
        setLoaded((previous) => ({
          conversation: opened,
          lead: previous?.conversation.id === opened.id ? previous.lead : null,
        }))

        // Opening it is reading it, and that is a write, so it goes out as its
        // own checked request once the thread is actually on screen. The list
        // is asked again afterwards, which is what takes the bold off the row.
        if (opened.unread) {
          await markConversationRead(opened.id).catch(() => undefined)
          if (!cancelled) reloadInboxRef.current()
        }

        const bundle = await loadLead(opened.leadId)
        if (!cancelled) setLoaded({ conversation: opened, lead: bundle })
      })
      .catch((error) => {
        if (cancelled) return
        showErrorToast(getCrmErrorMessage(error))
        setLoaded(null)
      })
      .finally(() => {
        if (!cancelled) setSettledRequest(requestKey)
      })

    return () => {
      cancelled = true
    }
  }, [openThreadId, requestKey])

  const reloadThread = () => setReloads((count) => count + 1)

  // The live inbox (CRM task 33). The bell's stream nudges when mail lands;
  // this reads the first page again, quietly. **The rows never move under the
  // pointer**: what is new is counted for a bar, and pressing it redraws. The
  // tab counts change at once, because a number changing is not rows moving.
  // The conversation open on the right takes its new message in place. With
  // the live bell off there is no nudge, and the screen is what it was.
  const [live, setLive] = React.useState<{
    news: number
    counts: { all: number; unread: number; saved: number }
  } | null>(null)
  const liveRef = React.useRef({ threads, filters, openThreadId, pageSize: page.pageSize })
  React.useEffect(() => {
    liveRef.current = { threads, filters, openThreadId, pageSize: page.pageSize }
  })
  React.useEffect(() => {
    let cancelled = false
    const check = () => {
      const { threads: shown, filters: current, openThreadId: open } = liveRef.current
      void loadInbox({
        search: current.search || undefined,
        status: current.status,
        stage: current.stage,
        unreadOnly: current.unreadOnly || undefined,
        savedOnly: current.savedOnly || undefined,
        toAddress: current.toAddress || undefined,
        tag: current.tag || undefined,
        followUpDue: current.followUpDue || undefined,
        sort: current.sort,
      })
        .then((fresh) => {
          if (cancelled) return
          const before = new Map(shown.map((row) => [row.id, row.last_message_at]))
          const news = fresh.threads.filter(
            (row) => before.get(row.id) !== row.last_message_at
          )
          setLive({
            news: news.length,
            counts: { all: fresh.allCount, unread: fresh.unreadCount, saved: fresh.savedCount },
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
        search: filters.search || undefined,
        status: filters.status,
        stage: filters.stage,
        unreadOnly: filters.unreadOnly || undefined,
        savedOnly: filters.savedOnly || undefined,
        toAddress: filters.toAddress || undefined,
        tag: filters.tag || undefined,
        followUpDue: filters.followUpDue || undefined,
        // Without this the next page comes back newest first, so Load more
        // would restart the order halfway down the list.
        sort: filters.sort,
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

  const changeStatus = async (
    status: CrmThreadStatus,
    snoozedUntil?: string | null
  ) => {
    if (!conversation) return
    try {
      await setConversationStatus(conversation.id, status, snoozedUntil)
      reloadBoth()
    } catch (error) {
      showErrorToast(getCrmErrorMessage(error))
    }
  }

  /**
   * One ticked-rows press: one request, one honest sentence, one redraw.
   *
   * The count said is the count the server wrote. The ones that were already
   * read or already closed are named separately and never folded in, because
   * "20 closed" when three of them were shut yesterday is a number nobody can
   * check.
   */
  const runOnTicked = async (
    write: (threadIds: string[]) => Promise<ManyThreadsResult>,
    words: { verb: string; keptReason: string }
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
      const { changed, unchanged } = await write(threadIds)
      toast.success(
        describeBulkResult({
          done: changed,
          kept: unchanged,
          one: "conversation",
          many: "conversations",
          verb: words.verb,
          keptReason: words.keptReason,
        })
      )
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

  /**
   * Blocks an address, and closes its conversation.
   *
   * Two writes, reported separately. The block goes first because it is the
   * half that matters, and a close that then fails is said out loud rather
   * than folded into one message: "nothing worked" when the address is in fact
   * blocked would send somebody to Settings looking for a row that is there.
   */
  const blockThread = async (threadId: string, address: string) => {
    try {
      await blockAddress(address, "Blocked from the conversation")
    } catch (error) {
      showErrorToast(getBlockedSenderErrorMessage(error))
      return
    }

    try {
      await setConversationStatus(threadId, "closed")
    } catch {
      showErrorToast(
        `Mail from ${address} is blocked, but this conversation did not close. Press Close to shut it.`
      )
      reloadBoth()
      return
    }

    toast.success(
      `Mail from ${address} will not reach the inbox. Settings → Email unblocks it.`
    )
    reloadBoth()
  }

  const blockSender = async () => {
    const address = lead?.lead.email ?? openRow?.leadEmail ?? null
    if (!conversation || !address) return
    await blockThread(conversation.id, address)
  }

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
      toast.success(saved ? "Saved." : "Taken out of Saved.")
      if (threadId === openThreadId) reloadThread()
      onReloadInbox()
    } catch (error) {
      showErrorToast(getCrmErrorMessage(error))
    }
  }

  const changeThreadStatus = async (
    threadId: string,
    status: CrmThreadStatus,
    snoozedUntil?: string | null
  ) => {
    try {
      await setConversationStatus(threadId, status, snoozedUntil)
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

  const rowActions: InboxRowActions = {
    onSave: (thread, saved) => void changeSaved(thread.id, saved),
    onMarkUnread: (thread) => void markUnread(thread.id),
    onSnooze: (thread, until) =>
      void changeThreadStatus(thread.id, "snoozed", until.toISOString()),
    onClose: (thread) => void changeThreadStatus(thread.id, "closed"),
    onBlock: (thread) => setBlockAsk(thread),
  }

  const refetchBody = async (messageId: string) => {
    if (!conversation) return
    try {
      await fetchMessageBody(conversation.id, messageId)
      reloadThread()
    } catch (error) {
      showErrorToast(getCrmErrorMessage(error))
    }
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
      unansweredDays={figures?.unansweredDays ?? 0}
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
        void runOnTicked(markConversationsRead, {
          verb: "marked read",
          keptReason: "already read",
        })
      }
      onCloseTicked={() =>
        void runOnTicked(
          (threadIds) => setConversationsStatus(threadIds, "closed"),
          { verb: "closed", keptReason: "already closed" }
        )
      }
      onSnoozeTicked={(until) =>
        void runOnTicked(
          (threadIds) =>
            setConversationsStatus(threadIds, "snoozed", until.toISOString()),
          { verb: "snoozed", keptReason: "already snoozed until then" }
        )
      }
      onLoadMore={loadMore}
    />
  )

  const right = (
    <ConversationPanel
      conversation={conversation}
      lead={lead?.lead ?? null}
      siteTags={lead?.siteTags ?? []}
      leadName={lead?.lead.name ?? openRow?.leadName ?? null}
      leadEmail={lead?.lead.email ?? openRow?.leadEmail ?? null}
      loading={loadingThread}
      emptyLine={
        threads.length > 0
          ? null
          : filters.savedOnly
            ? "No conversation is saved."
            : filters.unreadOnly ||
                filters.search ||
                filters.stage !== "all" ||
                filters.toAddress ||
                filters.tag ||
                filters.followUpDue ||
                filters.status !== "open"
              ? "No conversation matches."
              : "No mail has arrived yet."
      }
      canSend={conversation !== null}
      replyFrom={conversation?.replyFrom ?? page.replyFrom}
      replyDraft={replyDraftFor(replyDrafts, openThreadId)}
      onReplyDraftChange={changeReplyDraft}
      onStatusChange={changeStatus}
      onSavedChange={(saved) => {
        if (conversation) void changeSaved(conversation.id, saved)
      }}
      onMarkUnread={() => {
        if (conversation) void markUnread(conversation.id)
      }}
      onSummarise={async () => {
        if (!conversation) return
        try {
          await summariseConversation(conversation.id)
          reloadThread()
        } catch (error) {
          showErrorToast(getCrmErrorMessage(error))
        }
      }}
      onBlockSender={blockSender}
      onLeadChanged={reloadBoth}
      onFetchBody={refetchBody}
      onSent={reloadBoth}
      onDraft={async () => {
        if (!conversation) return ""
        const { draft } = await draftReply(conversation.id)
        return draft
      }}
    />
  )

  const left = (
    <CrmPagePanel
      page={crmPage}
      figures={figures}
      onPageChange={setCrmPage}
      onFiguresChanged={onReloadInbox}
      blocks={{
        activeAddress: filters.toAddress.toLowerCase(),
        onAddress: (toAddress) => onFiltersChange({ toAddress }),
        activeStage: filters.stage,
        onStage: (stage) => onFiltersChange({ stage }),
        openThreadId,
        onOpenThread: (threadId) => onOpenThread(threadId),
      }}
    />
  )

  return (
    <ThreePanels
      layoutKey={panelLayoutKey.crmWorkspace}
      place={{
        key: panelLayoutKey.crmPlace,
        search,
        ids: threads.map((thread) => thread.id),
      }}
      showMiddleFor={`${filters.toAddress}|${filters.stage}`}
      showRightFor={openThreadId ?? undefined}
      left={{ label: "Page", showLabel: "Show the page", content: left }}
      middle={{ label: "Inbox", content: inbox }}
      right={{
        label: "Conversation",
        showLabel: "Show the conversation",
        content: right,
      }}
    >
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
    </ThreePanels>
  )
}
