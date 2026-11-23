import { HandIcon, Loader2Icon, MessageCircleReplyIcon, RefreshCwIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { MediumToday } from "@/lib/api/social/medium"
import { followersText } from "@/lib/social/medium/wording"
import { postedDateText } from "@/lib/social/wording"

/**
 * Medium's Today tab (part 15): what is worth doing now on this project. The
 * strongest stories waiting for a response, best first, and the responses
 * people wrote under ours and under our articles that nobody has answered.
 * Clicking one opens it where it is answered.
 */
export function MediumTodayList({
  today,
  loading,
  error,
  onOpenStory,
  onOpenAnswer,
  onRetry,
}: {
  today: MediumToday | null
  loading: boolean
  error: string | null
  onOpenStory: (findId: string) => void
  onOpenAnswer: (under: { responseId: string } | { articleId: string }) => void
  onRetry: () => void
}) {
  if (error) {
    return (
      <div className="grid justify-items-start gap-3 p-4">
        <p className="text-sm text-muted-foreground">Today could not be read. {error}</p>
        <Button type="button" variant="outline" onClick={onRetry}>
          <RefreshCwIcon />
          Try again
        </Button>
      </div>
    )
  }
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
        <section aria-label="Strong stories to respond to" className="grid gap-1">
          <h3 className="flex items-center gap-2 px-3 text-xs font-medium">
            <span className="size-2 rounded-full bg-emerald-500" aria-hidden="true" />
            Strong stories to respond to
            <span className="font-normal text-muted-foreground tabular-nums">{today.strong.length}</span>
          </h3>
          {today.strong.length ? (
            today.strong.map((find) => (
              <button
                key={find.id}
                type="button"
                onClick={() => onOpenStory(find.id)}
                className="flex w-full min-w-0 items-center gap-3 px-3 py-2 text-left hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <span className="grid min-w-0 flex-1 gap-0.5">
                  <span className="truncate text-sm">{find.title}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {[find.writer.name || `@${find.writer.handle}`, find.postedAt ? postedDateText(find.postedAt) : null, followersText(find.writer.followers)].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground tabular-nums">
                  <HandIcon className="size-3.5" aria-hidden="true" />
                  {find.claps}
                </span>
              </button>
            ))
          ) : (
            <p className="px-3 text-sm text-muted-foreground">No strong story is waiting. New ones come in as the keywords search again.</p>
          )}
        </section>
        <section aria-label="Responses to answer" className="grid gap-1 border-t pt-3">
          <h3 className="flex items-center gap-2 px-3 text-xs font-medium">
            <MessageCircleReplyIcon className="size-3.5" aria-hidden="true" />
            Responses to answer
            <span className="font-normal text-muted-foreground tabular-nums">{today.toAnswer.length}</span>
          </h3>
          {today.toAnswer.length ? (
            today.toAnswer.map((item) => (
              <button
                key={item.incoming.id}
                type="button"
                onClick={() => onOpenAnswer(item.under)}
                className="flex w-full min-w-0 items-center gap-3 px-3 py-2 text-left hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <span className="grid min-w-0 flex-1 gap-0.5">
                  <span className="truncate text-sm">{item.incoming.text}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {item.incoming.writer ? `@${item.incoming.writer}` : "A reader"} to @{item.account} on &quot;{item.title}&quot;
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
