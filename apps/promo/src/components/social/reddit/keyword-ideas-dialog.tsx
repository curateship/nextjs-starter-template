import * as React from "react"
import { CheckIcon, Loader2Icon, PlusIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
  getRedditErrorMessage,
  suggestKeywords,
  type KeywordIdeas,
} from "@/lib/api/social/reddit/keywords"

import { Hint } from "../hint"

/**
 * Ideas for keywords and subreddits to watch, from the project's description
 * and the subreddits its posts already came from.
 *
 * Nothing is saved until its Add is pressed, and Add saves and searches
 * straight away, the same as typing it into the box. Ideas already saved in
 * the project, and blocked subreddits, never show.
 */
export function KeywordIdeasDialog({
  projectId,
  open,
  onClose,
  onAdd,
}: {
  projectId: string
  open: boolean
  onClose: () => void
  /** Saves and searches one idea. Throws with why when it is refused. */
  onAdd: (idea: { term: string } | { subreddit: string }) => Promise<void>
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => (next ? null : onClose())}>
      {open ? <IdeasBody projectId={projectId} onClose={onClose} onAdd={onAdd} /> : null}
    </Dialog>
  )
}

function IdeasBody({
  projectId,
  onClose,
  onAdd,
}: {
  projectId: string
  onClose: () => void
  onAdd: (idea: { term: string } | { subreddit: string }) => Promise<void>
}) {
  const [ideas, setIdeas] = React.useState<KeywordIdeas | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [adding, setAdding] = React.useState<string | null>(null)
  const [added, setAdded] = React.useState<Set<string>>(new Set())

  const ask = React.useCallback(
    (): Promise<void> =>
      suggestKeywords(projectId).then(
        (answer) => {
          setIdeas(answer)
          setError(null)
        },
        (failure: unknown) => setError(getRedditErrorMessage(failure))
      ),
    [projectId]
  )

  React.useEffect(() => {
    void ask()
  }, [ask])

  async function add(key: string, idea: { term: string } | { subreddit: string }) {
    setAdding(key)
    try {
      await onAdd(idea)
      setAdded((current) => new Set([...current, key]))
    } catch {
      // The caller has said why in the error toast; the idea stays offered.
    } finally {
      setAdding(null)
    }
  }

  function row(key: string, label: string, idea: { term: string } | { subreddit: string }) {
    const done = added.has(key)
    return (
      <li key={key} className="flex min-w-0 items-center justify-between gap-2">
        <Hint label={label}>
          <span className="min-w-0 truncate text-sm">{label}</span>
        </Hint>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={done || adding !== null}
          onClick={() => void add(key, idea)}
        >
          {adding === key ? <Loader2Icon className="animate-spin" /> : done ? <CheckIcon /> : <PlusIcon />}
          {done ? "Added" : "Add"}
        </Button>
      </li>
    )
  }

  return (
    <DialogContent variant="admin">
      <DialogHeader>
        <DialogTitle>Keyword ideas</DialogTitle>
        <DialogDescription>
          Suggested from what this project makes. Add saves one and searches it straight away.
        </DialogDescription>
      </DialogHeader>
      <DialogBody>
        {error ? (
          <div className="grid gap-3">
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button type="button" variant="outline" className="justify-self-start" onClick={() => void ask()}>
              Try again
            </Button>
          </div>
        ) : !ideas ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2Icon className="size-4 animate-spin" />
            Asking the AI for ideas. This takes a few seconds.
          </p>
        ) : (
          <div className="grid gap-6">
            <Card size="sm">
              <CardHeader>
                <CardTitle>Keywords</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                {ideas.keywords.length ? (
                  <ul className="grid gap-2">
                    {ideas.keywords.map((term) => row(`k:${term}`, term, { term }))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">No new keywords. Every idea is saved already.</p>
                )}
              </CardContent>
            </Card>
            <Card size="sm">
              <CardHeader>
                <CardTitle>Subreddits to watch</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                {ideas.subreddits.length ? (
                  <ul className="grid gap-2">
                    {ideas.subreddits.map((name) => row(`s:${name}`, `r/${name}`, { subreddit: name }))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">No new subreddits. Every one is watched or blocked already.</p>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </DialogBody>
      <DialogFooter>
        <Button type="button" onClick={onClose}>
          Done
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}
