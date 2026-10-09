import * as React from "react"
import { Loader2Icon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { CollapsibleSettingsCard } from "@/components/settings/collapsible-settings-card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  blockRedditSubreddit,
  getBlockedErrorMessage,
  loadBlockedSubreddits,
  unblockRedditSubreddit,
  type BlockedSubreddit,
} from "@/lib/api/social/reddit/blocked"
import { postsWord } from "@/lib/social/wording"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * The subreddits the Reddit dashboard never shows, on the Reddit account tab.
 *
 * Blocking is one press on a post's row; this is where a subreddit comes back
 * off the list, and where one can be blocked before it has turned up. A
 * blocked subreddit's posts are hidden, never deleted, so unblocking brings
 * them back as they were.
 */
export function BlockedSubredditsCard() {
  const [rows, setRows] = React.useState<BlockedSubreddit[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [name, setName] = React.useState("")
  const [invalid, setInvalid] = React.useState(false)
  const [adding, setAdding] = React.useState(false)
  const [removing, setRemoving] = React.useState<string | null>(null)

  const refresh = React.useCallback(
    (): Promise<void> =>
      loadBlockedSubreddits().then(
        (next) => {
          setRows(next)
          setError(null)
        },
        (failure: unknown) => setError(getBlockedErrorMessage(failure))
      ),
    []
  )

  React.useEffect(() => {
    void refresh()
  }, [refresh])

  async function add() {
    if (!name.trim()) {
      setInvalid(true)
      showErrorToast("Type a subreddit name first.")
      return
    }
    setAdding(true)
    try {
      const answer = await blockRedditSubreddit(name)
      setName("")
      setInvalid(false)
      await refresh()
      toast.success(`r/${answer.subreddit} blocked. ${postsWord(answer.hidden)} hidden.`)
    } catch (failure) {
      showErrorToast(getBlockedErrorMessage(failure))
    } finally {
      setAdding(false)
    }
  }

  async function remove(subreddit: string) {
    setRemoving(subreddit)
    try {
      const answer = await unblockRedditSubreddit(subreddit)
      await refresh()
      toast.success(`r/${answer.subreddit} unblocked. ${postsWord(answer.restored)} back.`)
    } catch (failure) {
      showErrorToast(getBlockedErrorMessage(failure))
    } finally {
      setRemoving(null)
    }
  }

  return (
    <CollapsibleSettingsCard
      storageId="promo-reddit-blocked"
      title="Subreddits you never see"
      description="Posts from these never show on the Reddit dashboard, under any keyword."
      contentClassName="grid gap-4"
    >
        <form
          className="grid gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            void add()
          }}
        >
          <Label htmlFor="promo-block-subreddit">Block a subreddit</Label>
          <div className="flex gap-2">
            <Input
              id="promo-block-subreddit"
              value={name}
              aria-invalid={invalid || undefined}
              placeholder="r/nosleep"
              onChange={(event) => {
                setName(event.target.value)
                if (invalid) setInvalid(false)
              }}
            />
            <Button type="submit" variant="outline" disabled={adding}>
              {adding ? <Loader2Icon className="animate-spin" /> : null}
              Block
            </Button>
          </div>
        </form>

        {error ? (
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>The blocked list could not be read. {error}</span>
            <Button type="button" variant="outline" size="sm" onClick={() => void refresh()}>
              Try again
            </Button>
          </div>
        ) : rows === null ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2Icon className="size-4 animate-spin" />
            Reading the blocked list
          </p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing is blocked. The block button at the end of a post&apos;s row on
            the Reddit dashboard stops its subreddit turning up under any keyword.
          </p>
        ) : (
          <ul className="-mx-4 divide-y border-t">
            {rows.map((row) => (
              <li key={row.subreddit} className="flex items-center gap-3 px-4 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">r/{row.subreddit}</p>
                  <p className="text-xs text-muted-foreground">
                    {row.hidden ? `${postsWord(row.hidden)} hidden` : "No stored posts hidden"}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={removing !== null}
                  onClick={() => void remove(row.subreddit)}
                  aria-label={`Unblock r/${row.subreddit}`}
                >
                  {removing === row.subreddit ? <Loader2Icon className="animate-spin" /> : null}
                  Unblock
                </Button>
              </li>
            ))}
          </ul>
        )}
    </CollapsibleSettingsCard>
  )
}
