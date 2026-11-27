import { Loader2Icon, MessageCircleReplyIcon, ThumbsUpIcon, UserPlusIcon } from "lucide-react"

import { ScrollArea } from "@/components/ui/scroll-area"
import type { LinkedinToday } from "@/lib/api/social/linkedin"
import { postedDateText } from "@/lib/social/wording"
import { shortCount } from "@/lib/social/x/wording"

import { XListError } from "../x/x-panel-frame"
import { linkedinFollowersText, writerWords } from "./linkedin-words"

/** One row's key: what it answers and the reply itself. */
function answerKey(item: LinkedinToday["toAnswer"][number]): string {
  const [kind, id] = Object.entries(item.under)[0] ?? ["", ""]
  return `${kind}:${id}:${item.incoming.id}`
}

/**
 * LinkedIn's Today tab (part 21): what is worth doing now on this project.
 * The strongest posts under 2 days old waiting for a comment, best first, the
 * replies under ours that nobody has answered, and how many connection
 * requests wait on the People tab. Clicking one opens it where it is
 * answered.
 */
export function LinkedinTodayList({
  today,
  loading,
  error,
  onOpenPost,
  onOpenAnswer,
  onOpenPeople,
  onRetry,
}: {
  today: LinkedinToday | null
  loading: boolean
  error: string | null
  onOpenPost: (findId: string) => void
  onOpenAnswer: (under: LinkedinToday["toAnswer"][number]["under"]) => void
  onOpenPeople: () => void
  onRetry: () => void
}) {
  if (error) return <XListError what="Today list" error={error} onRetry={onRetry} />
  if (!today) {
    return loading ? (
      <p className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
        <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />
        Reading today
      </p>
    ) : null
  }
  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="grid gap-4 py-3">
        <section aria-label="Strong posts to comment on" className="grid gap-1">
          <h3 className="flex items-center gap-2 px-3 text-xs font-medium">
            <span className="size-2 rounded-full bg-emerald-500" aria-hidden="true" />
            Strong posts to comment on
            <span className="font-normal text-muted-foreground tabular-nums">{today.strong.length}</span>
          </h3>
          {today.strong.length ? (
            today.strong.map((find) => (
              <button
                key={find.id}
                type="button"
                onClick={() => onOpenPost(find.id)}
                className="flex w-full min-w-0 items-center gap-3 px-3 py-2 text-left hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <span className="grid min-w-0 flex-1 gap-0.5">
                  <span className="truncate text-sm">{find.text || "A post with no words"}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {[writerWords(find), find.postedAt ? postedDateText(new Date(find.postedAt)) : null, linkedinFollowersText(find.author.followers)]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground tabular-nums">
                  <ThumbsUpIcon className="size-3.5" aria-hidden="true" />
                  {shortCount(find.reactions)}
                </span>
              </button>
            ))
          ) : (
            <p className="px-3 text-sm text-muted-foreground">No strong post is waiting. New ones come in as the keywords search again.</p>
          )}
        </section>
        <section aria-label="Replies to answer" className="grid gap-1 border-t pt-3">
          <h3 className="flex items-center gap-2 px-3 text-xs font-medium">
            <MessageCircleReplyIcon className="size-3.5" aria-hidden="true" />
            Replies to answer
            <span className="font-normal text-muted-foreground tabular-nums">{today.toAnswer.length}</span>
          </h3>
          {today.toAnswer.length ? (
            today.toAnswer.map((item) => (
              <button
                key={answerKey(item)}
                type="button"
                onClick={() => onOpenAnswer(item.under)}
                className="flex w-full min-w-0 items-center gap-3 px-3 py-2 text-left hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <span className="grid min-w-0 flex-1 gap-0.5">
                  <span className="truncate text-sm">{item.incoming.text}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {item.incoming.name || "Someone"} to {item.account ? `in/${item.account}` : "your account"} on &quot;{item.about}&quot;
                  </span>
                </span>
              </button>
            ))
          ) : (
            <p className="px-3 text-sm text-muted-foreground">Nobody is waiting for an answer.</p>
          )}
        </section>
        <section aria-label="Connection requests" className="border-t px-3 pt-3">
          <button
            type="button"
            onClick={onOpenPeople}
            className="flex w-full min-w-0 items-center gap-2 rounded-sm text-left text-sm hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <UserPlusIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            {today.invites
              ? `${today.invites} connection ${today.invites === 1 ? "request waits" : "requests wait"} on the People tab`
              : "No connection request waits. The People tab has viewers and requests sent."}
          </button>
        </section>
      </div>
    </ScrollArea>
  )
}
