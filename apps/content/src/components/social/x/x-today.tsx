import { HeartIcon, Loader2Icon, MessageCircleReplyIcon } from "lucide-react"

import { ScrollArea } from "@/components/ui/scroll-area"
import type { XToday } from "@/lib/api/social/x"
import { postedDateText } from "@/lib/social/wording"
import { shortCount } from "@/lib/social/x/wording"

import { XListError } from "./x-panel-frame"
import { authorWords, xFollowersText } from "./x-words"

/**
 * One row's key. A reply under one of ours can also name the account, so it
 * comes in twice, once as a reply and once as a mention: the id alone repeats.
 */
function answerKey(item: XToday["toAnswer"][number]): string {
  const [kind, id] = Object.entries(item.under)[0] ?? ["", ""]
  return `${kind}:${id}:${item.incoming.id}`
}

/**
 * X's Today tab (part 20): what is worth doing now on this project. The
 * strongest posts under 12 hours old waiting for a reply, best first, and the
 * replies under ours and the posts naming our accounts that nobody has
 * answered. Clicking one opens it where it is answered.
 */
export function XTodayList({
  today,
  loading,
  error,
  onOpenPost,
  onOpenAnswer,
  onRetry,
}: {
  today: XToday | null
  loading: boolean
  error: string | null
  onOpenPost: (findId: string) => void
  onOpenAnswer: (under: XToday["toAnswer"][number]["under"]) => void
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
        <section aria-label="Strong posts to reply to" className="grid gap-1">
          <h3 className="flex items-center gap-2 px-3 text-xs font-medium">
            <span className="size-2 rounded-full bg-emerald-500" aria-hidden="true" />
            Strong posts to reply to
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
                    {[authorWords(find), find.postedAt ? postedDateText(new Date(find.postedAt)) : null, xFollowersText(find.author.followers)].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground tabular-nums">
                  <HeartIcon className="size-3.5" aria-hidden="true" />
                  {shortCount(find.likes)}
                </span>
              </button>
            ))
          ) : (
            <p className="px-3 text-sm text-muted-foreground">No strong post is waiting. New ones come in as the keywords search again.</p>
          )}
        </section>
        <section aria-label="Replies and mentions to answer" className="grid gap-1 border-t pt-3">
          <h3 className="flex items-center gap-2 px-3 text-xs font-medium">
            <MessageCircleReplyIcon className="size-3.5" aria-hidden="true" />
            Replies and mentions to answer
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
                    @{item.incoming.handle} to @{item.account}
                    {"mentionId" in item.under ? ", naming the account" : ` on "${item.about}"`}
                  </span>
                </span>
              </button>
            ))
          ) : (
            <p className="px-3 text-sm text-muted-foreground">Nobody is waiting for an answer.</p>
          )}
        </section>
      </div>
    </ScrollArea>
  )
}
