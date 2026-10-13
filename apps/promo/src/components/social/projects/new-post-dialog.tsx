import * as React from "react"
import { Loader2Icon, SparklesIcon } from "lucide-react"
import { toast } from "sonner"

import { SubredditRules } from "@/components/social/reddit/subreddit-rules"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { DisabledReason } from "@/components/ui/disabled-reason"
import { FieldLabel } from "@/components/ui/field-label"
import { FormDialog } from "@/components/ui/form-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import type { ProjectAccount } from "@/lib/api/social/projects"
import {
  getOwnPostErrorMessage,
  loadRulesFor,
  readRulesFor,
  sendOwnPost,
  writeOwnPost,
} from "@/lib/api/social/reddit/own-posts"
import { MAX_POST_BODY_CHARS, MAX_POST_TITLE_CHARS } from "@/lib/social/options"
import { postingBlockedReason, whenText } from "@/lib/social/wording"
import { showErrorToast } from "@/lib/toast/error-toast"
import type { RulesView } from "@/server/social/reddit/rules"

/** How often to read the rules again while a read of them is on its way. */
const RULES_POLL_MS = 2_000

export type NewPostStart = {
  accountId: string | null
  subreddit: string
  title: string
  body: string
}

/**
 * Writing a post of your own: a new post in a subreddit, from one of the
 * project's accounts.
 *
 * The subreddit's rules show first, before anything is written, because
 * moderators remove self-promotion posts faster than comments. Write with AI
 * fills in a title and words for a person to read and change; Post sends them
 * through every rule a comment goes through: warm-up, pace and waking hours.
 * It is tried once and never again.
 */
export function NewPostDialog({
  open,
  projectId,
  accounts,
  start,
  onClose,
}: {
  open: boolean
  projectId: string
  /** The project's accounts, best to post from first. */
  accounts: ProjectAccount[]
  /** What to open with: empty, or a failed post's words from Try again. */
  start: NewPostStart | null
  onClose: () => void
}) {
  if (!open) return null
  return (
    <NewPostWindow
      // A fresh window each time it opens, so last time's words never linger.
      key={JSON.stringify(start)}
      projectId={projectId}
      accounts={accounts}
      start={start}
      onClose={onClose}
    />
  )
}

function NewPostWindow({
  projectId,
  accounts,
  start,
  onClose,
}: {
  projectId: string
  accounts: ProjectAccount[]
  start: NewPostStart | null
  onClose: () => void
}) {
  const [accountId, setAccountId] = React.useState<string>(
    start?.accountId && accounts.some((account) => account.id === start.accountId)
      ? start.accountId
      : (accounts[0]?.id ?? "")
  )
  const [subreddit, setSubreddit] = React.useState(start?.subreddit ?? "")
  const [idea, setIdea] = React.useState("")
  const [title, setTitle] = React.useState(start?.title ?? "")
  const [body, setBody] = React.useState(start?.body ?? "")
  const [rules, setRules] = React.useState<{ subreddit: string; view: RulesView } | null>(null)
  const [drafting, setDrafting] = React.useState(false)
  const [posting, setPosting] = React.useState(false)
  // Set once Post is pressed, so an empty box is marked only after a try.
  const [tried, setTried] = React.useState(false)
  const dirty = title !== (start?.title ?? "") || body !== (start?.body ?? "") || Boolean(idea.trim())
  const account = accounts.find((one) => one.id === accountId) ?? null
  const cleaned = subreddit.trim().replace(/^(https?:\/\/(www\.)?reddit\.com)?\/?r\//i, "").replace(/\/.*$/, "")

  const lookUpRules = React.useCallback(
    (name: string): Promise<void> =>
      loadRulesFor(name).then(
        (answer) => setRules(answer ? { subreddit: answer.subreddit, view: answer.rules } : null),
        () => setRules(null)
      ),
    []
  )

  // A read of the rules takes the reader browser a minute, so the window asks
  // again until it lands, from the timer's own callback.
  const reading = rules?.view.reading ?? false
  React.useEffect(() => {
    if (!reading || !rules) return
    const timer = setInterval(() => void lookUpRules(rules.subreddit), RULES_POLL_MS)
    return () => clearInterval(timer)
  }, [lookUpRules, reading, rules])

  // The rules of a subreddit the window opened with, read once.
  React.useEffect(() => {
    if (start?.subreddit) void lookUpRules(start.subreddit)
  }, [lookUpRules, start?.subreddit])

  // Post is greyed out only for a reason no typing can fix. An empty box is
  // said on the press instead, and the box is marked.
  const blocked = account ? postingBlockedReason(account, null) : null
  const postReason = !accounts.length ? "This project has no accounts. Add one on the left first." : (blocked?.text ?? null)
  const missing = !account
    ? "Pick the account it posts as."
    : !cleaned
      ? "Name the subreddit it goes to."
      : !title.trim()
        ? "Give the post a title."
        : null

  return (
    <FormDialog open dirty={dirty} busy={posting} onClose={onClose}>
      {(requestClose) => (
        <DialogContent variant="admin">
          <DialogHeader>
            <DialogTitle>New post</DialogTitle>
            <DialogDescription>
              A post of your own in a subreddit, from one of this project&apos;s accounts. Read the
              subreddit&apos;s rules first: many remove anything that reads as promotion.
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={async (event) => {
              event.preventDefault()
              if (postReason) return
              if (missing || !account) {
                setTried(true)
                showErrorToast(missing ?? "Pick the account it posts as.")
                return
              }
              setPosting(true)
              try {
                const { runAfter } = await sendOwnPost({
                  projectId,
                  accountId: account.id,
                  subreddit: cleaned,
                  title: title.trim(),
                  body: body.trim(),
                })
                toast.success(
                  runAfter
                    ? `It is night where ${account.handle ? `u/${account.handle}` : "the account"} lives, so your post waits for its morning and goes ${whenText(new Date(runAfter))}.`
                    : "Your post is on its way to Reddit. It shows on the Comments screen's Posts tab once it lands."
                )
                onClose()
              } catch (error) {
                showErrorToast(getOwnPostErrorMessage(error))
              } finally {
                setPosting(false)
              }
            }}
          >
            <DialogBody>
              <div className="grid gap-6">
                <Card size="sm">
                  <CardHeader>
                    <CardTitle>Where it goes</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="grid gap-2">
                        <Label htmlFor="new-post-account">Posts as</Label>
                        <Select value={accountId} onValueChange={setAccountId}>
                          <SelectTrigger id="new-post-account" className="w-full sm:w-fit">
                            <SelectValue placeholder="Pick an account" />
                          </SelectTrigger>
                          <SelectContent>
                            {accounts.map((one) => (
                              <SelectItem key={one.id} value={one.id}>
                                {one.handle ? `u/${one.handle}` : "An account not signed in"}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="new-post-subreddit">Subreddit</Label>
                        <Input
                          id="new-post-subreddit"
                          value={subreddit}
                          placeholder="SaaS"
                          aria-invalid={(tried && !cleaned) || undefined}
                          onChange={(event) => setSubreddit(event.target.value)}
                          onBlur={() => {
                            if (cleaned) void lookUpRules(cleaned)
                          }}
                        />
                      </div>
                    </div>
                    {rules && rules.subreddit.toLowerCase() === cleaned.toLowerCase() ? (
                      <SubredditRules
                        subreddit={rules.subreddit}
                        rules={rules.view}
                        working={rules.view.reading}
                        onRead={async () => {
                          try {
                            await readRulesFor(rules.subreddit)
                            await lookUpRules(rules.subreddit)
                          } catch (error) {
                            showErrorToast(getOwnPostErrorMessage(error))
                          }
                        }}
                      />
                    ) : cleaned ? (
                      <p className="text-xs text-muted-foreground">
                        Leave the subreddit box to see r/{cleaned}&apos;s rules.
                      </p>
                    ) : null}
                  </CardContent>
                </Card>

                <Card size="sm">
                  <CardHeader>
                    <CardTitle>The post</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-4">
                    <div className="grid gap-2">
                      <FieldLabel
                        htmlFor="new-post-idea"
                        hint="Only for Write with AI. A line or two is plenty. Leave it empty and it writes from the project's description."
                      >
                        What it is about
                      </FieldLabel>
                      <Textarea
                        id="new-post-idea"
                        rows={1}
                        value={idea}
                        placeholder="What I learned getting my first 100 users from Reddit"
                        onChange={(event) => setIdea(event.target.value)}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        className="justify-self-start"
                        disabled={drafting}
                        onClick={async () => {
                          setDrafting(true)
                          try {
                            const draft = await writeOwnPost({
                              projectId,
                              accountId: account?.id ?? null,
                              subreddit: cleaned,
                              idea,
                            })
                            setTitle(draft.title)
                            setBody(draft.body)
                          } catch (error) {
                            showErrorToast(getOwnPostErrorMessage(error))
                          } finally {
                            setDrafting(false)
                          }
                        }}
                      >
                        {drafting ? <Loader2Icon className="animate-spin" /> : <SparklesIcon />}
                        Write with AI
                      </Button>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="new-post-title">Title</Label>
                      <Input
                        id="new-post-title"
                        value={title}
                        maxLength={MAX_POST_TITLE_CHARS}
                        aria-invalid={(tried && !title.trim()) || undefined}
                        onChange={(event) => setTitle(event.target.value)}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="new-post-body">The words</Label>
                      <Textarea
                        id="new-post-body"
                        rows={1}
                        value={body}
                        maxLength={MAX_POST_BODY_CHARS}
                        onChange={(event) => setBody(event.target.value)}
                      />
                    </div>
                  </CardContent>
                </Card>
              </div>
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="outline" disabled={posting} onClick={requestClose}>
                Cancel
              </Button>
              <DisabledReason reason={postReason ?? "Posting now."} disabled={Boolean(postReason) || posting}>
                <Button type="submit" disabled={Boolean(postReason) || posting}>
                  {posting ? <Loader2Icon className="animate-spin" /> : null}
                  Post to Reddit
                </Button>
              </DisabledReason>
            </DialogFooter>
          </form>
        </DialogContent>
      )}
    </FormDialog>
  )
}
