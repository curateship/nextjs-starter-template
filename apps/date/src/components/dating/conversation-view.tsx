import * as React from "react"
import { Loader2Icon, MessagesSquareIcon, RefreshCwIcon, UserRoundXIcon } from "lucide-react"

import { DashboardCardTitleHeader } from "@/components/shared/dashboard-card-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { MatchDetail } from "@/lib/api/dating/dashboard"
import { MESSAGE_STATUS_WORDS, WALK_WORDS } from "@/lib/dating/options"
import { cn } from "@/lib/utils"

import { whenWords } from "./words"

/**
 * One conversation in the middle column: their messages on the left, ours on
 * the right marked "You" or "AI", newest at the bottom. Refresh reads the chat
 * from the phone again; Unmatch, after a confirm, unmatches through Tinder's
 * own menu.
 */
export function ConversationView({
  match,
  back,
  busy,
  onRefresh,
  onUnmatch,
}: {
  match: MatchDetail
  back: (() => void) | null
  busy: string | null
  onRefresh: () => void
  /** Resolves true when the unmatch was put on the phone's list. */
  onUnmatch: () => Promise<boolean>
}) {
  const [confirming, setConfirming] = React.useState(false)
  const end = React.useRef<HTMLDivElement | null>(null)
  const newest = match.messages[match.messages.length - 1]?.id

  // The newest message in view whenever one arrives.
  React.useEffect(() => {
    end.current?.scrollIntoView({ block: "end" })
  }, [newest])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <DashboardCardTitleHeader
        icon={<MessagesSquareIcon className="size-4" />}
        back={back ? { label: "Back to the list", onClick: back } : undefined}
        title={match.theirName}
        meta={match.sample ? "Sample" : `Matched ${whenWords(match.matchedAt)}`}
        action={
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button type="button" variant="ghost" size="icon" aria-label="Read this chat again from the phone" disabled={busy === "refresh"} onClick={onRefresh}>
                  {busy === "refresh" ? <Loader2Icon className="animate-spin" /> : <RefreshCwIcon />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Read this chat again from the phone</TooltipContent>
            </Tooltip>
            {match.unmatchedAt ? null : (
              <Button type="button" variant="ghost" onClick={() => setConfirming(true)}>
                <UserRoundXIcon /> Unmatch
              </Button>
            )}
          </div>
        }
      />
      <ScrollArea className="min-h-0 flex-1">
        <div className="grid gap-3 p-3">
          {match.messages.length ? null : (
            <p className="text-sm text-muted-foreground">
              No messages yet. {match.sample ? "" : "Refresh reads the chat from the phone."}
            </p>
          )}
          {match.messages.map((message) => {
            const ours = message.direction === "out"
            return (
              <div key={message.id} className={cn("flex flex-col gap-1", ours ? "items-end" : "items-start")}>
                <div
                  className={cn(
                    "max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed whitespace-pre-line",
                    ours ? "bg-primary text-primary-foreground" : "bg-muted",
                    ours && message.status !== "sent" && "opacity-70"
                  )}
                >
                  {message.text}
                </div>
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  {ours ? <Badge variant="outline">{message.sentBy === "ai" ? "AI" : "You"}</Badge> : null}
                  <span>{whenWords(message.sentAt ?? message.createdAt)}</span>
                  {ours && message.status !== "sent" ? (
                    <span className={cn(message.status === "failed" && "text-destructive")}>
                      · {MESSAGE_STATUS_WORDS[message.status]}
                      {message.error ? `. ${message.error}` : ""}
                    </span>
                  ) : null}
                </div>
              </div>
            )
          })}
          {match.unmatchedAt ? (
            <p className="text-center text-sm text-muted-foreground">You unmatched {match.theirName} {whenWords(match.unmatchedAt)}.</p>
          ) : null}
          {match.pending.length ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2Icon className="size-4 animate-spin" />
              On the phone: {match.pending.map((kind) => WALK_WORDS[kind].toLowerCase()).join(", then ")}.
            </p>
          ) : null}
          <div ref={end} />
        </div>
      </ScrollArea>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Unmatch ${match.theirName}?`}
        description={
          match.sample
            ? "This is a sample, so nothing is sent to a phone."
            : `The phone opens your chat with ${match.theirName} and unmatches through Tinder's own menu. Tinder cannot undo an unmatch.`
        }
        confirmLabel="Unmatch"
        loading={busy === "unmatch"}
        onConfirm={() => {
          void onUnmatch().then((ok) => ok && setConfirming(false))
        }}
      />
    </div>
  )
}
