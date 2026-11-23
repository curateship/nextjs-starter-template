import * as React from "react"
import { useNavigate, useRouter } from "@tanstack/react-router"
import { CheckCheckIcon, InboxIcon, ListChecksIcon, Loader2Icon } from "lucide-react"
import { toast } from "sonner"

import { PanelCard } from "@/components/project/panel-card"
import { NotificationRow } from "@/components/shared/notification-row"
import { useShellRuntime } from "@/components/shell/shell-layout"
import type { BlockEditing } from "@/components/project/notes/note-block-drawings"
import { BlockTabs, ProjectBlockCard, QuietHeadingButtons, TILE_BODY } from "@/components/project/notes/project-block-card"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  listNotificationPage,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationItem,
} from "@/lib/api/notification"
import { useAppNotificationDetails } from "@/lib/hooks/use-app-notification-details"
import { notificationAction } from "@/lib/notification-action"
import { getProjectErrorMessage } from "@/lib/project/errors"
import { showErrorToast } from "@/lib/toast/error-toast"

/** Notices the card shows at first, and each Load more adds. */
const INBOX_ROWS = 6
/** Notices fetched per page once the loaded ones run out. */
const INBOX_PAGE = 30

type InboxTab = "all" | "unread"

/**
 * My notices, the same ones the bell holds, with the newest first, as Tyler
 * drew them on 13 Oct 2026: "Inbox · 5 unread" with Mark all read, then
 * All and Unread. Tasks, Flows and News went on 11 Nov 2026 (Tyler: "remove
 * this 3 tabs"). Clicking one goes where the
 * bell would take it and marks it read. A card on the left since 23 Oct 2026,
 * when the right panel became the open task's alone; on the site admin's, behind
 * an inbox icon instead (25 Oct 2026). It shows 6, and Load
 * more shows 6 more, fetching the next page once the loaded ones run out
 * (Tyler, 23 Oct 2026: "the inbox should have 6 open and a button to load more").
 */
/** The first page of my notices, loaded with My dashboard, and where the next page starts (null with no more). */
const INBOX_TABS: { value: InboxTab; label: string }[] = [
  { value: "all", label: "All" },
  { value: "unread", label: "Unread" },
]

export type InboxPage = { notifications: NotificationItem[]; nextCursor: string | null }

export function InboxCard({
  inbox,
  block,
}: {
  inbox: InboxPage
  /**
   * Drawn as a "/" block on the site admin's own page (Tyler, 11 Nov 2026:
   * "turn look back and inbox tabs into blocks"), with Delete block in its ⋮
   * while the page can be written in.
   */
  block?: BlockEditing
}) {
  const { notifications: firstPage, nextCursor } = inbox
  const navigate = useNavigate()
  const router = useRouter()
  const { onOpenFeedbackThread } = useShellRuntime()
  const [later, setLater] = React.useState<{ items: NotificationItem[]; cursor: string | null }>({
    items: [],
    cursor: nextCursor,
  })
  const notifications = React.useMemo(() => {
    const ids = new Set(firstPage.map((item) => item.id))
    return [...firstPage, ...later.items.filter((item) => !ids.has(item.id))]
  }, [firstPage, later.items])
  const details = useAppNotificationDetails(notifications)
  const [readHere, setReadHere] = React.useState<Record<string, string>>({})
  const [tab, setTab] = React.useState<InboxTab>("all")
  const [count, setCount] = React.useState(INBOX_ROWS)
  const [loading, setLoading] = React.useState(false)
  const [markingAll, setMarkingAll] = React.useState(false)
  const isUnread = (item: NotificationItem) => !item.read_at && !readHere[item.id]
  const unread = notifications.filter(isUnread).length
  const shown = notifications.filter((item) =>
    tab === "all" ? true : isUnread(item)
  )

  /** Six more, from what is loaded, or from the next page once those run out. */
  async function loadMore() {
    if (shown.length > count || !later.cursor) {
      setCount((n) => n + INBOX_ROWS)
      return
    }
    setLoading(true)
    try {
      const page = await listNotificationPage({ cursor: later.cursor, limit: INBOX_PAGE })
      setLater((current) => ({ items: [...current.items, ...page.notifications], cursor: page.next_cursor }))
      setCount((n) => n + INBOX_ROWS)
    } catch (error) {
      showErrorToast(getProjectErrorMessage(error))
    } finally {
      setLoading(false)
    }
  }

  function open(item: NotificationItem) {
    if (isUnread(item)) {
      setReadHere((current) => ({ ...current, [item.id]: new Date().toISOString() }))
      // A failed save puts the unread dot back, as the bell does.
      markNotificationRead(item.id).catch((error: unknown) => {
        setReadHere((current) => {
          const rest = { ...current }
          delete rest[item.id]
          return rest
        })
        showErrorToast(getProjectErrorMessage(error))
      })
    }
    // The same places the bell opens: the app's own address first, then the
    // shell's for its own notices.
    const href = details[item.id]?.href
    if (href) {
      void navigate({ href })
      return
    }
    const action = notificationAction(item)
    if (action.kind === "billing")
      void navigate({ to: ".", search: (prev) => ({ ...prev, account: "billing" }) })
    else if (action.kind === "automationRun")
      // An approval opens in Waiting on you; a failure opens on its flow's
      // own Runs tab, as the bell does.
      void navigate({
        to: "/admin/automations",
        search: action.waiting
          ? { tab: "waiting", open: action.runId }
          : { tab: "automations", open: action.automationId, full: true, pane: "runs", run: action.runId },
      })
    else if (action.kind === "crmThread")
      void navigate({ to: "/admin/crm", search: { open: action.threadId } })
    else if (action.kind === "feedback") onOpenFeedbackThread(action.feedbackId)
  }

  async function markAllRead() {
    if (unread === 0) {
      toast.message("Everything here is read.")
      return
    }
    if (markingAll) return
    setMarkingAll(true)
    try {
      const result = await markAllNotificationsRead()
      setReadHere((current) => {
        const next = { ...current }
        for (const id of result.notificationIds) next[id] = result.readAt
        return next
      })
      await router.invalidate()
    } catch (error) {
      showErrorToast(getProjectErrorMessage(error))
    } finally {
      setMarkingAll(false)
    }
  }

  const markAllButton = (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label="Mark all read"
          disabled={markingAll}
          onClick={() => void markAllRead()}
        >
          {markingAll ? <Loader2Icon className="size-4 animate-spin" /> : <CheckCheckIcon className="size-4" />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>Mark all read</TooltipContent>
    </Tooltip>
  )
  const changeTab = (value: string) => {
    setTab(value as InboxTab)
    setCount(INBOX_ROWS)
  }
  const list = (
    <>
      {notifications.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <ListChecksIcon className="size-4 shrink-0" aria-hidden />
          Nothing yet. Tasks handed to you, comments and check-in reminders land here.
        </p>
      ) : shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {tab === "unread" ? "Nothing unread." : "Nothing here yet."}
        </p>
      ) : (
        <div className="-mx-2 flex flex-col gap-1">
          {shown.slice(0, count).map((item) => (
            <NotificationRow
              key={item.id}
              item={readHere[item.id] && !item.read_at ? { ...item, read_at: readHere[item.id] } : item}
              detail={details[item.id]}
              onClick={() => open(item)}
            />
          ))}
        </div>
      )}
      {shown.length > count || (later.cursor && shown.length > 0) ? (
        <Button type="button" variant="outline" size="sm" className="w-full" disabled={loading} onClick={() => void loadMore()}>
          {loading ? <Loader2Icon className="size-4 animate-spin" /> : null}
          Load more
        </Button>
      ) : null}
    </>
  )
  // All and Unread drawn as the middle panel's tabs are
  // (Tyler, 11 Nov 2026: "it needs to be consistent with ui standard").
  const tabs = (
    <BlockTabs
      value={tab}
      onValueChange={changeTab}
      tabs={INBOX_TABS.map((item) => (item.value === "unread" && unread ? { ...item, count: unread } : item))}
    />
  )
  if (block) {
    return (
      <ProjectBlockCard editing={block} kind="inbox" title="Inbox" icon={<InboxIcon className="size-4" />} count={unread || undefined}>
        {markAllButton ? <QuietHeadingButtons>{markAllButton}</QuietHeadingButtons> : null}
        {tabs}
        <div className={TILE_BODY}>
          {list}
        </div>
      </ProjectBlockCard>
    )
  }
  const meta = unread ? `${unread} unread` : undefined
  return (
    <PanelCard storageId="project-my-inbox" icon={<InboxIcon className="size-4" />} title="Inbox" meta={meta} action={markAllButton} top={tabs}>
      {list}
    </PanelCard>
  )
}
