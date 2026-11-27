import * as React from "react"
import { LightbulbIcon, Loader2Icon, RefreshCwIcon } from "lucide-react"

import { Hint } from "@/components/social/hint"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { showErrorToast } from "@/lib/toast/error-toast"

/** One idea as every network's list shows it: the question asked, and what a post would say. */
type ShownPostIdea = { findId: string; question: string; about: string }

/**
 * Post ideas from the questions people asked in a project's finds, the same
 * dropdown on LinkedIn, Reddit and X (`src/server/social/post-ideas.ts`). The
 * AI is asked when it opens, and again from the arrows in its heading.
 * Picking one hands it to the network, which writes a post from it; the list
 * waits on that, one idea at a time, so two quick presses never make two.
 */
export function PostIdeasButton<Idea extends ShownPostIdea>({
  ask,
  onPick,
  errorText,
  label = "Post ideas",
}: {
  ask: () => Promise<Idea[]>
  /** Writes a post from the idea. The dropdown closes once it is done; a failure shows in the error toast and leaves it open. */
  onPick: (idea: Idea) => Promise<void>
  errorText: (error: unknown) => string
  label?: string
}) {
  const [open, setOpen] = React.useState(false)
  const [ideas, setIdeas] = React.useState<Idea[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState<string | null>(null)

  async function load() {
    setIdeas(null)
    setError(null)
    try {
      setIdeas(await ask())
    } catch (failure) {
      setError(errorText(failure))
    }
  }

  async function pick(idea: Idea) {
    if (busy) return
    setBusy(idea.findId + idea.question)
    try {
      await onPick(idea)
      setOpen(false)
    } catch (failure) {
      showErrorToast(errorText(failure))
    } finally {
      setBusy(null)
    }
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next && !ideas) void load()
      }}
    >
      <PopoverTrigger asChild>
        <Button type="button" size="sm" variant="ghost">
          <LightbulbIcon />
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <div className="flex items-center gap-2 border-b px-3 py-2">
          <p className="flex-1 text-sm font-medium">Questions people ask</p>
          <Hint label="Ask the AI again">
            <Button type="button" size="icon" variant="ghost" aria-label="Ask the AI again" onClick={() => void load()}>
              <RefreshCwIcon />
            </Button>
          </Hint>
        </div>
        <ScrollArea className="max-h-80">
          {error ? (
            <p className="p-3 text-sm text-muted-foreground">{error}</p>
          ) : ideas === null ? (
            <p className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
              <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />
              Reading the questions in the project&apos;s posts
            </p>
          ) : ideas.length ? (
            <ul className="grid">
              {ideas.map((idea) => (
                <li key={idea.findId + idea.question}>
                  <button
                    type="button"
                    className="grid w-full gap-0.5 px-3 py-2 text-left hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    onClick={() => void pick(idea)}
                  >
                    <span className="flex items-center gap-1.5 text-sm">
                      {busy === idea.findId + idea.question ? <Loader2Icon className="size-3.5 animate-spin" aria-hidden="true" /> : null}
                      {idea.question}
                    </span>
                    <span className="text-xs text-muted-foreground">{idea.about}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="p-3 text-sm text-muted-foreground">No questions found in the project&apos;s posts yet.</p>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  )
}
