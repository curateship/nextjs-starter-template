import * as React from "react"
import { toast } from "sonner"
import type { PanelImperativeHandle } from "react-resizable-panels"

import { ConversationPanel } from "@/components/crm/conversation-panel"
import { InboxListPanel, type InboxFilters } from "@/components/crm/inbox-list-panel"
import { LeadPanel } from "@/components/crm/lead-panel"
import {
  PanelReopenTab,
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  WorkspacePanel,
} from "@/components/ui/resizable"
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
  setConversationStatus,
  setConversationsStatus,
  type Conversation,
  type InboxPage,
  type ManyThreadsResult,
} from "@/lib/api/crm/inbox"
import { loadLead, type LeadBundle } from "@/lib/api/crm/leads"
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
import {
  useBlankSpaceDoubleClick,
  usePanelToggle,
} from "@/lib/layout/panel-collapse"
import {
  panelLayoutKey,
  useRememberedPanelLayout,
} from "@/lib/layout/panel-layout"
import { useWideScreen } from "@/lib/layout/wide-screen"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * The CRM screen: the inbox on the left, the conversation in the middle, and
 * who it is with on the right.
 *
 * Three panels, not four. The bottom panel of the email and automation
 * editors holds a run or a send history — a list of things that happened to
 * the thing above it. A conversation already IS that list, so a fourth panel
 * would have nothing to put in it.
 */
export function CrmWorkspace({
  page,
  filters,
  openThreadId,
  onFiltersChange,
  onOpenThread,
  onReloadInbox,
}: {
  page: InboxPage
  filters: InboxFilters
  openThreadId: string | null
  onFiltersChange: (next: Partial<InboxFilters>) => void
  onOpenThread: (threadId: string | null) => void
  /** Sends the route's loader round again, which is what redraws the list. */
  onReloadInbox: () => void
}) {
  const desktop = useWideScreen()

  const [inboxCollapsed, setInboxCollapsed] = React.useState(false)
  const [leadCollapsed, setLeadCollapsed] = React.useState(false)
  const inboxPanelRef = React.useRef<PanelImperativeHandle | null>(null)
  const leadPanelRef = React.useRef<PanelImperativeHandle | null>(null)
  const layout = useRememberedPanelLayout(panelLayoutKey.crmWorkspace)

  const toggleInbox = usePanelToggle(inboxPanelRef)
  const toggleLead = usePanelToggle(leadPanelRef)
  const inboxDoubleClick = useBlankSpaceDoubleClick(toggleInbox)
  const leadDoubleClick = useBlankSpaceDoubleClick(toggleLead)

  // The ticked rows. They live here rather than in the panel, for the same
  // reason the open conversation does: this component survives every redraw
  // the panel below it does not.
  const ticks = useSelection()
  const [tickedBusy, setTickedBusy] = React.useState(false)

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
        // The conversation lands first so it can be read while the lead panel
        // is still coming.
        setLoaded({ conversation: opened, lead: null })

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
   * Blocks the address this conversation is with, and closes the thread.
   *
   * Two writes, reported separately. The block goes first because it is the
   * half that matters, and a close that then fails is said out loud rather
   * than folded into one message: "nothing worked" when the address is in fact
   * blocked would send somebody to Settings looking for a row that is there.
   */
  const blockSender = async () => {
    const address = lead?.lead.email ?? openRow?.leadEmail ?? null
    if (!conversation || !address) return

    try {
      await blockAddress(address, "Blocked from the conversation")
    } catch (error) {
      showErrorToast(getBlockedSenderErrorMessage(error))
      return
    }

    try {
      await setConversationStatus(conversation.id, "closed")
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

  const markUnread = async () => {
    if (!conversation) return
    try {
      await markConversationUnread(conversation.id)
      // The list, not the conversation: the thread on screen is unchanged and
      // reloading it would stamp it read again the moment it came back.
      onReloadInbox()
    } catch (error) {
      showErrorToast(getCrmErrorMessage(error))
    }
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

  const inbox = (
    <InboxListPanel
      threads={threads}
      allCount={page.allCount}
      unreadCount={page.unreadCount}
      loading={false}
      loadingMore={loadingMore}
      hasMore={threads.length < page.total}
      openThreadId={openThreadId}
      replyDrafts={replyDrafts}
      filters={filters}
      inboundAddress={page.inboundAddress}
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

  const middle = (
    <ConversationPanel
      conversation={conversation}
      leadName={lead?.lead.name ?? openRow?.leadName ?? null}
      leadEmail={lead?.lead.email ?? openRow?.leadEmail ?? null}
      loading={loadingThread}
      canSend={conversation !== null}
      replyFrom={page.replyFrom}
      replyDraft={replyDraftFor(replyDrafts, openThreadId)}
      onReplyDraftChange={changeReplyDraft}
      onStatusChange={changeStatus}
      onMarkUnread={markUnread}
      onBlockSender={blockSender}
      onFetchBody={refetchBody}
      onSent={reloadBoth}
      onDraft={async () => {
        if (!conversation) return ""
        const { draft } = await draftReply(conversation.id)
        return draft
      }}
    />
  )

  const right = (
    <LeadPanel bundle={lead} loading={loadingThread} onChanged={reloadBoth} />
  )

  if (!desktop) {
    // Under 1280px the panels are dropped, exactly as the editors do it: three
    // side by side on a phone is three unreadable columns. The conversation
    // takes the screen, and the inbox is what shows when none is open.
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <WorkspacePanel className="flex min-w-0 flex-1 flex-col">
          {openThreadId ? middle : inbox}
        </WorkspacePanel>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ResizablePanelGroup
        key={layout.layoutKey}
        orientation="horizontal"
        className="min-h-0 flex-1"
        defaultLayout={layout.defaultLayout}
        onLayoutChanged={layout.onLayoutChanged}
      >
        <ResizablePanel
          id="inbox"
          panelRef={inboxPanelRef}
          collapsible
          collapsedSize="0%"
          // A fifth narrower than it was, at Tyler's ask on 3 Oct 2026. A
          // conversation needs the room more than a list of names does, so the
          // 5 points come off here and go to the middle.
          defaultSize="21%"
          minSize="16%"
          maxSize="40%"
          onResize={(size) => setInboxCollapsed(size.asPercentage < 0.5)}
        >
          <WorkspacePanel
            collapsed={inboxCollapsed}
            onDoubleClick={inboxDoubleClick}
          >
            {inbox}
          </WorkspacePanel>
        </ResizablePanel>

        <ResizableHandle gap collapsed={inboxCollapsed} />

        <ResizablePanel id="conversation" defaultSize="55%" minSize="30%">
          <WorkspacePanel className="relative flex flex-col">
            {middle}
            {inboxCollapsed ? (
              <PanelReopenTab
                side="left"
                label="Show the inbox"
                onClick={toggleInbox}
              />
            ) : null}
            {leadCollapsed ? (
              <PanelReopenTab
                side="right"
                label="Show the lead"
                onClick={toggleLead}
              />
            ) : null}
          </WorkspacePanel>
        </ResizablePanel>

        <ResizableHandle gap collapsed={leadCollapsed} />

        <ResizablePanel
          id="lead"
          panelRef={leadPanelRef}
          collapsible
          collapsedSize="0%"
          defaultSize="24%"
          minSize="18%"
          maxSize="34%"
          onResize={(size) => setLeadCollapsed(size.asPercentage < 0.5)}
        >
          <WorkspacePanel
            collapsed={leadCollapsed}
            onDoubleClick={leadDoubleClick}
          >
            {right}
          </WorkspacePanel>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  )
}
