import * as React from "react"
import { ChevronDownIcon, Loader2Icon, ScrollTextIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { ScrollArea } from "@/components/ui/scroll-area"
import { rulesSummaryText } from "@/lib/social/wording"
import { cn } from "@/lib/utils"
import type { RulesView } from "@/server/social/reddit/rules"

/**
 * The rules the subreddit has posted, folded to one line above the comment
 * box, because they are the thing to read before writing, not after.
 *
 * Four answers, never confused: not read yet, read and here they are, read
 * and the subreddit has posted none, and Reddit would not say. Nothing here
 * judges a draft or stops the Post button: it shows what the subreddit says
 * and a person decides.
 */
export function SubredditRules({
  subreddit,
  rules,
  working,
  onRead,
}: {
  subreddit: string
  rules: RulesView
  /** A browser job is waiting or running, so a read asked for now waits behind it. */
  working: boolean
  onRead: () => Promise<void>
}) {
  const [open, setOpen] = React.useState(false)
  const [asking, setAsking] = React.useState(false)

  async function read() {
    setAsking(true)
    try {
      await onRead()
    } finally {
      setAsking(false)
    }
  }

  const line = "flex min-h-8 items-center gap-2 text-xs text-muted-foreground"
  const icon = <ScrollTextIcon className="size-4 shrink-0" />

  if (rules.reading || (asking && rules.state === "unread")) {
    return (
      <p className={line}>
        <Loader2Icon className="size-4 shrink-0 animate-spin" />
        Reading r/{subreddit}&apos;s rules
        {working ? " after the work already waiting" : ""}
      </p>
    )
  }

  if (rules.state === "unread" || rules.state === "failed") {
    return (
      <div className={line}>
        {icon}
        <span className="min-w-0 flex-1">
          {rules.state === "unread"
            ? `r/${subreddit}'s rules have not been read yet.`
            : rules.error || `Reddit would not show r/${subreddit}'s rules.`}
        </span>
        <Button type="button" variant="outline" size="sm" disabled={asking} onClick={() => void read()}>
          {rules.state === "unread" ? "Read them" : "Try again"}
        </Button>
      </div>
    )
  }

  if (rules.state === "none") {
    return (
      <p className={line}>
        {icon}
        r/{subreddit} has posted no rules of its own.
      </p>
    )
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger
        className={cn(
          line,
          "w-full rounded-md text-left hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        )}
      >
        {icon}
        <span className="min-w-0 flex-1 truncate">
          {rulesSummaryText(subreddit, rules.rules)}
        </span>
        <ChevronDownIcon
          className={cn("size-4 shrink-0 transition-transform motion-reduce:transition-none", open && "rotate-180")}
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ScrollArea className="mt-2 rounded-lg border bg-background" viewportClassName="max-h-48">
          <ol className="grid gap-2 p-3 text-xs">
            {rules.rules.map((rule, index) => (
              <li key={`${index}-${rule.title}`} className="grid gap-0.5">
                <span className="font-medium">
                  {index + 1}. {rule.title || "A rule with no title"}
                </span>
                {rule.description ? (
                  <span className="whitespace-pre-wrap text-muted-foreground">
                    {rule.description}
                  </span>
                ) : null}
              </li>
            ))}
          </ol>
        </ScrollArea>
      </CollapsibleContent>
    </Collapsible>
  )
}
