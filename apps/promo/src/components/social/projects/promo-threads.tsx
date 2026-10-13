import * as React from "react"
import { ExternalLinkIcon, Loader2Icon, MegaphoneIcon, RefreshCwIcon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  getProjectErrorMessage,
  loadPromoThreads,
  lookForPromoThreads,
  type PromoThreadRow,
} from "@/lib/api/social/projects"
import { postedDateText } from "@/lib/social/wording"
import { showErrorToast } from "@/lib/toast/error-toast"

import { Hint } from "../hint"

/** How often to ask again while a look is on its way. */
const POLL_MS = 3_000

/** Only an address on Reddit is ever opened from a stored value. */
function openOnReddit(url: string) {
  if (url.startsWith("https://www.reddit.com/")) window.open(url, "_blank", "noopener,noreferrer")
}

/** "the next is due in 4 days", "the next is due today", or "the next was due 2 days ago". */
function dueText(row: PromoThreadRow, now: Date): string | null {
  if (!row.nextDue) return null
  const days = Math.round((new Date(row.nextDue).getTime() - now.getTime()) / 86_400_000)
  if (days < 0) return `the next was due ${-days} ${days === -1 ? "day" : "days"} ago`
  if (days === 0) return "the next is due today"
  if (days === 1) return "the next is due tomorrow"
  return `the next is due in ${days} days`
}

/**
 * Each of the project's subreddits' own self-promotion thread: the newest one
 * found, when it went up, and when the next is due.
 *
 * These threads are where mentioning what you make is welcome instead of
 * bannable. Pressing one opens it in the comment box like any post, so every
 * rule Post has still applies. Look for them reads the subreddits the
 * project's posts come from, in the reader browser.
 */
export function PromoThreads({
  projectId,
  onOpen,
}: {
  projectId: string
  /** Opens a thread in the comment box. */
  onOpen: (findId: string) => void
}) {
  const [state, setState] = React.useState<{ threads: PromoThreadRow[]; looking: number } | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [asking, setAsking] = React.useState(false)

  const refresh = React.useCallback(
    (): Promise<void> =>
      loadPromoThreads(projectId).then(
        (next) => {
          setState(next)
          setError(null)
        },
        (failure: unknown) => setError(getProjectErrorMessage(failure))
      ),
    [projectId]
  )

  React.useEffect(() => {
    void refresh()
  }, [refresh])

  const looking = (state?.looking ?? 0) > 0
  React.useEffect(() => {
    if (!looking) return
    const timer = setInterval(() => void refresh(), POLL_MS)
    return () => clearInterval(timer)
  }, [looking, refresh])

  const now = new Date()

  return (
    <div className="grid gap-2">
      <div className="flex items-start justify-between gap-2">
        {/* The window around it carries the title. */}
        <p className="min-w-0 text-sm text-muted-foreground">
          Looked for in the subreddits this project&apos;s posts come from most.
        </p>
        <Hint label="Look in the subreddits this project's posts come from">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={asking || looking}
            onClick={async () => {
              setAsking(true)
              try {
                const { queued } = await lookForPromoThreads(projectId)
                toast.success(
                  queued
                    ? `Looking in ${queued} ${queued === 1 ? "subreddit" : "subreddits"}. They show here as each one is read.`
                    : "Every subreddit is already being looked in."
                )
                await refresh()
              } catch (failure) {
                showErrorToast(getProjectErrorMessage(failure))
              } finally {
                setAsking(false)
              }
            }}
          >
            {asking || looking ? <Loader2Icon className="animate-spin" /> : <MegaphoneIcon />}
            {looking ? "Looking" : "Look"}
          </Button>
        </Hint>
      </div>

      {error ? (
        <div className="grid gap-2">
          <p className="text-sm text-muted-foreground">The threads could not be read. {error}</p>
          <Button type="button" variant="outline" size="sm" className="justify-self-start" onClick={() => void refresh()}>
            <RefreshCwIcon />
            Try again
          </Button>
        </div>
      ) : !state ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2Icon className="size-4 animate-spin" />
          Reading the threads
        </p>
      ) : !state.threads.length ? (
        <p className="text-sm text-muted-foreground">
          {looking
            ? "Looking in this project's subreddits. Each one takes the reader browser a minute."
            : "None found yet. Press Look, and Promo searches the subreddits this project's posts come from. Every subreddit names its thread differently, so some are missed."}
        </p>
      ) : (
        <div className="grid gap-2">
          {state.threads.map((row) => {
            const due = dueText(row, now)
            return (
              <div key={row.subreddit} className="flex min-w-0 items-start gap-2 rounded-lg border p-3">
                <button
                  type="button"
                  onClick={() => onOpen(row.newest.findId)}
                  className="grid min-w-0 flex-1 gap-1 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <span className="block truncate text-sm font-medium">r/{row.subreddit}</span>
                  <span className="block truncate text-xs">
                    {row.newest.title}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    Went up {postedDateText(row.newest.postedAt ? new Date(row.newest.postedAt) : null).toLowerCase()}
                    {row.everyDays ? `, about every ${row.everyDays} ${row.everyDays === 1 ? "day" : "days"}` : ""}
                    {due ? `, ${due}` : ""}
                    {row.newest.commented ? ". You commented in it." : "."}
                  </span>
                </button>
                <Hint label="Open the thread on Reddit">
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label={`Open r/${row.subreddit}'s thread on Reddit`}
                    onClick={() => openOnReddit(row.newest.url)}
                  >
                    <ExternalLinkIcon />
                  </Button>
                </Hint>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/**
 * The Self-promotion threads window, opened from the "⋮" menu in the posts
 * column's header. A window rather than a popover since 13 Oct 2026, when
 * Tyler moved the button into that menu: a popover hangs off a button, and a
 * menu item is gone the moment it is pressed. Opening a thread shuts the
 * window and puts the thread in the comment box.
 */
export function PromoThreadsDialog({
  projectId,
  open,
  onClose,
  onOpen,
}: {
  projectId: string
  open: boolean
  onClose: () => void
  onOpen: (findId: string) => void
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => (next ? null : onClose())}>
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>Self-promotion threads</DialogTitle>
          <DialogDescription>
            Each subreddit&apos;s own thread where saying what you make is allowed.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Card size="sm">
            <CardContent>
              <PromoThreads
                projectId={projectId}
                onOpen={(findId) => {
                  onClose()
                  onOpen(findId)
                }}
              />
            </CardContent>
          </Card>
        </DialogBody>
        <DialogFooter>
          <Button type="button" onClick={onClose}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
