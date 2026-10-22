import * as React from "react"
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"
import {
  AlertTriangleIcon,
  ArrowLeftIcon,
  BookmarkPlusIcon,
  ClockIcon,
  ExternalLinkIcon,
  FileTextIcon,
  ImageIcon,
  LightbulbIcon,
  Loader2Icon,
  PlusIcon,
  RefreshCwIcon,
  SettingsIcon,
  ShieldCheckIcon,
  SparklesIcon,
  Trash2Icon,
} from "lucide-react"
import { toast } from "sonner"

import { DashboardCardHeader } from "@/components/shared/dashboard-card-header"
import { DashboardToolbarButton } from "@/components/shared/dashboard-toolbar"
import { ImageUpload } from "@/components/shared/image-upload"
import { Hint } from "@/components/social/hint"
import { Button } from "@/components/ui/button"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DisabledReason } from "@/components/ui/disabled-reason"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import {
  addToMediumList,
  askMediumArticleIdeas,
  cancelMediumArticle,
  changeOnMedium,
  checkMediumNow,
  checkMediumWords,
  deleteMediumArticleDraft,
  getMediumErrorMessage,
  loadRedditSources,
  makeMediumArticleCover,
  outlineMediumArticle,
  publishMediumArticle,
  saveMediumArticleFields,
  startMediumArticle,
  writeMediumArticleNow,
  type ListItemView,
  type MediumArticleView,
  type MediumModuleView,
  type RulesVerdict,
} from "@/lib/api/social/medium"
import {
  ARTICLE_WORDS,
  MAX_ARTICLE_TAGS,
  MEDIUM_ARTICLE_STATUS_WORDS,
  wordCount,
} from "@/lib/social/medium/options"
import { mediumPostingRefusal, mediumWaitingText } from "@/lib/social/medium/wording"
import { postedDateText } from "@/lib/social/wording"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

import { IncomingAnswer } from "./medium-responses"

type Account = MediumModuleView["accounts"][number]

const chartConfig: ChartConfig = {
  views: { label: "Views", color: "var(--foreground)" },
  reads: { label: "Reads", color: "var(--chart-3)" },
  claps: { label: "Claps", color: "var(--destructive)" },
}

const dayFormat = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" })

/** A figure or "?" while it has never been read. */
function figure(value: number | null): string {
  return value === null ? "?" : value.toLocaleString("en-US")
}

/**
 * The Articles tab's list (parts 26, 31, 34 and 40): every article of the
 * project with its numbers, New article, the AI's article ideas from what
 * people keep asking, and under them the stories on the accounts' public
 * Medium lists, with how many of each list are the account's own.
 */
export function MediumArticlesList({
  projectId,
  accounts,
  articles,
  list,
  loading,
  error,
  selectedId,
  onSelect,
  onRetry,
  onChanged,
}: {
  projectId: string
  accounts: Account[]
  articles: MediumArticleView[]
  list: ListItemView[]
  loading: boolean
  error: string | null
  selectedId: string | null
  onSelect: (articleId: string) => void
  onRetry: () => void
  onChanged: () => Promise<void>
}) {
  const [ideas, setIdeas] = React.useState<Array<{ title: string; answers: string }> | null>(null)
  const [asking, setAsking] = React.useState(false)
  const [checking, setChecking] = React.useState(false)
  const published = articles.filter((article) => article.status === "published" && !article.deletedAt).map((article) => article.id)

  async function start(input: { about: string; accountId: string | null; redditCommentId?: string }) {
    try {
      const { id } = await startMediumArticle({ projectId, ...input })
      await onChanged()
      onSelect(id)
    } catch (failure) {
      showErrorToast(getMediumErrorMessage(failure))
    }
  }

  const ownCounts = React.useMemo(() => {
    const byAccount = new Map<string, { handle: string; own: number; all: number }>()
    for (const item of list) {
      if (item.status !== "added") continue
      const entry = byAccount.get(item.account.id) ?? { handle: item.account.handle, own: 0, all: 0 }
      entry.all += 1
      if (item.own) entry.own += 1
      byAccount.set(item.account.id, entry)
    }
    return [...byAccount.values()]
  }, [list])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b px-3">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={asking}
          onClick={async () => {
            setAsking(true)
            try {
              setIdeas(await askMediumArticleIdeas(projectId))
            } catch (failure) {
              showErrorToast(getMediumErrorMessage(failure))
            } finally {
              setAsking(false)
            }
          }}
        >
          {asking ? <Loader2Icon className="animate-spin" /> : <LightbulbIcon />}
          Article ideas
        </Button>
        {published.length ? (
          <Hint label="Read every published article's numbers again now">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={checking}
              onClick={async () => {
                setChecking(true)
                try {
                  const { queued } = await checkMediumNow({ articleIds: published.slice(0, 50) })
                  toast.success(queued ? "Reading the numbers again." : "Every article is being read already.")
                  await onChanged()
                } catch (failure) {
                  showErrorToast(getMediumErrorMessage(failure))
                } finally {
                  setChecking(false)
                }
              }}
            >
              {checking ? <Loader2Icon className="animate-spin" /> : <RefreshCwIcon />}
              Check
            </Button>
          </Hint>
        ) : null}
        <span className="flex-1" />
        <NewArticleButton projectId={projectId} accounts={accounts} onCreate={start} />
      </div>
      <ScrollArea className="min-h-0 flex-1">
        {error ? (
          <div className="grid justify-items-start gap-3 p-4">
            <p className="text-sm text-muted-foreground">The articles could not be read. {error}</p>
            <Button type="button" variant="outline" onClick={onRetry}>
              <RefreshCwIcon />
              Try again
            </Button>
          </div>
        ) : loading && !articles.length ? (
          <p className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
            <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />
            Reading the articles
          </p>
        ) : (
          <div className="grid gap-4 py-1.5">
            {articles.length ? (
              <div>
                {articles.map((article) => (
                  <button
                    key={article.id}
                    type="button"
                    onClick={() => onSelect(article.id)}
                    aria-current={article.id === selectedId || undefined}
                    className={cn(
                      "flex w-full min-w-0 items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                      article.id === selectedId && "bg-muted shadow-[inset_2px_0_0_var(--foreground)] hover:bg-muted"
                    )}
                  >
                    <FileTextIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span className="grid min-w-0 flex-1 gap-0.5">
                      <span className="truncate text-sm">{article.title || "Untitled article"}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {[
                          article.deletedAt ? "Deleted" : MEDIUM_ARTICLE_STATUS_WORDS[article.status],
                          article.account ? `@${article.account.handle}` : "No account picked",
                          article.publishedAt ? postedDateText(article.publishedAt) : `${wordCount(article.body)} words`,
                          article.toAnswer ? `${article.toAnswer} to answer` : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                    {article.status === "published" ? (
                      <span className="hidden shrink-0 text-xs text-muted-foreground tabular-nums sm:inline">
                        {figure(article.views)} views · {figure(article.reads)} reads · {figure(article.claps)} claps
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
            ) : (
              <p className="px-4 pt-3 text-sm text-muted-foreground">
                No articles yet. Press New article, or Article ideas for topics people keep asking about.
              </p>
            )}
            <div className="grid gap-2 border-t px-3 pt-3">
              <p className="text-xs font-medium text-muted-foreground">On the accounts&apos; Medium lists</p>
              {ownCounts.length ? (
                <p className="text-xs text-muted-foreground">
                  {ownCounts.map((entry) => `@${entry.handle}: ${entry.own} of ${entry.all} are its own`).join(" · ")}
                  {ownCounts.some((entry) => entry.all >= 3 && entry.own * 2 > entry.all) ? " · More than half its own reads as an advert." : ""}
                </p>
              ) : null}
              {list.length ? (
                list.map((item) => (
                  <div key={item.id} className="flex min-w-0 items-center gap-2 text-sm">
                    <a href={item.storyUrl} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate hover:underline">
                      {item.title}
                    </a>
                    <span className={cn("shrink-0 text-xs", item.status === "failed" ? "text-destructive" : "text-muted-foreground")}>
                      {item.status === "added" ? `@${item.account.handle}` : item.status === "waiting" ? "On its way" : "Did not go on"}
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">Nothing yet. Put a good story on a list from its panel, with the bookmark button.</p>
              )}
            </div>
          </div>
        )}
      </ScrollArea>
      <Dialog open={ideas !== null} onOpenChange={(open) => (open ? null : setIdeas(null))}>
        <DialogContent variant="admin">
          <DialogHeader>
            <DialogTitle>Article ideas</DialogTitle>
            <DialogDescription>From what people keep asking in this project&apos;s stories and posts.</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <div className="grid gap-3">
              {(ideas ?? []).map((idea) => (
                <div key={idea.title} className="flex min-w-0 items-start gap-2">
                  <span className="grid min-w-0 flex-1 gap-0.5">
                    <span className="text-sm">{idea.title}</span>
                    <span className="text-xs text-muted-foreground">Answers: {idea.answers}</span>
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setIdeas(null)
                      void start({ about: idea.title, accountId: null })
                    }}
                  >
                    <PlusIcon />
                    Start it
                  </Button>
                </div>
              ))}
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" onClick={() => setIdeas(null)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/**
 * New article as a dropdown, the way every dashboard's New button works
 * (Ui-standards): what it is about first, then who publishes it, then
 * whether it grows from a Reddit comment that did well (part 30), and
 * Create article at the bottom right.
 */
function NewArticleButton({
  projectId,
  accounts,
  onCreate,
}: {
  projectId: string
  accounts: Account[]
  onCreate: (input: { about: string; accountId: string | null; redditCommentId?: string }) => Promise<void>
}) {
  const [open, setOpen] = React.useState(false)
  const [about, setAbout] = React.useState("")
  const [accountId, setAccountId] = React.useState<string>("none")
  const [source, setSource] = React.useState<string>("none")
  const [sources, setSources] = React.useState<Array<{ id: string; text: string; upvotes: number | null; postTitle: string }> | null>(null)
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    if (!open || sources) return
    let alive = true
    loadRedditSources(projectId).then(
      (rows) => alive && setSources(rows),
      () => alive && setSources([])
    )
    return () => {
      alive = false
    }
  }, [open, projectId, sources])

  async function create(event?: React.FormEvent) {
    event?.preventDefault()
    const picked = sources?.find((row) => row.id === source)
    if (!about.trim() && !picked) {
      showErrorToast("Say what the article is about, or pick a Reddit comment to grow it from.")
      return
    }
    setBusy(true)
    try {
      await onCreate({
        about: about.trim() || picked?.postTitle || "",
        accountId: accountId === "none" ? null : accountId,
        ...(picked ? { redditCommentId: picked.id } : {}),
      })
      setOpen(false)
      setAbout("")
      setSource("none")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <DashboardToolbarButton type="button">
          <PlusIcon className="size-4" />
          New article
        </DashboardToolbarButton>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-3">
        <form className="grid gap-4" onSubmit={create}>
          <div className="grid gap-2">
            <FieldLabel htmlFor="medium-new-about">What it is about</FieldLabel>
            <Input id="medium-new-about" autoFocus value={about} placeholder="How small teams pick a task tool" onChange={(event) => setAbout(event.target.value)} />
          </div>
          <div className="grid gap-2">
            <FieldLabel htmlFor="medium-new-account">Publish as</FieldLabel>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger id="medium-new-account">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Pick later</SelectItem>
                {accounts.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.handle ? `@${account.handle}` : "Not signed in yet"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <FieldLabel htmlFor="medium-new-source" hint="A Reddit comment of yours that did well. The outline and the article grow from its words.">
              Grow it from
            </FieldLabel>
            <Select value={source} onValueChange={setSource}>
              <SelectTrigger id="medium-new-source">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nothing, start from scratch</SelectItem>
                {(sources ?? []).map((row) => (
                  <SelectItem key={row.id} value={row.id}>
                    {row.upvotes !== null ? `${row.upvotes} upvotes: ` : ""}
                    {row.postTitle.slice(0, 60)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end">
            <Button type="submit" disabled={busy}>
              {busy ? <Loader2Icon className="animate-spin" /> : null}
              Create article
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  )
}

/**
 * One article in the right column. A draft is written here: the outline
 * first, then the article, the cover, the tags and the publication, saved as
 * it is typed; then Publish. A published one shows its numbers week by week
 * (part 40), the responses under it with an answer box each, and Edit and
 * Delete on Medium.
 */
export function MediumArticlePanel({
  projectId,
  article,
  accounts,
  publications,
  onBack,
  onClose,
  onChanged,
}: {
  projectId: string
  article: MediumArticleView | null
  accounts: Account[]
  publications: MediumModuleView["publications"]
  onBack?: () => void
  onClose: () => void
  onChanged: () => Promise<void>
}) {
  if (!article) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <DashboardCardHeader className="gap-2">
          {onBack ? (
            <Button type="button" size="icon" variant="ghost" aria-label="Back to the list" onClick={onBack}>
              <ArrowLeftIcon />
            </Button>
          ) : null}
          <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">An article</span>
        </DashboardCardHeader>
        <p className="p-4 text-sm text-muted-foreground">Click an article to write it or to see how it is doing, or press New article.</p>
      </div>
    )
  }
  return article.status === "published" ? (
    // Keyed by the article, so an edit begun on one never carries over to another.
    <PublishedArticle key={article.id} projectId={projectId} article={article} accounts={accounts} onBack={onBack} onChanged={onChanged} />
  ) : (
    <ArticleDraft
      key={article.id}
      projectId={projectId}
      article={article}
      accounts={accounts}
      publications={publications}
      onBack={onBack}
      onClose={onClose}
      onChanged={onChanged}
    />
  )
}

type DraftFields = {
  accountId: string | null
  title: string
  subtitle: string
  body: string
  tags: string
  coverUrl: string
  publicationSlug: string
}

function ArticleDraft({
  projectId,
  article,
  accounts,
  publications,
  onBack,
  onClose,
  onChanged,
}: {
  projectId: string
  article: MediumArticleView
  accounts: Account[]
  publications: MediumModuleView["publications"]
  onBack?: () => void
  onClose: () => void
  onChanged: () => Promise<void>
}) {
  const [fields, setFields] = React.useState<DraftFields>(() => ({
    accountId: article.account?.id ?? null,
    title: article.title,
    subtitle: article.subtitle,
    body: article.body,
    tags: article.tags.join(", "),
    coverUrl: article.coverUrl,
    publicationSlug: article.publicationSlug,
  }))
  const [about, setAbout] = React.useState(article.title)
  const [outline, setOutline] = React.useState(article.outline)
  const [pickedTitle, setPickedTitle] = React.useState(article.outline?.titles[0] ?? "")
  const [headings, setHeadings] = React.useState((article.outline?.headings ?? []).join("\n"))
  const [busy, setBusy] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState<"saved" | "saving" | "not saved">("saved")
  const [verdict, setVerdict] = React.useState<{ body: string; result: RulesVerdict } | null>(null)
  const [confirmDelete, setConfirmDelete] = React.useState(false)
  const pending = React.useRef<Partial<DraftFields>>({})
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const waiting = article.status === "waiting"

  /**
   * Saves what changed since the last save. A refused save keeps the change
   * waiting for the next try and throws, so Publish and Make a cover stop
   * rather than going ahead with what was saved before.
   */
  const flush = React.useCallback(async () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    const change = pending.current
    pending.current = {}
    if (!Object.keys(change).length) return
    setSaving("saving")
    try {
      await saveMediumArticleFields({
        articleId: article.id,
        ...(change.accountId !== undefined ? { accountId: change.accountId } : {}),
        ...(change.title !== undefined ? { title: change.title } : {}),
        ...(change.subtitle !== undefined ? { subtitle: change.subtitle } : {}),
        ...(change.body !== undefined ? { body: change.body } : {}),
        ...(change.tags !== undefined ? { tags: change.tags.split(",").map((tag) => tag.trim()).filter(Boolean) } : {}),
        ...(change.coverUrl !== undefined ? { coverUrl: change.coverUrl } : {}),
        ...(change.publicationSlug !== undefined ? { publicationSlug: change.publicationSlug } : {}),
      })
      if (!Object.keys(pending.current).length) setSaving("saved")
    } catch (failure) {
      // Anything typed since stays on top of the change that failed.
      pending.current = { ...change, ...pending.current }
      setSaving("not saved")
      throw failure
    }
  }, [article.id])

  /** A save nobody waits on: after a pause in typing, on leaving a field, on leaving the draft. */
  const saveSoon = React.useCallback(() => {
    flush().catch((failure: unknown) => showErrorToast(getMediumErrorMessage(failure)))
  }, [flush])

  // A draft saves itself 700ms after the last change, the shell's settings
  // rule, and at once when it is left.
  React.useEffect(() => () => {
    if (timer.current) saveSoon()
  }, [saveSoon])

  function change(patch: Partial<DraftFields>, now = false) {
    setFields((current) => ({ ...current, ...patch }))
    pending.current = { ...pending.current, ...patch }
    setSaving("saving")
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(saveSoon, now ? 0 : 700)
  }

  async function run(which: string, action: () => Promise<void>) {
    setBusy(which)
    try {
      await action()
    } catch (failure) {
      showErrorToast(getMediumErrorMessage(failure))
    } finally {
      setBusy(null)
    }
  }

  const account = accounts.find((item) => item.id === fields.accountId) ?? null
  const refusal = account ? mediumPostingRefusal(account.posting, new Date(), account.posting.timeZone) : null
  const words = wordCount(fields.body)
  const tagList = fields.tags.split(",").map((tag) => tag.trim()).filter(Boolean)
  const publication = publications.find((item) => item.slug === fields.publicationSlug) ?? null
  const publishReason = waiting
    ? null
    : !account
      ? "Pick the account it goes out as."
      : !account.handle
        ? "That account is not signed in to Medium yet."
        : !fields.title.trim() || !fields.body.trim()
          ? "An article needs a title and its words."
          : tagList.length > MAX_ARTICLE_TAGS
            ? `Medium takes ${MAX_ARTICLE_TAGS} tags at most.`
            : publication && account && !publication.writers.includes(account.id)
              ? `Medium has not said @${account.handle} writes for ${publication.name || publication.slug}. Check it on the Publications tab.`
              : refusal

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <DashboardCardHeader className="gap-2">
        {onBack ? (
          <Button type="button" size="icon" variant="ghost" aria-label="Back to the list" onClick={onBack}>
            <ArrowLeftIcon />
          </Button>
        ) : null}
        <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
          {MEDIUM_ARTICLE_STATUS_WORDS[article.status]} · <span aria-live="polite">{saving === "saving" ? "Saving…" : saving === "saved" ? "Saved" : "Not saved"}</span>
        </span>
        {!waiting ? (
          <Hint label="Delete this draft">
            <Button type="button" size="icon" variant="ghost" aria-label="Delete this draft" onClick={() => setConfirmDelete(true)}>
              <Trash2Icon />
            </Button>
          </Hint>
        ) : null}
      </DashboardCardHeader>
      <ScrollArea className="min-h-0 flex-1">
        <div className="grid gap-6 p-4">
          {article.status === "failed" ? (
            <p className="flex items-start gap-1.5 text-sm text-destructive">
              <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>
                {article.lastError}
                {article.mayHaveLanded ? " Look on Medium before publishing again." : ""}
              </span>
            </p>
          ) : null}

          <section className="grid gap-4" aria-label="Outline">
            <div className="grid gap-2">
              <FieldLabel htmlFor="medium-article-about" hint="The AI offers three titles and the sections first, so the angle is picked before 1,200 words get written.">
                What it is about
              </FieldLabel>
              <Textarea id="medium-article-about" value={about} disabled={waiting} onChange={(event) => setAbout(event.target.value)} />
              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy !== null || waiting}
                  onClick={() =>
                    void run("outline", async () => {
                      const next = await outlineMediumArticle(article.id, about)
                      setOutline(next)
                      setPickedTitle(next.titles[0] ?? "")
                      setHeadings(next.headings.join("\n"))
                    })
                  }
                >
                  {busy === "outline" ? <Loader2Icon className="animate-spin" /> : <SparklesIcon />}
                  {outline ? "New outline" : "Outline"}
                </Button>
              </div>
            </div>
            {outline ? (
              <div className="grid gap-4 rounded-lg border p-3">
                <div className="grid gap-2">
                  <p className="text-xs font-medium text-muted-foreground">Pick a title</p>
                  {outline.titles.map((title) => (
                    <button
                      key={title}
                      type="button"
                      aria-pressed={pickedTitle === title}
                      onClick={() => setPickedTitle(title)}
                      className={cn(
                        "rounded-lg border bg-background p-2 text-left text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                        pickedTitle === title ? "border-foreground bg-muted" : "hover:bg-muted/50"
                      )}
                    >
                      {title}
                    </button>
                  ))}
                </div>
                <div className="grid gap-2">
                  <FieldLabel htmlFor="medium-outline-headings">Sections, one per line</FieldLabel>
                  <Textarea id="medium-outline-headings" value={headings} onChange={(event) => setHeadings(event.target.value)} />
                </div>
                <div className="flex justify-end">
                  <Button
                    type="button"
                    disabled={busy !== null || waiting}
                    onClick={() =>
                      void run("write", async () => {
                        if (!pickedTitle) throw new Error("Pick a title first.")
                        const written = await writeMediumArticleNow(article.id, {
                          title: pickedTitle,
                          headings: headings.split("\n").map((line) => line.trim()).filter(Boolean),
                          about,
                        })
                        setFields((current) => ({ ...current, title: written.title, subtitle: written.subtitle, body: written.body, tags: written.tags.join(", ") }))
                        await onChanged()
                        toast.success(`Written: ${wordCount(written.body)} words. Read it through and change what you like.`)
                      })
                    }
                  >
                    {busy === "write" ? <Loader2Icon className="animate-spin" /> : <SparklesIcon />}
                    Write the article
                  </Button>
                </div>
              </div>
            ) : null}
          </section>

          <section className="grid gap-4" aria-label="The article">
            <div className="grid gap-2">
              <FieldLabel htmlFor="medium-article-account">Publish as</FieldLabel>
              <Select value={fields.accountId ?? "none"} disabled={waiting} onValueChange={(value) => change({ accountId: value === "none" ? null : value }, true)}>
                <SelectTrigger id="medium-article-account">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Pick an account</SelectItem>
                  {accounts.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.handle ? `@${item.handle}` : "Not signed in yet"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <FieldLabel htmlFor="medium-article-title">Title</FieldLabel>
              <Input id="medium-article-title" value={fields.title} disabled={waiting} onChange={(event) => change({ title: event.target.value })} onBlur={saveSoon} />
            </div>
            <div className="grid gap-2">
              <FieldLabel htmlFor="medium-article-subtitle">Subtitle</FieldLabel>
              <Input id="medium-article-subtitle" value={fields.subtitle} disabled={waiting} onChange={(event) => change({ subtitle: event.target.value })} onBlur={saveSoon} />
            </div>
            <div className="grid gap-2">
              <ImageUpload
                label="Cover"
                value={fields.coverUrl}
                aspect="video"
                hint="Medium shows a story's first picture on its card. Pick one from the media library, or make one with AI."
                onChange={(value) => change({ coverUrl: value }, true)}
              />
              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy !== null || waiting}
                  onClick={() =>
                    void run("cover", async () => {
                      if (!fields.title.trim()) throw new Error("Give the article a title first, so the picture has something to show.")
                      await flush()
                      const { coverUrl } = await makeMediumArticleCover(article.id)
                      setFields((current) => ({ ...current, coverUrl }))
                      toast.success("Cover made and saved to the media library.")
                    })
                  }
                >
                  {busy === "cover" ? <Loader2Icon className="animate-spin" /> : <ImageIcon />}
                  {fields.coverUrl ? "Make another with AI" : "Make a cover with AI"}
                </Button>
              </div>
            </div>
            <div className="grid gap-2">
              <FieldLabel htmlFor="medium-article-body" hint="Plain text: a blank line between paragraphs, and ## in front of a section heading.">
                The article
              </FieldLabel>
              <Textarea id="medium-article-body" className="min-h-48" value={fields.body} disabled={waiting} onChange={(event) => change({ body: event.target.value })} onBlur={saveSoon} />
              <p className={cn("text-xs tabular-nums", words && (words < ARTICLE_WORDS.min || words > ARTICLE_WORDS.max) ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground")}>
                {words} words. Articles here are {ARTICLE_WORDS.min.toLocaleString("en-US")} to {ARTICLE_WORDS.max.toLocaleString("en-US")}.
              </p>
            </div>
            <div className="grid gap-2">
              <FieldLabel htmlFor="medium-article-tags" hint={`Up to ${MAX_ARTICLE_TAGS}, separated by commas.`}>
                Tags
              </FieldLabel>
              <Input
                id="medium-article-tags"
                value={fields.tags}
                disabled={waiting}
                aria-invalid={tagList.length > MAX_ARTICLE_TAGS || undefined}
                placeholder="productivity, project management"
                onChange={(event) => change({ tags: event.target.value })}
                onBlur={saveSoon}
              />
            </div>
            <div className="grid gap-2">
              <FieldLabel htmlFor="medium-article-publication" hint="Only publications on the Publications tab are offered, and Medium has to say the account writes for one before it goes in.">
                Publication
              </FieldLabel>
              <Select value={fields.publicationSlug || "own"} disabled={waiting} onValueChange={(value) => change({ publicationSlug: value === "own" ? "" : value }, true)}>
                <SelectTrigger id="medium-article-publication">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="own">The account&apos;s own page</SelectItem>
                  {publications.map((item) => (
                    <SelectItem key={item.slug} value={item.slug}>
                      {item.name || item.slug}
                      {fields.accountId && item.writers.includes(fields.accountId) ? "" : " (account not a writer)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </section>

          {verdict && verdict.body === fields.body ? (
            verdict.result.ok ? (
              <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <ShieldCheckIcon className="mt-px size-3.5 shrink-0" aria-hidden="true" />
                Breaks none of Medium&apos;s rules{publication ? " or the publication's" : ""}, as far as the AI can tell.
              </p>
            ) : (
              <ul className="grid list-disc gap-0.5 pl-5 text-xs text-amber-700 dark:text-amber-400">
                {verdict.result.problems.map((problem) => (
                  <li key={problem}>{problem}</li>
                ))}
              </ul>
            )
          ) : null}
        </div>
      </ScrollArea>
      <div className="flex flex-wrap items-center gap-2 border-t p-4">
        {waiting ? (
          <>
            <span className="flex min-w-0 flex-1 items-start gap-1.5 text-sm">
              <ClockIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              Waiting to publish{account ? ` as @${account.handle}` : ""}.
            </span>
            <Button
              type="button"
              variant="outline"
              disabled={busy !== null}
              onClick={() =>
                void run("cancel", async () => {
                  await cancelMediumArticle(article.id)
                  toast.success("Taken back. It is a draft again.")
                  await onChanged()
                })
              }
            >
              Take it back
            </Button>
          </>
        ) : (
          <>
            <Button
              type="button"
              variant="ghost"
              disabled={busy !== null}
              onClick={() =>
                void run("check", async () => {
                  if (!fields.body.trim()) throw new Error("Write the article first, then check it.")
                  setVerdict({ body: fields.body, result: await checkMediumWords({ projectId, text: fields.body, publicationSlug: fields.publicationSlug || undefined }) })
                })
              }
            >
              {busy === "check" ? <Loader2Icon className="animate-spin" /> : <ShieldCheckIcon />}
              Check
            </Button>
            <span className="flex-1" />
            <DisabledReason reason={publishReason ?? "Publishing now."} disabled={Boolean(publishReason) || busy === "publish"}>
              <Button
                type="button"
                disabled={Boolean(publishReason) || busy === "publish"}
                onClick={() =>
                  void run("publish", async () => {
                    await flush()
                    const queued = await publishMediumArticle(article.id)
                    toast.success(queued.runAfter && account ? mediumWaitingText(new Date(queued.runAfter), account.handle) : "Publishing on Medium. It shows as Published once it is live.")
                    await onChanged()
                  })
                }
              >
                {busy === "publish" ? <Loader2Icon className="animate-spin" /> : null}
                Publish
              </Button>
            </DisabledReason>
          </>
        )}
      </div>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this draft?"
        description="It never went to Medium, so it is only deleted here."
        confirmLabel="Delete draft"
        loading={busy === "delete"}
        onConfirm={() =>
          void run("delete", async () => {
            await deleteMediumArticleDraft(article.id)
            setConfirmDelete(false)
            onClose()
            await onChanged()
          })
        }
      />
    </div>
  )
}

function PublishedArticle({
  projectId,
  article,
  accounts,
  onBack,
  onChanged,
}: {
  projectId: string
  article: MediumArticleView
  accounts: Account[]
  onBack?: () => void
  onChanged: () => Promise<void>
}) {
  const [editing, setEditing] = React.useState(false)
  const [body, setBody] = React.useState(article.body)
  const [confirmDelete, setConfirmDelete] = React.useState(false)
  const [busy, setBusy] = React.useState<string | null>(null)
  const account = accounts.find((item) => item.id === article.account?.id) ?? null
  const data = article.readings.map((reading) => ({ at: new Date(`${reading.readOn}T12:00:00Z`).getTime(), views: reading.views, reads: reading.reads, claps: reading.claps }))

  async function run(which: string, action: () => Promise<void>) {
    setBusy(which)
    try {
      await action()
      await onChanged()
    } catch (failure) {
      showErrorToast(getMediumErrorMessage(failure))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <DashboardCardHeader className="gap-2">
        {onBack ? (
          <Button type="button" size="icon" variant="ghost" aria-label="Back to the list" onClick={onBack}>
            <ArrowLeftIcon />
          </Button>
        ) : null}
        <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{article.deletedAt ? "Deleted" : "Published"}{article.account ? ` · @${article.account.handle}` : ""}</span>
        {!article.deletedAt ? (
          <>
            {account ? (
              <Hint label={`Put it on @${account.handle}'s Medium list`}>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label={`Put it on @${account.handle}'s Medium list`}
                  disabled={busy !== null}
                  onClick={() => void run("list", async () => {
                    await addToMediumList({ accountId: account.id, articleId: article.id })
                    toast.success("On its way to the account's Medium list.")
                  })}
                >
                  <BookmarkPlusIcon />
                </Button>
              </Hint>
            ) : null}
            <Hint label="Change its words on Medium">
              <Button type="button" size="icon" variant="ghost" aria-label="Edit on Medium" onClick={() => setEditing((open) => !open)}>
                <SettingsIcon />
              </Button>
            </Hint>
            <Hint label="Delete it from Medium">
              <Button type="button" size="icon" variant="ghost" aria-label="Delete from Medium" onClick={() => setConfirmDelete(true)}>
                <Trash2Icon />
              </Button>
            </Hint>
          </>
        ) : null}
        {article.url ? (
          <Hint label="Open it on Medium">
            <Button type="button" size="icon" variant="ghost" asChild>
              <a href={article.url} target="_blank" rel="noreferrer" aria-label="Open it on Medium">
                <ExternalLinkIcon />
              </a>
            </Button>
          </Hint>
        ) : null}
      </DashboardCardHeader>
      <ScrollArea className="min-h-0 flex-1">
        <div className="grid gap-4 p-4">
          <div className="grid gap-1">
            <h3 className="text-xl leading-snug font-semibold">{article.title}</h3>
            {article.subtitle ? <p className="text-sm text-muted-foreground">{article.subtitle}</p> : null}
          </div>
          <dl className="grid grid-cols-4 gap-2 text-center">
            {(
              [
                ["Views", article.views],
                ["Reads", article.reads],
                ["Claps", article.claps],
                ["Responses", article.responses],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="rounded-lg border p-2">
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="text-lg font-semibold tabular-nums">{figure(value)}</dd>
              </div>
            ))}
          </dl>
          <p className="text-xs text-muted-foreground">
            {article.numbersReadAt ? `Read ${postedDateText(article.numbersReadAt).toLowerCase()}. ` : "Not read yet. "}
            Views and reads are only shown to the writer, so they come from the account&apos;s own browser.
          </p>
          {data.length > 1 ? (
            <div className="grid gap-2">
              <p className="text-xs font-medium text-muted-foreground">Week by week</p>
              <div className="h-[200px] w-full min-w-0">
                <ChartContainer config={chartConfig} className="h-full w-full">
                  <LineChart data={data} margin={{ top: 8, right: 0, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="0" vertical={false} />
                    <XAxis
                      dataKey="at"
                      type="number"
                      scale="time"
                      domain={["dataMin", "dataMax"]}
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 10 }}
                      dy={6}
                      tickFormatter={(value: number) => dayFormat.format(new Date(value))}
                    />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, dx: -5 }} width={36} />
                    <ChartTooltip
                      content={
                        <ChartTooltipContent
                          labelFormatter={(_, payload) => {
                            const at = payload?.[0]?.payload?.at
                            return typeof at === "number" ? dayFormat.format(new Date(at)) : ""
                          }}
                        />
                      }
                    />
                    {(["views", "reads", "claps"] as const).map((key) => (
                      <Line key={key} dataKey={key} type="monotone" isAnimationActive={false} stroke={`var(--color-${key})`} strokeWidth={2} dot={false} connectNulls />
                    ))}
                  </LineChart>
                </ChartContainer>
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">The chart draws once the article has been read on two different days.</p>
          )}

          {editing ? (
            <div className="grid gap-2">
              <Textarea aria-label="The new words" className="min-h-48" value={body} onChange={(event) => setBody(event.target.value)} />
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  disabled={busy !== null}
                  onClick={() =>
                    void run("edit", async () => {
                      await changeOnMedium({ articleId: article.id, action: "edit", text: body, title: article.title })
                      setEditing(false)
                      toast.success("The new words are on their way to Medium.")
                    })
                  }
                >
                  {busy === "edit" ? <Loader2Icon className="animate-spin" /> : null}
                  Save changes
                </Button>
              </div>
            </div>
          ) : null}

          {article.incoming === null ? (
            <p className="border-t pt-4 text-sm text-muted-foreground">The responses under it are read on the next check.</p>
          ) : article.incoming.length ? (
            <div className="grid gap-3 border-t pt-4">
              <p className="text-xs font-medium text-muted-foreground">Responses under it</p>
              {article.incoming.map((item) =>
                article.account ? (
                  <IncomingAnswer
                    key={item.id}
                    projectId={projectId}
                    accountId={article.account.id}
                    under={{ articleId: article.id }}
                    title={article.title}
                    mine={article.body.slice(0, 2_000)}
                    item={item}
                    onChanged={onChanged}
                  />
                ) : null
              )}
            </div>
          ) : (
            <p className="border-t pt-4 text-sm text-muted-foreground">Nobody has responded to it yet.</p>
          )}
        </div>
      </ScrollArea>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this article from Medium?"
        description="The account's browser deletes it on Medium. Promo keeps its record and its numbers."
        confirmLabel="Delete"
        loading={busy === "delete"}
        onConfirm={() =>
          void run("delete", async () => {
            await changeOnMedium({ articleId: article.id, action: "delete" })
            setConfirmDelete(false)
            toast.success("On its way to being deleted on Medium.")
          })
        }
      />
    </div>
  )
}
