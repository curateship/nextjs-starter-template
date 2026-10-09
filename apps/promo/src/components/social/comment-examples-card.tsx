import * as React from "react"
import { Loader2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { CollapsibleSettingsCard } from "@/components/settings/collapsible-settings-card"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import {
  getExamplesErrorMessage,
  loadSentComments,
  markNotExample,
  type SentComment,
} from "@/lib/api/social/examples"
import { postedDateText } from "@/lib/social/wording"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * The comments really sent from this account, which drafts copy the voice of.
 *
 * Here, on the Reddit account tab, because there is no screen of sent
 * comments yet. Each one is ticked in by default; unticking marks it as not a
 * good example, so three weak comments cannot teach the AI to write weakly.
 * Nothing is deleted either way.
 */
export function CommentExamplesCard() {
  const [rows, setRows] = React.useState<SentComment[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState<string | null>(null)

  const refresh = React.useCallback(
    (): Promise<void> =>
      loadSentComments().then(
        (next) => {
          setRows(next)
          setError(null)
        },
        (failure: unknown) => setError(getExamplesErrorMessage(failure))
      ),
    []
  )

  React.useEffect(() => {
    void refresh()
  }, [refresh])

  async function toggle(comment: SentComment, useIt: boolean) {
    setSaving(comment.id)
    try {
      await markNotExample(comment.id, !useIt)
      await refresh()
    } catch (failure) {
      showErrorToast(getExamplesErrorMessage(failure))
    } finally {
      setSaving(null)
    }
  }

  return (
    <CollapsibleSettingsCard
      storageId="promo-reddit-examples"
      title="Comments the AI copies your voice from"
      description="Your sent comments, shown to each draft as examples of how you write."
      contentClassName="grid gap-4"
    >
        <p className="text-sm text-muted-foreground">
          The three ticked comments highest in this list are used. Ones you typed
          or edited yourself come first, and the voice&apos;s own words still apply
          alongside them.
        </p>

        {error ? (
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>Your sent comments could not be read. {error}</span>
            <Button type="button" variant="outline" size="sm" onClick={() => void refresh()}>
              Try again
            </Button>
          </div>
        ) : rows === null ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2Icon className="size-4 animate-spin" />
            Reading your sent comments
          </p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing has been sent from this account yet, so drafts go on the
            voice&apos;s words alone.
          </p>
        ) : (
          <ul className="-mx-4 divide-y border-t">
            {rows.map((comment) => {
              const id = `promo-example-${comment.id}`
              return (
                <li key={comment.id} className="flex items-start gap-3 px-4 py-2">
                  <Checkbox
                    id={id}
                    className="mt-0.5"
                    checked={!comment.notExample}
                    disabled={saving !== null}
                    onCheckedChange={(checked) => void toggle(comment, checked === true)}
                  />
                  <div className="grid min-w-0 flex-1 gap-1">
                    {/* Clamped on a span inside: the shared Label is a flex
                        box, and a line clamp needs a block of its own. */}
                    <Label htmlFor={id} className="font-normal leading-relaxed">
                      <span className="line-clamp-3">{comment.text}</span>
                    </Label>
                    <p className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                      <span>{postedDateText(comment.postedAt)}</span>
                      <span>{comment.handWritten ? "Written by you" : "An AI draft, sent as it was"}</span>
                      {comment.notExample ? (
                        <span>Not used as an example</span>
                      ) : comment.inNextDraft ? (
                        <span className="font-medium text-foreground">In the next draft</span>
                      ) : null}
                      {/* Only ever a Reddit address the app wrote, but a stored
                          value goes into an href, so anything else is not drawn. */}
                      {comment.commentUrl.startsWith("https://www.reddit.com/") ? (
                        <a
                          href={comment.commentUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="underline underline-offset-2"
                        >
                          Open on Reddit
                        </a>
                      ) : null}
                    </p>
                  </div>
                  {saving === comment.id ? (
                    <Loader2Icon className="size-4 shrink-0 animate-spin text-muted-foreground" />
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}
    </CollapsibleSettingsCard>
  )
}
