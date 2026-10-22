import * as React from "react"
import {
  AlertTriangleIcon,
  ArrowLeftIcon,
  BookmarkPlusIcon,
  ClockIcon,
  ExternalLinkIcon,
  HandIcon,
  Loader2Icon,
  LockIcon,
  ShieldCheckIcon,
  SparklesIcon,
  Undo2Icon,
  XIcon,
} from "lucide-react"
import { toast } from "sonner"

import { DashboardCardHeader } from "@/components/shared/dashboard-card-header"
import { Hint } from "@/components/social/hint"
import { Button } from "@/components/ui/button"
import { DisabledReason } from "@/components/ui/disabled-reason"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import {
  addToMediumList,
  checkMediumWords,
  draftMediumResponses,
  getMediumErrorMessage,
  readMediumStoryNow,
  rewriteMediumWords,
  sendMediumResponse,
  takeBackMediumResponse,
  type MediumFindDetail,
  type MediumModuleView,
  type RulesVerdict,
} from "@/lib/api/social/medium"
import { MAX_RESPONSE_CHARS, RESPONSE_REWRITE_WORDS, RESPONSE_REWRITES } from "@/lib/social/medium/options"
import { followersText, mediumPaceLine, mediumPaceWarning, mediumPostingRefusal, mediumWaitingText } from "@/lib/social/medium/wording"
import { postedDateText } from "@/lib/social/wording"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

type Account = MediumModuleView["accounts"][number]

/**
 * One Medium story in the right column, and the response to it (parts 15 to
 * 25 and 34): the story's words, its top responses, what you said before on
 * stories like it, two drafts in the account's voice, the line a response
 * answers, Help only, the three rewrites, the rules check, and Post with ten
 * seconds to take it back. Nothing goes out until Post is pressed.
 */
export function MediumStoryPanel({
  projectId,
  find,
  loading,
  account,
  accountPicker,
  onBack,
  onSkip,
  onChanged,
}: {
  projectId: string
  find: MediumFindDetail | null
  loading: boolean
  account: Account | null
  /** The Respond as dropdown, drawn on its own row above the box. */
  accountPicker: React.ReactNode
  /** Only on a narrow screen, where the story covers the list. */
  onBack?: () => void
  onSkip: (findId: string) => Promise<void>
  onChanged: () => Promise<void>
}) {
  const [text, setText] = React.useState("")
  const [line, setLine] = React.useState("")
  const [fromDraft, setFromDraft] = React.useState<string | null>(null)
  const [helpOnly, setHelpOnly] = React.useState(false)
  const [busy, setBusy] = React.useState<null | "draft" | "check" | "post" | "skip" | "read" | "list" | "rewrite">(null)
  const [verdict, setVerdict] = React.useState<{ text: string; result: RulesVerdict } | null>(null)
  const [undo, setUndo] = React.useState<{ responseId: string; text: string; until: number } | null>(null)
  const [clock, setClock] = React.useState(() => Date.now())

  // The countdown on Undo, ticking only while one shows.
  React.useEffect(() => {
    if (!undo) return
    const timer = setInterval(() => {
      const now = Date.now()
      setClock(now)
      if (now >= undo.until) setUndo(null)
    }, 250)
    return () => clearInterval(timer)
  }, [undo])

  if (loading && !find) {
    return (
      <PanelFrame title="The story and your response" onBack={onBack}>
        <p className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
          <Loader2Icon className="size-4 animate-spin" />
          Reading the story
        </p>
      </PanelFrame>
    )
  }
  if (!find) {
    return (
      <PanelFrame title="The story and your response" onBack={onBack}>
        <p className="p-4 text-sm text-muted-foreground">
          Pick a story from the list and it opens here, with its top responses and the response you would send.
        </p>
      </PanelFrame>
    )
  }

  const refusal = account ? mediumPostingRefusal(account.posting, new Date(), account.posting.timeZone) : null
  const postReason = !account
    ? "Pick an account beside Respond as."
    : !account.handle
      ? "This account is not signed in to Medium yet."
      : refusal
  const paceWarning = account ? mediumPaceWarning(account.posting) : null
  const held = account?.held.find((item) => find.sentHere.some((row) => row.id === item.responseId)) ?? null
  const undoSeconds = undo ? Math.max(0, Math.ceil((undo.until - clock) / 1000)) : 0
  const story = find

  async function run<T>(which: NonNullable<typeof busy>, action: () => Promise<T>): Promise<T | null> {
    setBusy(which)
    try {
      return await action()
    } catch (error) {
      showErrorToast(getMediumErrorMessage(error))
      return null
    } finally {
      setBusy(null)
    }
  }

  const header = (
    <>
      <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
        {story.publication?.name || story.writer.name || (story.writer.handle ? `@${story.writer.handle}` : "A Medium story")}
      </span>
      {story.status !== "commented" ? (
        <Button
          type="button"
          variant="outline"
          disabled={busy === "skip"}
          onClick={() => void run("skip", () => onSkip(story.id))}
        >
          {busy === "skip" ? <Loader2Icon className="animate-spin" /> : null}
          Skip
        </Button>
      ) : null}
      {account?.handle ? (
        <Hint label={`Put this story on @${account.handle}'s Medium list`}>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label={`Put this story on @${account.handle}'s Medium list`}
            disabled={busy === "list"}
            onClick={() =>
              void run("list", async () => {
                await addToMediumList({ accountId: account.id, findId: story.id })
                toast.success("On its way to the account's Medium list. It shows on the Articles tab.")
              })
            }
          >
            {busy === "list" ? <Loader2Icon className="animate-spin" /> : <BookmarkPlusIcon />}
          </Button>
        </Hint>
      ) : null}
      <Hint label="Open this story on Medium">
        <Button type="button" size="icon" variant="ghost" asChild>
          <a href={story.url} target="_blank" rel="noreferrer" aria-label="Open this story on Medium">
            <ExternalLinkIcon />
          </a>
        </Button>
      </Hint>
    </>
  )

  return (
    <PanelFrame header={header} onBack={onBack}>
      <ScrollArea className="min-h-0 flex-1">
        <div className="grid gap-4 p-4">
          <div className="grid gap-2">
            <h3 className="text-xl leading-snug font-semibold">{story.title}</h3>
            {/* Medium often makes the subtitle from the story's first line; then it is said once, in the story. */}
            {story.subtitle && !story.text.startsWith(story.subtitle.replace(/…$/, "")) ? (
              <p className="text-sm text-muted-foreground">{story.subtitle}</p>
            ) : null}
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {story.writer.handle ? <span>@{story.writer.handle}</span> : null}
              <span>{followersText(story.writer.followers)}</span>
              {story.postedAt ? <span>{postedDateText(story.postedAt)}</span> : null}
              <span className="inline-flex items-center gap-0.5">
                <HandIcon className="size-3" aria-hidden="true" />
                {story.claps}
              </span>
              <span>
                {story.responseCount} {story.responseCount === 1 ? "response" : "responses"}
              </span>
              {story.membersOnly ? (
                <span className="inline-flex items-center gap-0.5">
                  <LockIcon className="size-3" aria-hidden="true" />
                  Members-only
                </span>
              ) : null}
            </p>
          </div>

          {story.text ? (
            <div className="grid gap-3 text-sm leading-relaxed">
              {story.text.split(/\n\n+/).map((paragraph, index) => (
                <p key={index} className="whitespace-pre-wrap">
                  {paragraph}
                </p>
              ))}
              {story.membersOnly ? (
                <p className="text-xs text-muted-foreground">A members-only story: a stranger reads only this much of it.</p>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Medium gave none of this story&apos;s words.</p>
          )}

          <TopResponses
            find={story}
            reading={story.reading || busy === "read"}
            onRead={() =>
              void run("read", async () => {
                await readMediumStoryNow(story.id)
                await onChanged()
              })
            }
          />

          {story.past.length ? (
            <div className="grid gap-2 border-t pt-4">
              <p className="text-xs font-medium text-muted-foreground">What you said before on stories like this</p>
              {story.past.map((past) => (
                <div key={past.id} className="grid gap-1 rounded-lg bg-muted/50 p-3">
                  <p className="truncate text-xs text-muted-foreground">On &quot;{past.storyTitle}&quot;{past.claps !== null ? ` · ${past.claps} claps` : ""}</p>
                  <p className="text-sm whitespace-pre-wrap">{past.text}</p>
                </div>
              ))}
            </div>
          ) : null}

          {story.sentHere.length ? (
            <div className="grid gap-2 border-t pt-4">
              <p className="text-xs font-medium text-muted-foreground">Sent on this story</p>
              {story.sentHere.map((row) => (
                <div key={row.id} className="grid gap-1 rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">
                    {row.account ? `@${row.account.handle}` : "An account"} ·{" "}
                    {row.status === "posted" ? "On Medium" : row.status === "waiting" ? "Waiting to go" : "Did not go out"}
                  </p>
                  <p className="text-sm whitespace-pre-wrap">{row.text}</p>
                  {row.status === "failed" ? <p className="text-xs text-destructive">{row.lastError}</p> : null}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </ScrollArea>

      <div className="grid grid-cols-1 gap-3 border-t p-4">
        {story.drafts.length ? (
          <div className="grid grid-cols-2 gap-2">
            {story.drafts.filter((draft) => !draft.rewrite).slice(0, 2).map((draft) => (
              <Hint key={draft.id} label={draft.text}>
                <button
                  type="button"
                  onClick={() => {
                    setText(draft.text)
                    setLine(draft.line)
                    setFromDraft(draft.id)
                    setHelpOnly(draft.helpOnly)
                  }}
                  className={cn(
                    "h-16 overflow-hidden rounded-lg border bg-background p-2 text-left text-xs leading-relaxed",
                    fromDraft === draft.id ? "border-foreground bg-muted" : null
                  )}
                >
                  {draft.text}
                </button>
              </Hint>
            ))}
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="medium-help-only" className="text-sm font-normal">
            Help only, never name the product
          </Label>
          <Switch id="medium-help-only" checked={helpOnly} onCheckedChange={setHelpOnly} />
        </div>

        {line ? (
          <div className="flex items-start gap-2 rounded-lg bg-muted/50 p-2 text-xs">
            <span className="min-w-0 flex-1">
              <span className="text-muted-foreground">Answers the line </span>&quot;{line}&quot;
            </span>
            <Hint label="Answer the story as a whole instead">
              <button type="button" aria-label="Answer the story as a whole instead" className="shrink-0 text-muted-foreground hover:text-foreground" onClick={() => setLine("")}>
                <XIcon className="size-3.5" />
              </button>
            </Hint>
          </div>
        ) : null}

        {text.trim() ? (
          <div className="flex flex-wrap items-center gap-1">
            {RESPONSE_REWRITES.map((how) => (
              <Button
                key={how}
                type="button"
                variant="ghost"
                size="sm"
                disabled={busy !== null}
                onClick={() =>
                  void run("rewrite", async () => {
                    const rewritten = await rewriteMediumWords({ findId: story.id, text: text.trim(), how })
                    setText(rewritten.text)
                    setFromDraft(rewritten.id)
                    setVerdict(null)
                  })
                }
              >
                {RESPONSE_REWRITE_WORDS[how]}
              </Button>
            ))}
          </div>
        ) : null}

        {verdict && verdict.text === text.trim() ? (
          verdict.result.ok ? (
            <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <ShieldCheckIcon className="mt-px size-3.5 shrink-0" aria-hidden="true" />
              Breaks none of Medium&apos;s rules, as far as the AI can tell.
            </p>
          ) : (
            <div className="grid gap-1 text-xs text-amber-700 dark:text-amber-400">
              <p className="flex items-center gap-1.5 font-medium">
                <AlertTriangleIcon className="size-3.5" aria-hidden="true" />
                Medium&apos;s rules
              </p>
              <ul className="grid list-disc gap-0.5 pl-5">
                {verdict.result.problems.map((problem) => (
                  <li key={problem}>{problem}</li>
                ))}
              </ul>
            </div>
          )
        ) : null}

        {undo ? (
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="flex items-start gap-1.5">
              <ClockIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              Sending in {undoSeconds} {undoSeconds === 1 ? "second" : "seconds"}.
            </span>
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                void run("post", async () => {
                  await takeBackMediumResponse(undo.responseId)
                  setText(undo.text)
                  setUndo(null)
                  toast.success("Taken back. Nothing was sent.")
                  await onChanged()
                })
              }
            >
              <Undo2Icon />
              Undo
            </Button>
          </div>
        ) : null}

        {held ? (
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="flex items-start gap-1.5">
              <ClockIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {mediumWaitingText(held.runAfter, account?.handle ?? null)}
            </span>
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                void run("post", async () => {
                  await takeBackMediumResponse(held.responseId)
                  toast.success("Cancelled. Nothing was sent.")
                  await onChanged()
                })
              }
            >
              Cancel response
            </Button>
          </div>
        ) : null}

        {paceWarning ? (
          <p className="flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400">
            <AlertTriangleIcon className="mt-px size-3.5 shrink-0" aria-hidden="true" />
            <span>{paceWarning}</span>
          </p>
        ) : null}

        <div className="flex min-w-0 items-center gap-2">
          <Hint label={account ? mediumPaceLine(account.posting) : null}>
            <span className="shrink-0 text-xs text-muted-foreground">Respond as</span>
          </Hint>
          {accountPicker}
        </div>

        <div className="@container/box grid grid-cols-1 rounded-lg border bg-background focus-within:ring-2 focus-within:ring-ring/50">
          <Textarea
            id="medium-response-text"
            aria-label="What to respond"
            className="min-h-[calc(3lh+1rem)] resize-none border-0 bg-transparent shadow-none focus-visible:ring-0 dark:bg-transparent"
            value={text}
            aria-invalid={text.length > MAX_RESPONSE_CHARS || undefined}
            onChange={(event) => {
              setText(event.target.value)
              setVerdict(null)
              const source = story.drafts.find((draft) => draft.id === fromDraft)
              if (source && source.text !== event.target.value) setFromDraft(null)
            }}
            placeholder={story.drafts.length ? "Pick a draft above, or write your response" : "Write your response"}
          />
          <div className="flex items-center gap-1 p-1.5">
            <Hint label={account?.voice ? `Write with AI, in the voice ${account.voice.name}` : "Write with AI. No voice picked for this account, so drafts are plain"}>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label="Write with AI"
                disabled={busy !== null}
                onClick={() =>
                  void run("draft", async () => {
                    await draftMediumResponses({ findId: story.id, accountId: account?.id ?? null, helpOnly })
                    await onChanged()
                  })
                }
              >
                {busy === "draft" ? <Loader2Icon className="animate-spin" /> : <SparklesIcon />}
                <span className="hidden @[20rem]/box:inline">Write with AI</span>
              </Button>
            </Hint>
            {text.trim() ? (
              <Hint label="Check the words against Medium's rules">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label="Check"
                  disabled={busy !== null}
                  onClick={() =>
                    void run("check", async () => {
                      const words = text.trim()
                      setVerdict({ text: words, result: await checkMediumWords({ projectId, text: words }) })
                    })
                  }
                >
                  {busy === "check" ? <Loader2Icon className="animate-spin" /> : <ShieldCheckIcon />}
                  <span className="hidden @[24rem]/box:inline">Check</span>
                </Button>
              </Hint>
            ) : null}
            <span className={cn("flex-1 text-right text-xs tabular-nums", text.length > MAX_RESPONSE_CHARS ? "text-destructive" : "text-muted-foreground")}>
              {text.length}/{MAX_RESPONSE_CHARS}
            </span>
            <DisabledReason reason={postReason ?? "Sending now."} disabled={Boolean(postReason) || busy === "post"}>
              <Button
                type="button"
                size="sm"
                disabled={Boolean(postReason) || busy === "post"}
                onClick={() => {
                  const words = text.trim()
                  if (!words) {
                    showErrorToast("Write the response first, or press Write with AI.")
                    return
                  }
                  if (!account) return
                  void run("post", async () => {
                    const sent = await sendMediumResponse({ findId: story.id, accountId: account.id, text: words, line, helpOnly, draftId: fromDraft })
                    if (sent.undoUntil) {
                      setUndo({ responseId: sent.responseId, text: words, until: new Date(sent.undoUntil).getTime() })
                      setClock(Date.now())
                    } else if (sent.runAfter) {
                      toast.success(mediumWaitingText(new Date(sent.runAfter), account.handle))
                    }
                    setText("")
                    setLine("")
                    setFromDraft(null)
                    setVerdict(null)
                    await onChanged()
                  })
                }}
              >
                {busy === "post" ? <Loader2Icon className="animate-spin" /> : null}
                Post
              </Button>
            </DisabledReason>
          </div>
        </div>
      </div>
    </PanelFrame>
  )
}

/** The right column's frame: its header, with the way back on a narrow screen. */
function PanelFrame({
  title,
  header,
  onBack,
  children,
}: {
  title?: string
  header?: React.ReactNode
  onBack?: () => void
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <DashboardCardHeader className="gap-2">
        {onBack ? (
          <Button type="button" size="icon" variant="ghost" aria-label="Back to the list" onClick={onBack}>
            <ArrowLeftIcon />
          </Button>
        ) : null}
        {header ?? <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{title}</span>}
      </DashboardCardHeader>
      {children}
    </div>
  )
}

/** The story's top responses, or a press to read them (part 19). */
function TopResponses({ find, reading, onRead }: { find: MediumFindDetail; reading: boolean; onRead: () => void }) {
  if (!find.responses && reading) {
    return (
      <p className="flex items-center gap-2 border-t pt-4 text-sm text-muted-foreground">
        <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />
        Reading the responses…
      </p>
    )
  }
  if (!find.responses) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4">
        <p className="text-sm text-muted-foreground">
          {find.responseCount ? `${find.responseCount} ${find.responseCount === 1 ? "response" : "responses"}, not read yet` : "No responses yet, as of the last search"}
        </p>
        <Button type="button" variant="outline" onClick={onRead}>
          Read the responses
        </Button>
      </div>
    )
  }
  if (!find.responses.length) {
    return (
      <p className="border-t pt-4 text-sm text-muted-foreground">
        {find.responseCount ? "Medium counts responses here, and none of them could be read." : "Nobody has responded. Yours would be the first."}
      </p>
    )
  }
  return (
    <div className="grid gap-2 border-t pt-4">
      <p className="text-xs font-medium text-muted-foreground">Top responses. The AI adds something they do not say.</p>
      {find.responses.map((response) => (
        <div key={response.id} className="grid gap-1 rounded-lg bg-muted/50 p-3">
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{response.writer ? `@${response.writer}` : "someone"}</span>
            <span className="inline-flex items-center gap-0.5">
              <HandIcon className="size-3" aria-hidden="true" />
              {response.claps}
            </span>
          </p>
          <p className="text-sm whitespace-pre-wrap">{response.text}</p>
        </div>
      ))}
    </div>
  )
}
