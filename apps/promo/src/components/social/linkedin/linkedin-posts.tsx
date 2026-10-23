import * as React from "react"
import {
  AlertTriangleIcon,
  ClockIcon,
  ExternalLinkIcon,
  FileTextIcon,
  LightbulbIcon,
  Loader2Icon,
  NewspaperIcon,
  PlusIcon,
  RefreshCwIcon,
  Repeat2Icon,
  SettingsIcon,
  ShieldCheckIcon,
  SparklesIcon,
  Trash2Icon,
  Undo2Icon,
  XIcon,
} from "lucide-react"
import { toast } from "sonner"

import { DashboardToolbarButton } from "@/components/shared/dashboard-toolbar"
import { ImageUpload } from "@/components/shared/image-upload"
import { Hint } from "@/components/social/hint"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import {
  actOnLinkedinPost,
  askLinkedinPostIdeas,
  changeOnLinkedin,
  checkLinkedinNow,
  checkLinkedinWords,
  getLinkedinErrorMessage,
  saveLinkedinPostDraft,
  writeLinkedinNewsletterWords,
  writeLinkedinPostWords,
  type LinkedinGroupView,
  type LinkedinModuleView,
  type LinkedinPostIdea,
  type LinkedinPostSource,
  type LinkedinPostsTab,
  type LinkedinPostView,
  type LinkedinRulesVerdict,
} from "@/lib/api/social/linkedin"
import {
  LINKEDIN_POLL_CHOICE_CHARS,
  LINKEDIN_POLL_CHOICES,
  LINKEDIN_POLL_DAYS,
  LINKEDIN_POLL_QUESTION_CHARS,
  LINKEDIN_POST_CHARS,
  LINKEDIN_POST_KIND_WORDS,
  LINKEDIN_POST_STATUS_WORDS,
  NEWSLETTER_BODY_CHARS,
  NEWSLETTER_TITLE_CHARS,
  linkedinSlug,
  linksIn,
  type LinkedinPostKind,
  type LinkedinTag,
} from "@/lib/social/linkedin/options"
import { linkedinPostingRefusal, linkedinWaitingText } from "@/lib/social/linkedin/wording"
import { WORKDAY_WORDS, isWorkday } from "@/lib/social/linkedin/workday"
import { postedDateText } from "@/lib/social/wording"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

import { XListError, XPanelFrame } from "../x/x-panel-frame"
import { counted, figure, postsAtText, upWords } from "../x/x-words"
import { LinkedinIncomingAnswer } from "./linkedin-comments"
import { linkedinAccountName } from "./linkedin-words"

type Account = LinkedinModuleView["accounts"][number]

/** The Select values for "nothing", since an item cannot be empty. */
const NONE = "none"
const OWN_PAGE = "own"

const SAVE_DELAY_MS = 700

const POLL_DAY_WORDS: Record<number, string> = { 1: "1 day", 3: "3 days", 7: "1 week", 14: "2 weeks" }

const rowClass = (selected: boolean) =>
  cn(
    "flex w-full min-w-0 items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
    selected && "bg-muted shadow-[inset_2px_0_0_var(--foreground)] hover:bg-muted"
  )

/** "in/jane-doe", or what to say before a look has seen it signed in. */
/** Reactions and comments in one line, or one "not read yet" when neither has been read. */
function numbersLine(post: Pick<LinkedinPostView, "reactions" | "commentCount">): string {
  if (post.reactions === null && post.commentCount === null) return "Reactions and comments not read yet"
  return [counted(post.reactions, "reaction", "reactions"), counted(post.commentCount, "comment", "comments")].join(" · ")
}

/** A post's state in a few words, for its row. */
function stateWords(post: LinkedinPostView): string {
  if (post.deletedAt) return "Deleted"
  if (post.status === "waiting" && post.scheduledFor) return postsAtText(post.scheduledFor)
  return LINKEDIN_POST_STATUS_WORDS[post.status]
}

/** "Poll, 41 votes", once a poll's votes have been read. */
function votesWords(post: LinkedinPostView): string | null {
  if (!post.poll) return null
  if (!post.poll.votes) return "Poll"
  const total = post.poll.votes.reduce((sum, votes) => sum + votes, 0)
  return `Poll, ${total} ${total === 1 ? "vote" : "votes"}`
}

const KIND_ICONS: Record<LinkedinPostKind, typeof FileTextIcon> = { post: FileTextIcon, repost: Repeat2Icon, newsletter: NewspaperIcon }

/** An empty draft of a kind, as `saveLinkedinPostDraft` takes it. */
function emptyDraft(projectId: string, kind: LinkedinPostKind, accountId: string | null, source: string) {
  return {
    projectId,
    postRowId: null,
    accountId,
    kind,
    text: "",
    title: "",
    pictureUrl: "",
    videoUrl: "",
    poll: null,
    tags: [],
    repostFindId: null,
    groupId: "",
    asPageId: "",
    source,
    scheduledFor: null,
  }
}

/**
 * The Posts tab's list (parts 28 to 38): the project's own posts, reposts
 * and newsletter issues with their state, the hour one waits for, their
 * numbers and poll votes. New post makes a draft and opens it on the right;
 * Post ideas turns the questions people asked into drafts (part 35). A
 * repost is started from a post in To look at.
 */
export function LinkedinPostsList({
  projectId,
  accounts,
  data,
  loading,
  error,
  selectedId,
  onSelect,
  onRetry,
  onChanged,
}: {
  projectId: string
  accounts: Account[]
  data: LinkedinPostsTab | null
  loading: boolean
  error: string | null
  selectedId: string | null
  onSelect: (postRowId: string) => void
  onRetry: () => void
  onChanged: () => Promise<void>
}) {
  const [checking, setChecking] = React.useState(false)
  const posts = data?.posts ?? []
  const posted = posts.filter((post) => post.status === "posted" && !post.deletedAt).map((post) => post.id)

  async function created(id: string) {
    await onChanged()
    onSelect(id)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b px-3">
        {posted.length ? (
          <Hint label="Read the numbers of the 50 newest posted ones again now">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={checking}
              onClick={async () => {
                setChecking(true)
                try {
                  const { queued } = await checkLinkedinNow({ postRowIds: posted.slice(0, 50) })
                  toast.success(queued ? "Reading the numbers again." : "Every post is being read already.")
                  await onChanged()
                } catch (failure) {
                  showErrorToast(getLinkedinErrorMessage(failure))
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
        <PostIdeasButton projectId={projectId} onCreated={created} />
        <NewPostButton projectId={projectId} accounts={accounts} sources={data?.sources ?? []} onCreated={created} />
      </div>
      <ScrollArea className="min-h-0 flex-1">
        {error ? (
          <XListError what="posts" error={error} onRetry={onRetry} />
        ) : loading && !data ? (
          <p className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
            <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />
            Reading the posts
          </p>
        ) : posts.length ? (
          <div className="py-1.5">
            {posts.map((post) => {
              const Icon = KIND_ICONS[post.kind]
              return (
                <button key={post.id} type="button" onClick={() => onSelect(post.id)} aria-current={post.id === selectedId || undefined} className={rowClass(post.id === selectedId)}>
                  <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="grid min-w-0 flex-1 gap-0.5">
                    <span className="truncate text-sm">{post.title || post.text || "Nothing written yet"}</span>
                    <span className={cn("truncate text-xs", post.status === "failed" ? "text-destructive" : "text-muted-foreground")}>
                      {[
                        LINKEDIN_POST_KIND_WORDS[post.kind],
                        stateWords(post),
                        post.account ? linkedinAccountName(post.account.handle) : "No account picked",
                        votesWords(post),
                        post.postedAt ? postedDateText(new Date(post.postedAt)) : null,
                        post.toAnswer ? `${post.toAnswer} to answer` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                  {post.status === "posted" && !post.deletedAt ? (
                    <span className="hidden shrink-0 text-xs text-muted-foreground tabular-nums sm:inline">{numbersLine(post)}</span>
                  ) : null}
                </button>
              )
            })}
          </div>
        ) : (
          <p className="px-4 pt-3 text-sm text-muted-foreground">
            No posts of your own yet. Press New post to write one, or Post ideas to start from the questions people ask.
          </p>
        )}
      </ScrollArea>
    </div>
  )
}

/**
 * New post as a dropdown, the way every dashboard's New button works
 * (Ui-standards): what it is first, then what it is about, who posts it and
 * what it starts from, and Create at the bottom right. With something to go
 * on, the AI writes it straight away; the draft opens on the right either
 * way.
 */
function NewPostButton({
  projectId,
  accounts,
  sources,
  onCreated,
}: {
  projectId: string
  accounts: Account[]
  sources: LinkedinPostSource[]
  onCreated: (id: string) => Promise<void>
}) {
  const [open, setOpen] = React.useState(false)
  const [kind, setKind] = React.useState<"post" | "newsletter">("post")
  const [about, setAbout] = React.useState("")
  const [accountId, setAccountId] = React.useState(NONE)
  const [source, setSource] = React.useState(NONE)
  const [busy, setBusy] = React.useState(false)

  async function create(event?: React.FormEvent) {
    event?.preventDefault()
    setBusy(true)
    try {
      const account = accountId === NONE ? null : accountId
      const from = sources.find((item) => item.source === source) ?? null
      const draft = emptyDraft(projectId, kind, account, from?.source ?? "")
      const { postRowId } = await saveLinkedinPostDraft(draft)
      if (kind === "post" && (about.trim() || from)) {
        try {
          const written = await writeLinkedinPostWords({ projectId, accountId: account, about: about.trim(), source: from?.text ?? "", repostFindId: null, groupId: "", poll: false, asPage: "" })
          await saveLinkedinPostDraft({ ...draft, postRowId, text: written.text })
        } catch (failure) {
          showErrorToast(`The draft is made, but the AI did not write it. ${getLinkedinErrorMessage(failure)}`)
        }
      }
      setOpen(false)
      setAbout("")
      setAccountId(NONE)
      setSource(NONE)
      await onCreated(postRowId)
    } catch (failure) {
      showErrorToast(getLinkedinErrorMessage(failure))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <DashboardToolbarButton type="button">
          <PlusIcon className="size-4" />
          New post
        </DashboardToolbarButton>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-3">
        <form className="grid gap-4" onSubmit={create}>
          <div className="grid gap-2">
            <FieldLabel htmlFor="linkedin-new-kind" hint="A repost is started from a post in To look at, with Repost with thoughts.">
              What it is
            </FieldLabel>
            <Select value={kind} onValueChange={(value) => setKind(value === "newsletter" ? "newsletter" : "post")}>
              <SelectTrigger id="linkedin-new-kind">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="post">{LINKEDIN_POST_KIND_WORDS.post}</SelectItem>
                <SelectItem value="newsletter">{LINKEDIN_POST_KIND_WORDS.newsletter}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {kind === "post" ? (
            <div className="grid gap-2">
              <FieldLabel htmlFor="linkedin-new-about" hint="A line or two. Leave it empty to write the post yourself.">
                What it is about
              </FieldLabel>
              <Input id="linkedin-new-about" autoFocus value={about} placeholder="Three pricing mistakes in a first SaaS" onChange={(event) => setAbout(event.target.value)} />
            </div>
          ) : null}
          <div className="grid gap-2">
            <FieldLabel htmlFor="linkedin-new-account">Post as</FieldLabel>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger id="linkedin-new-account">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Pick later</SelectItem>
                {accounts.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {linkedinAccountName(account.handle)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <FieldLabel htmlFor="linkedin-new-source" hint="A published Medium article or a Reddit comment of yours that did well. The AI rewrites it for LinkedIn and never copies it.">
              Start from
            </FieldLabel>
            <Select value={source} onValueChange={setSource}>
              <SelectTrigger id="linkedin-new-source">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Nothing, start from scratch</SelectItem>
                {sources.map((item) => (
                  <SelectItem key={item.source} value={item.source}>
                    {item.label.slice(0, 60)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end">
            <Button type="submit" disabled={busy}>
              {busy ? <Loader2Icon className="animate-spin" /> : null}
              Create {kind === "newsletter" ? "issue" : "post"}
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  )
}

/**
 * Post ideas from the questions people asked in the project's LinkedIn
 * posts and their comments (part 35). The AI is asked when the dropdown
 * opens; picking one makes a draft that starts from that question, written
 * by the AI, and opens it.
 */
function PostIdeasButton({ projectId, onCreated }: { projectId: string; onCreated: (id: string) => Promise<void> }) {
  const [open, setOpen] = React.useState(false)
  const [ideas, setIdeas] = React.useState<LinkedinPostIdea[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState<string | null>(null)

  async function ask() {
    setIdeas(null)
    setError(null)
    try {
      setIdeas(await askLinkedinPostIdeas(projectId))
    } catch (failure) {
      setError(getLinkedinErrorMessage(failure))
    }
  }

  async function pick(idea: LinkedinPostIdea) {
    // One idea at a time, so two quick presses never make two drafts.
    if (busy) return
    setBusy(idea.findId + idea.question)
    try {
      const draft = emptyDraft(projectId, "post", null, `question:${idea.findId}`)
      const { postRowId } = await saveLinkedinPostDraft(draft)
      try {
        const written = await writeLinkedinPostWords({
          projectId,
          accountId: null,
          about: `${idea.question} ${idea.about}`,
          source: "",
          repostFindId: null,
          groupId: "",
          poll: false,
          asPage: "",
        })
        await saveLinkedinPostDraft({ ...draft, postRowId, text: written.text })
      } catch (failure) {
        showErrorToast(`The draft is made, but the AI did not write it. ${getLinkedinErrorMessage(failure)}`)
      }
      setOpen(false)
      await onCreated(postRowId)
    } catch (failure) {
      showErrorToast(getLinkedinErrorMessage(failure))
    } finally {
      setBusy(null)
    }
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next && !ideas) void ask()
      }}
    >
      <PopoverTrigger asChild>
        <Button type="button" size="sm" variant="ghost">
          <LightbulbIcon />
          Post ideas
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <div className="flex items-center gap-2 border-b px-3 py-2">
          <p className="flex-1 text-sm font-medium">Questions people ask</p>
          <Hint label="Ask the AI again">
            <Button type="button" size="icon" variant="ghost" aria-label="Ask the AI again" onClick={() => void ask()}>
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

/** The right column on the Posts tab: a draft to write, or a post that went out. */
export function LinkedinPostPanel({
  projectId,
  post,
  accounts,
  groups,
  sources,
  onBack,
  onClose,
  onChanged,
}: {
  projectId: string
  post: LinkedinPostView | null
  accounts: Account[]
  groups: LinkedinGroupView[]
  sources: LinkedinPostSource[]
  onBack?: () => void
  onClose: () => void
  onChanged: () => Promise<void>
}) {
  if (!post) {
    return (
      <XPanelFrame title="A post of your own" onBack={onBack}>
        <p className="p-4 text-sm text-muted-foreground">Click a post to write it or to see how it is doing, or press New post.</p>
      </XPanelFrame>
    )
  }
  // Keyed by the post, so words typed on one never carry over to another.
  return post.status === "posted" ? (
    <PostedPost key={post.id} projectId={projectId} post={post} onBack={onBack} onChanged={onChanged} />
  ) : (
    <PostComposer key={post.id} projectId={projectId} post={post} accounts={accounts} groups={groups} sources={sources} onBack={onBack} onClose={onClose} onChanged={onChanged} />
  )
}

type Fields = {
  accountId: string | null
  asPageId: string
  text: string
  title: string
  pictureUrl: string
  videoUrl: string
  pollOn: boolean
  question: string
  choices: string[]
  days: number
  tags: LinkedinTag[]
  groupId: string
  source: string
  /** A datetime-local value in the reader's own clock, or "". */
  scheduledFor: string
}

/** A date as a datetime-local box writes it, in the reader's own clock. */
function toLocalInput(value: Date | string | null): string {
  if (!value) return ""
  const date = new Date(value)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** The poll as it is saved: only with a question and two to four filled answers short enough for LinkedIn. */
function pollToSave(fields: Fields): { question: string; choices: string[]; days: number } | null {
  if (!fields.pollOn) return null
  const question = fields.question.trim()
  const choices = fields.choices.map((choice) => choice.trim()).filter(Boolean)
  if (!question || question.length > LINKEDIN_POLL_QUESTION_CHARS) return null
  if (choices.length < LINKEDIN_POLL_CHOICES.min || choices.length > LINKEDIN_POLL_CHOICES.max) return null
  if (choices.some((choice) => choice.length > LINKEDIN_POLL_CHOICE_CHARS)) return null
  return { question, choices, days: fields.days }
}

/** What the LinkedIn app on a phone cannot send, in the server's words, or null. */
function phoneRefusal(account: Account | null, kind: LinkedinPostKind, fields: Fields): string | null {
  if (!account?.onPhone) return null
  const what = [
    kind === "newsletter" ? "A newsletter issue" : null,
    kind === "repost" ? "A repost" : null,
    fields.pollOn ? "A poll" : null,
    fields.videoUrl ? "A video" : null,
    fields.tags.length ? "Tagging people" : null,
    fields.groupId ? "Posting into a group" : null,
    fields.asPageId ? "Posting as a company page" : null,
    kind === "post" && /https?:\/\//i.test(fields.text) ? "A post with a link" : null,
  ].filter(Boolean)
  if (!what.length) return null
  return `${linkedinAccountName(account.handle)} runs on a phone, and the LinkedIn app there posts words with a picture only. ${what.join(", ")} needs a LinkedIn account on a browser profile.`
}

/**
 * A post, repost or newsletter issue of the account's own that has not gone
 * to LinkedIn yet (parts 28 to 38): who posts it, as a company page for an
 * important account, the words with one of a picture, a video or a poll, the
 * people and pages it tags, a group, what it starts from and what it is about
 * for the AI, and an hour to post at inside the workday. A newsletter issue
 * is an outline first, then the issue written from it, with a cover. It
 * saves itself 700ms after the last change. Post goes through every check,
 * then ten seconds to take it back, or waits for its hour.
 */
function PostComposer({
  projectId,
  post,
  accounts,
  groups,
  sources,
  onBack,
  onClose,
  onChanged,
}: {
  projectId: string
  post: LinkedinPostView
  accounts: Account[]
  groups: LinkedinGroupView[]
  sources: LinkedinPostSource[]
  onBack?: () => void
  onClose: () => void
  onChanged: () => Promise<void>
}) {
  const kind = post.kind
  const [fields, setFields] = React.useState<Fields>(() => ({
    accountId: post.account?.id ?? null,
    asPageId: post.asPageId,
    // A link the server moved to the first comment is shown back in the words, where it was typed.
    text: post.firstComment && !post.text.includes(post.firstComment) ? `${post.text}\n${post.firstComment}`.trim() : post.text,
    title: post.title,
    pictureUrl: post.pictureUrl,
    videoUrl: post.videoUrl,
    pollOn: Boolean(post.poll),
    question: post.poll?.question ?? "",
    choices: post.poll?.choices.length ? post.poll.choices : ["", ""],
    days: post.poll?.days ?? 7,
    tags: post.tags,
    groupId: post.groupId,
    source: post.source,
    scheduledFor: toLocalInput(post.scheduledFor),
  }))
  const [about, setAbout] = React.useState("")
  // What goes with a post's words, picked before the file is: one of a picture, a video or a poll.
  const [media, setMedia] = React.useState<"none" | "picture" | "video" | "poll">(() =>
    post.poll ? "poll" : post.videoUrl ? "video" : post.pictureUrl ? "picture" : "none"
  )
  const [outline, setOutline] = React.useState("")
  const [tagName, setTagName] = React.useState("")
  const [tagAddress, setTagAddress] = React.useState("")
  const [busy, setBusy] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState<"saved" | "saving" | "not saved">("saved")
  const [verdict, setVerdict] = React.useState<{ words: string; result: LinkedinRulesVerdict } | null>(null)
  const [confirmDelete, setConfirmDelete] = React.useState(false)
  const [undoUntil, setUndoUntil] = React.useState<number | null>(null)
  const [clock, setClock] = React.useState(() => Date.now())
  const latest = React.useRef(fields)
  const dirty = React.useRef(false)
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  /** The save going out right now, so Post and the next save wait for it instead of racing it. */
  const running = React.useRef<Promise<void> | null>(null)

  const waiting = post.status === "waiting"
  const locked = waiting

  // The countdown on Take it back, ticking only while one shows.
  React.useEffect(() => {
    if (undoUntil === null) return
    const tick = setInterval(() => {
      const now = Date.now()
      setClock(now)
      if (now >= undoUntil) setUndoUntil(null)
    }, 250)
    return () => clearInterval(tick)
  }, [undoUntil])

  /**
   * Saves the draft as it stands. A save already going out is waited for
   * first, then whatever changed since goes too, so when this resolves the
   * server holds every change. A refused save stays waiting for the next try
   * and throws, so Post stops rather than going out with what was saved
   * before.
   */
  const flush = React.useCallback(async () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    while (running.current) {
      try {
        await running.current
      } catch {
        // Whoever started that save reports its failure. The change is still
        // marked unsaved, so it is tried once more below.
      }
    }
    if (!dirty.current) return
    dirty.current = false
    const next = latest.current
    setSaving("saving")
    const save = (async () => {
      try {
        await saveLinkedinPostDraft({
          projectId,
          postRowId: post.id,
          accountId: next.accountId,
          kind,
          text: next.text,
          title: next.title,
          pictureUrl: next.pictureUrl,
          videoUrl: next.videoUrl,
          poll: pollToSave(next),
          tags: next.tags,
          // A repost's shared post was named when its draft was made, from To look at.
          repostFindId: null,
          groupId: next.groupId,
          asPageId: next.asPageId,
          source: next.source,
          scheduledFor: next.scheduledFor ? new Date(next.scheduledFor).toISOString() : null,
        })
        if (!dirty.current) setSaving("saved")
      } catch (failure) {
        dirty.current = true
        setSaving("not saved")
        throw failure
      }
    })()
    running.current = save
    try {
      await save
    } finally {
      if (running.current === save) running.current = null
    }
  }, [kind, post.id, projectId])

  /** A save nobody waits on: after a pause in typing, on leaving a field, on leaving the draft. */
  const saveSoon = React.useCallback(() => {
    flush().catch((failure: unknown) => showErrorToast(getLinkedinErrorMessage(failure)))
  }, [flush])

  React.useEffect(
    () => () => {
      if (timer.current) saveSoon()
    },
    [saveSoon]
  )

  function change(patch: Partial<Fields>, now = false) {
    const next = { ...latest.current, ...patch }
    latest.current = next
    setFields(next)
    setVerdict(null)
    dirty.current = true
    setSaving("saving")
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(saveSoon, now ? 0 : SAVE_DELAY_MS)
  }

  async function run(which: string, action: () => Promise<void>) {
    setBusy(which)
    try {
      await action()
    } catch (failure) {
      showErrorToast(getLinkedinErrorMessage(failure))
    } finally {
      setBusy(null)
    }
  }

  const account = accounts.find((item) => item.id === fields.accountId) ?? null
  // A phone's LinkedIn app can't speak as a page, so a page is offered only on a browser account.
  const pages = account?.important && !account.onPhone ? account.pages : []
  const page = pages.find((item) => item.pageId === fields.asPageId) ?? null
  const refusal = account ? linkedinPostingRefusal(account.posting, new Date(), account.posting.timeZone) : null
  const onPhone = phoneRefusal(account, kind, fields)
  const limit = kind === "newsletter" ? NEWSLETTER_BODY_CHARS : LINKEDIN_POST_CHARS
  const length = fields.text.trim().length
  const pollInvalid = fields.pollOn && pollToSave(fields) === null
  const undoSeconds = undoUntil ? Math.max(0, Math.ceil((undoUntil - clock) / 1000)) : 0
  const allWords = [fields.title, fields.text].filter((part) => part.trim()).join("\n\n")
  const group = groups.find((item) => item.groupId === fields.groupId) ?? null
  const firstLink = kind === "post" ? (linksIn(fields.text)[0] ?? "") : ""
  const zone = account?.posting.timeZone
  const outsideWorkday = Boolean(fields.scheduledFor && zone && !isWorkday(new Date(fields.scheduledFor), zone))

  function addTag() {
    const name = tagName.trim().replace(/^@/, "")
    const company = /linkedin\.com\/company\//i.test(tagAddress)
    const slug = linkedinSlug(tagAddress, company ? "company" : "person")
    if (!name || !slug) {
      showErrorToast("Type the name as it shows on LinkedIn, and paste the address of their page.")
      return
    }
    if (fields.tags.some((tag) => tag.slug.toLowerCase() === slug.toLowerCase())) {
      showErrorToast(`${name} is tagged already.`)
      return
    }
    const words = fields.text.includes(`@${name}`) ? fields.text : `${fields.text.trimEnd()}${fields.text.trim() ? " " : ""}@${name}`
    change({ tags: [...latest.current.tags, { name, slug, kind: company ? "company" : "person" }], text: words }, true)
    setTagName("")
    setTagAddress("")
  }

  function publish() {
    if (!account) {
      showErrorToast("Pick the account it goes out as.")
      return
    }
    if (kind === "newsletter" && !fields.title.trim()) {
      showErrorToast("Give the issue a title first.")
      return
    }
    if (kind !== "repost" && !fields.text.trim()) {
      showErrorToast(kind === "newsletter" ? "Write the issue first." : "Write the post first.")
      return
    }
    if (length > limit) {
      showErrorToast(`That is ${length} characters. LinkedIn takes ${limit}.`)
      return
    }
    if (pollInvalid) {
      showErrorToast(
        `A poll has a question of at most ${LINKEDIN_POLL_QUESTION_CHARS} characters and ${LINKEDIN_POLL_CHOICES.min} to ${LINKEDIN_POLL_CHOICES.max} answers of at most ${LINKEDIN_POLL_CHOICE_CHARS}.`
      )
      return
    }
    void run("publish", async () => {
      await flush()
      const queued = await actOnLinkedinPost(post.id, "publish")
      if (queued?.undoUntil) {
        setUndoUntil(new Date(queued.undoUntil).getTime())
        setClock(Date.now())
      } else if (queued?.runAfter) {
        toast.success(linkedinWaitingText(new Date(queued.runAfter), linkedinAccountName(account.handle)))
      }
      if (queued?.similarTo) toast.warning(`It still goes. ${queued.similarTo}`)
      await onChanged()
    })
  }

  async function writeWithAi() {
    const from = sources.find((item) => item.source === fields.source)
    if (kind === "newsletter") {
      if (!outline.trim()) {
        if (!about.trim() && !from) throw new Error("Say what the issue is about, or pick something to start from.")
        const written = await writeLinkedinNewsletterWords({ projectId, accountId: fields.accountId, about: about.trim(), source: from?.text ?? "", outline: "", step: "outline" })
        setOutline(written.body)
        if (written.title && !latest.current.title.trim()) change({ title: written.title.slice(0, NEWSLETTER_TITLE_CHARS) }, true)
        toast.success("The outline is written. Change it as you like, then press Write the issue.")
        return
      }
      const written = await writeLinkedinNewsletterWords({ projectId, accountId: fields.accountId, about: about.trim(), source: from?.text ?? "", outline, step: "issue" })
      change({ text: written.body, ...(written.title ? { title: written.title.slice(0, NEWSLETTER_TITLE_CHARS) } : {}) }, true)
      toast.success("The issue is written. Read it through and change what you like.")
      return
    }
    if (kind === "post" && !about.trim() && !from) throw new Error("Say what it is about, or pick something to start from.")
    if (kind === "repost" && !post?.repostFindId) throw new Error("The post this shares is no longer saved, so the AI can't read it. Write the line yourself.")
    const written = await writeLinkedinPostWords({
      projectId,
      accountId: fields.accountId,
      about: about.trim(),
      source: from?.text ?? "",
      repostFindId: kind === "repost" ? (post?.repostFindId ?? null) : null,
      groupId: fields.groupId,
      poll: fields.pollOn,
      asPage: page?.name ?? "",
    })
    change(
      {
        text: written.text,
        ...(latest.current.pollOn && written.question ? { question: written.question } : {}),
        ...(latest.current.pollOn && written.choices.length ? { choices: written.choices.slice(0, LINKEDIN_POLL_CHOICES.max) } : {}),
      },
      true
    )
    toast.success("Written. Read it through and change what you like.")
  }

  const header = (
    <>
      <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
        {LINKEDIN_POST_KIND_WORDS[kind]} · {LINKEDIN_POST_STATUS_WORDS[post.status]}
        {!locked ? (
          <>
            {" "}
            · <span aria-live="polite">{saving === "saving" ? "Saving…" : saving === "saved" ? "Saved" : "Not saved"}</span>
          </>
        ) : null}
      </span>
      {!locked ? (
        <Hint label="Delete this draft">
          <Button type="button" size="icon" variant="ghost" aria-label="Delete this draft" onClick={() => setConfirmDelete(true)}>
            <Trash2Icon />
          </Button>
        </Hint>
      ) : null}
    </>
  )

  return (
    <XPanelFrame header={header} onBack={onBack}>
      <ScrollArea className="min-h-0 flex-1">
        <div className="grid gap-6 p-4">
          {post.status === "failed" ? (
            <p className="flex items-start gap-1.5 text-sm text-destructive">
              <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>{post.lastError}</span>
            </p>
          ) : null}

          <section className="grid gap-4" aria-label="Who posts it and where">
            <div className="grid gap-2">
              <FieldLabel htmlFor="linkedin-post-account">Post as</FieldLabel>
              <Select value={fields.accountId ?? NONE} disabled={locked} onValueChange={(value) => change({ accountId: value === NONE ? null : value, asPageId: "" }, true)}>
                <SelectTrigger id="linkedin-post-account">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Pick an account</SelectItem>
                  {accounts.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {linkedinAccountName(item.handle)}
                      {item.onPhone ? " (on a phone)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {pages.length ? (
              <div className="grid gap-2">
                <FieldLabel htmlFor="linkedin-post-page" hint="An important account speaks as a company page it runs. Only important accounts do.">
                  As
                </FieldLabel>
                <Select value={fields.asPageId || OWN_PAGE} disabled={locked} onValueChange={(value) => change({ asPageId: value === OWN_PAGE ? "" : value }, true)}>
                  <SelectTrigger id="linkedin-post-page">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={OWN_PAGE}>The person</SelectItem>
                    {pages.map((item) => (
                      <SelectItem key={item.pageId} value={item.pageId}>
                        {item.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            {kind !== "newsletter" ? (
              <div className="grid gap-2">
                <FieldLabel htmlFor="linkedin-post-group" hint="Only the project's groups are offered. A group that has not let the account in refuses the post, and says so.">
                  Group
                </FieldLabel>
                <Select value={fields.groupId || OWN_PAGE} disabled={locked} onValueChange={(value) => change({ groupId: value === OWN_PAGE ? "" : value }, true)}>
                  <SelectTrigger id="linkedin-post-group">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={OWN_PAGE}>The account&apos;s own feed</SelectItem>
                    {groups.map((item) => (
                      <SelectItem key={item.groupId} value={item.groupId}>
                        {item.name || `Group ${item.groupId}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            <div className="grid gap-2">
              <FieldLabel htmlFor="linkedin-post-at" hint={`Leave it empty to post when you press Post. ${WORKDAY_WORDS}; a time outside that is refused, because it would never post then.`}>
                Post at
              </FieldLabel>
              <div className="flex items-center gap-2">
                <Input
                  id="linkedin-post-at"
                  type="datetime-local"
                  className="w-full sm:w-fit"
                  value={fields.scheduledFor}
                  disabled={locked}
                  aria-invalid={outsideWorkday || undefined}
                  onChange={(event) => change({ scheduledFor: event.target.value }, true)}
                />
                {fields.scheduledFor && !locked ? (
                  <Hint label="Post when Post is pressed instead">
                    <Button type="button" size="icon" variant="ghost" aria-label="Clear the time" onClick={() => change({ scheduledFor: "" }, true)}>
                      <XIcon />
                    </Button>
                  </Hint>
                ) : null}
              </div>
              {outsideWorkday ? <p className="text-xs text-amber-700 dark:text-amber-400">That time is outside the account&apos;s workday: {WORKDAY_WORDS}.</p> : null}
            </div>
          </section>

          {!locked ? (
            <section className="grid gap-4" aria-label="Write it with AI">
              <div className="grid gap-2">
                <FieldLabel htmlFor="linkedin-post-source" hint="A published Medium article or a Reddit comment of yours that did well. The AI rewrites it for LinkedIn, so the two never read as copies.">
                  Start from
                </FieldLabel>
                <Select value={sources.some((item) => item.source === fields.source) ? fields.source : NONE} onValueChange={(value) => change({ source: value === NONE ? "" : value }, true)}>
                  <SelectTrigger id="linkedin-post-source">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>{fields.source.startsWith("question:") ? "A question people asked" : "Nothing, start from scratch"}</SelectItem>
                    {sources.map((item) => (
                      <SelectItem key={item.source} value={item.source}>
                        {item.label.slice(0, 80)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <FieldLabel htmlFor="linkedin-post-about" hint="A line or two. The AI writes in the account's voice.">
                  What it is about
                </FieldLabel>
                <Textarea id="linkedin-post-about" value={about} placeholder="Three pricing mistakes in a first SaaS" onChange={(event) => setAbout(event.target.value)} />
              </div>
              {kind === "newsletter" ? (
                <div className="grid gap-2">
                  <FieldLabel htmlFor="linkedin-newsletter-outline" hint="Write with AI writes the outline first. Change it, then press Write the issue for the issue written from it.">
                    Outline
                  </FieldLabel>
                  <Textarea id="linkedin-newsletter-outline" value={outline} placeholder="The AI writes it, or type your own" onChange={(event) => setOutline(event.target.value)} />
                </div>
              ) : null}
              <div className="flex justify-end">
                <Button type="button" variant="outline" disabled={busy !== null} onClick={() => void run("write", writeWithAi)}>
                  {busy === "write" ? <Loader2Icon className="animate-spin" /> : <SparklesIcon />}
                  {kind === "newsletter" ? (outline.trim() ? "Write the issue" : "Write the outline") : "Write with AI"}
                </Button>
              </div>
            </section>
          ) : null}

          <section className="grid gap-4" aria-label="What it says">
            {kind === "repost" ? (
              <p className="text-xs text-muted-foreground">
                Reposting{" "}
                {post.repostOf ? (
                  <a href={`https://www.linkedin.com/feed/update/urn:li:activity:${post.repostOf}/`} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-foreground">
                    the post it shares
                  </a>
                ) : (
                  "a post"
                )}
                , with your line on top.
              </p>
            ) : null}
            {kind === "newsletter" ? (
              <div className="grid gap-2">
                <Label htmlFor="linkedin-post-title">Title</Label>
                <Input
                  id="linkedin-post-title"
                  value={fields.title}
                  disabled={locked}
                  aria-invalid={fields.title.trim().length > NEWSLETTER_TITLE_CHARS || undefined}
                  onChange={(event) => change({ title: event.target.value })}
                  onBlur={saveSoon}
                />
              </div>
            ) : null}
            <div className="grid gap-2">
              <Label htmlFor="linkedin-post-text">{kind === "newsletter" ? "The issue" : kind === "repost" ? "Your line on top" : "The post"}</Label>
              <Textarea
                id="linkedin-post-text"
                value={fields.text}
                disabled={locked}
                aria-invalid={length > limit || undefined}
                placeholder={kind === "repost" ? "Why it is worth reading, in a sentence or three" : "What the post says"}
                onChange={(event) => change({ text: event.target.value })}
                onBlur={saveSoon}
              />
              <p className={cn("text-right text-xs tabular-nums", length > limit ? "text-destructive" : "text-muted-foreground")}>
                {length}/{limit}
              </p>
              {firstLink ? (
                <p className="text-xs text-muted-foreground">
                  The link goes in the first comment under the post instead, because LinkedIn shows a post with a link to fewer people.
                </p>
              ) : null}
            </div>
            {kind === "newsletter" ? (
              <ImageUpload
                label="Cover"
                value={fields.pictureUrl}
                aspect="video"
                disabled={locked}
                emptyLabel="Add a cover"
                hint="Pick one from the media library. LinkedIn shows it above the issue."
                onChange={(value) => change({ pictureUrl: value }, true)}
              />
            ) : null}
            {kind === "post" ? (
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="linkedin-post-media">With it</Label>
                  <Select
                    value={media}
                    disabled={locked}
                    onValueChange={(value) => {
                      const next = value === "picture" || value === "video" || value === "poll" ? value : "none"
                      setMedia(next)
                      change(
                        {
                          pollOn: next === "poll",
                          ...(next !== "picture" ? { pictureUrl: "" } : {}),
                          ...(next !== "video" ? { videoUrl: "" } : {}),
                        },
                        true
                      )
                    }}
                  >
                    <SelectTrigger id="linkedin-post-media" className="w-full sm:w-fit sm:min-w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Words only</SelectItem>
                      <SelectItem value="picture">A picture</SelectItem>
                      <SelectItem value="video">A video</SelectItem>
                      <SelectItem value="poll">A poll</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {media === "picture" ? (
                  <ImageUpload
                    label="Picture"
                    value={fields.pictureUrl}
                    aspect="video"
                    disabled={locked}
                    emptyLabel="Add a picture"
                    hint="Pick one from the media library. LinkedIn shows it under the post's words."
                    onChange={(value) => change({ pictureUrl: value }, true)}
                  />
                ) : null}
                {media === "video" ? (
                  <ImageUpload
                    label="Video"
                    value={fields.videoUrl}
                    aspect="video"
                    showVideos
                    disabled={locked}
                    emptyLabel="Add a video"
                    hint="Pick an MP4, MOV or WebM video from the media library, under 500 MB. LinkedIn plays it in the feed by itself."
                    onChange={(value) => change({ videoUrl: value }, true)}
                  />
                ) : null}
                {fields.pollOn ? (
                  <div className="grid gap-4 rounded-lg border p-3">
                    <div className="grid gap-2">
                      <Label htmlFor="linkedin-poll-question">The poll&apos;s question</Label>
                      <Input
                        id="linkedin-poll-question"
                        value={fields.question}
                        disabled={locked}
                        aria-invalid={fields.question.trim().length > LINKEDIN_POLL_QUESTION_CHARS || undefined}
                        onChange={(event) => change({ question: event.target.value })}
                        onBlur={saveSoon}
                      />
                    </div>
                    {fields.choices.map((choice, index) => (
                      <div key={index} className="grid gap-2">
                        <Label htmlFor={`linkedin-poll-choice-${index}`}>Answer {index + 1}</Label>
                        <div className="flex items-center gap-2">
                          <Input
                            id={`linkedin-poll-choice-${index}`}
                            value={choice}
                            disabled={locked}
                            aria-invalid={choice.trim().length > LINKEDIN_POLL_CHOICE_CHARS || undefined}
                            onChange={(event) => change({ choices: latest.current.choices.map((item, at) => (at === index ? event.target.value : item)) })}
                            onBlur={saveSoon}
                          />
                          {fields.choices.length > LINKEDIN_POLL_CHOICES.min && !locked ? (
                            <Hint label="Take this answer out">
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                aria-label={`Take answer ${index + 1} out`}
                                onClick={() => change({ choices: latest.current.choices.filter((_, at) => at !== index) }, true)}
                              >
                                <XIcon />
                              </Button>
                            </Hint>
                          ) : null}
                        </div>
                      </div>
                    ))}
                    <div className="flex flex-wrap items-end gap-4">
                      {fields.choices.length < LINKEDIN_POLL_CHOICES.max && !locked ? (
                        <Button type="button" variant="outline" onClick={() => change({ choices: [...latest.current.choices, ""] }, true)}>
                          <PlusIcon />
                          Add an answer
                        </Button>
                      ) : null}
                      <div className="grid gap-2">
                        <Label htmlFor="linkedin-poll-days">Open for</Label>
                        <Select value={String(fields.days)} disabled={locked} onValueChange={(value) => change({ days: Number(value) }, true)}>
                          <SelectTrigger id="linkedin-poll-days" className="w-full sm:w-fit sm:min-w-32">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {LINKEDIN_POLL_DAYS.map((days) => (
                              <SelectItem key={days} value={String(days)}>
                                {POLL_DAY_WORDS[days]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <p className={cn("text-xs", pollInvalid ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground")}>
                      A question of at most {LINKEDIN_POLL_QUESTION_CHARS} characters and {LINKEDIN_POLL_CHOICES.min} to {LINKEDIN_POLL_CHOICES.max} answers of at most{" "}
                      {LINKEDIN_POLL_CHOICE_CHARS}. The votes are read back with the daily check.
                    </p>
                  </div>
                ) : null}
              </div>
            ) : null}
          </section>

          {kind !== "newsletter" ? (
            <section className="grid gap-3" aria-label="People and pages it tags">
              <p className="text-sm font-medium">Tags</p>
              {fields.tags.length ? (
                <ul className="grid gap-1">
                  {fields.tags.map((tag) => (
                    <li key={tag.slug} className="flex min-w-0 items-center gap-2 text-sm">
                      <span className="min-w-0 flex-1 truncate">
                        @{tag.name}
                        <span className="text-muted-foreground"> · {tag.kind === "company" ? `company/${tag.slug}` : `in/${tag.slug}`}</span>
                      </span>
                      {!locked ? (
                        <Hint label={`Take the tag on ${tag.name} out`}>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            aria-label={`Take the tag on ${tag.name} out`}
                            onClick={() => change({ tags: latest.current.tags.filter((item) => item.slug !== tag.slug) }, true)}
                          >
                            <XIcon />
                          </Button>
                        </Hint>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground">Nobody is tagged. A tagged person or page hears about the post, so tag only people who know you.</p>
              )}
              {!locked ? (
                <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                  <div className="grid gap-2">
                    <Label htmlFor="linkedin-tag-name">Name as it shows</Label>
                    <Input id="linkedin-tag-name" value={tagName} placeholder="Jane Doe" onChange={(event) => setTagName(event.target.value)} />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="linkedin-tag-address">Their page</Label>
                    <Input id="linkedin-tag-address" value={tagAddress} placeholder="linkedin.com/in/jane-doe" onChange={(event) => setTagAddress(event.target.value)} />
                  </div>
                  <Button type="button" variant="outline" onClick={addTag}>
                    <PlusIcon />
                    Tag
                  </Button>
                </div>
              ) : null}
            </section>
          ) : null}

          {verdict && verdict.words === allWords ? (
            verdict.result.ok ? (
              <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <ShieldCheckIcon className="mt-px size-3.5 shrink-0" aria-hidden="true" />
                Breaks none of LinkedIn&apos;s rules{group ? " or the group's" : ""}, as far as the AI can tell.
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

      <div className="grid gap-3 border-t p-4">
        {onPhone ? (
          <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
            <AlertTriangleIcon className="mt-px size-3.5 shrink-0" aria-hidden="true" />
            <span>{onPhone}</span>
          </p>
        ) : null}
        {!locked && refusal ? <p className="text-xs text-muted-foreground">{refusal}</p> : null}
        {waiting ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex min-w-0 flex-1 items-start gap-1.5 text-sm">
              <ClockIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {undoUntil
                ? `Posting in ${undoSeconds} ${undoSeconds === 1 ? "second" : "seconds"}.`
                : post.scheduledFor
                  ? `${postsAtText(post.scheduledFor)}${account ? ` as ${linkedinAccountName(account.handle)}` : ""}.`
                  : `Waiting to post${account ? ` as ${linkedinAccountName(account.handle)}` : ""}.`}
            </span>
            <Button
              type="button"
              variant="outline"
              disabled={busy !== null}
              onClick={() =>
                void run("cancel", async () => {
                  await actOnLinkedinPost(post.id, "cancel")
                  setUndoUntil(null)
                  toast.success("Taken back. It is a draft again.")
                  await onChanged()
                })
              }
            >
              <Undo2Icon />
              Take it back
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              disabled={busy !== null}
              onClick={() =>
                void run("check", async () => {
                  if (!allWords.trim()) throw new Error("Write it first, then check it.")
                  setVerdict({ words: allWords, result: await checkLinkedinWords({ projectId, text: allWords, groupId: fields.groupId || undefined, isComment: false }) })
                })
              }
            >
              {busy === "check" ? <Loader2Icon className="animate-spin" /> : <ShieldCheckIcon />}
              Check LinkedIn&apos;s rules
            </Button>
            <span className="flex-1" />
            <Button type="button" disabled={busy === "publish"} onClick={publish}>
              {busy === "publish" ? <Loader2Icon className="animate-spin" /> : null}
              {post.status === "failed" ? "Try again" : fields.scheduledFor ? "Post at that time" : kind === "newsletter" ? "Publish" : "Post"}
            </Button>
          </div>
        )}
      </div>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this draft?"
        description="It never went to LinkedIn, so it is only deleted here."
        confirmLabel="Delete draft"
        loading={busy === "delete"}
        onConfirm={() =>
          void run("delete", async () => {
            if (timer.current) clearTimeout(timer.current)
            timer.current = null
            dirty.current = false
            await actOnLinkedinPost(post.id, "delete_draft")
            setConfirmDelete(false)
            onClose()
            await onChanged()
          })
        }
      />
    </XPanelFrame>
  )
}

/** A post, repost or newsletter issue that is on LinkedIn: its words, numbers, poll votes, the comments under it, Check now, Edit and Delete. */
function PostedPost({ projectId, post, onBack, onChanged }: { projectId: string; post: LinkedinPostView; onBack?: () => void; onChanged: () => Promise<void> }) {
  const [confirmDelete, setConfirmDelete] = React.useState(false)
  const [editing, setEditing] = React.useState(false)
  const [words, setWords] = React.useState(post.text)
  const [busy, setBusy] = React.useState<string | null>(null)

  async function run(which: string, action: () => Promise<void>) {
    setBusy(which)
    try {
      await action()
      await onChanged()
    } catch (failure) {
      showErrorToast(getLinkedinErrorMessage(failure))
    } finally {
      setBusy(null)
    }
  }

  const header = (
    <>
      <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
        {post.deletedAt ? "Deleted" : "Posted"}
        {post.account ? ` · ${linkedinAccountName(post.account.handle)}` : ""}
      </span>
      {!post.deletedAt ? (
        <>
          <Hint label="Read its numbers, poll votes and the comments under it again now">
            <Button
              type="button"
              variant="outline"
              disabled={busy !== null}
              onClick={() =>
                void run("check", async () => {
                  const { queued } = await checkLinkedinNow({ postRowIds: [post.id] })
                  toast.success(queued ? "Checking it now." : "It is being checked already.")
                })
              }
            >
              {busy === "check" ? <Loader2Icon className="animate-spin" /> : <RefreshCwIcon />}
              Check now
            </Button>
          </Hint>
          {post.kind !== "newsletter" && !post.account?.onPhone ? (
            <Hint label="Change its words on LinkedIn">
              <Button type="button" size="icon" variant="ghost" aria-label="Edit on LinkedIn" onClick={() => setEditing((open) => !open)}>
                <SettingsIcon />
              </Button>
            </Hint>
          ) : null}
          {/* The LinkedIn app on a phone neither edits nor deletes; those need a browser account. */}
          {!post.account?.onPhone ? (
            <Hint label="Delete it from LinkedIn">
              <Button type="button" size="icon" variant="ghost" aria-label="Delete from LinkedIn" onClick={() => setConfirmDelete(true)}>
                <Trash2Icon />
              </Button>
            </Hint>
          ) : null}
        </>
      ) : null}
      {post.url ? (
        <Hint label="Open it on LinkedIn">
          <Button type="button" size="icon" variant="ghost" asChild>
            <a href={post.url} target="_blank" rel="noreferrer" aria-label="Open it on LinkedIn">
              <ExternalLinkIcon />
            </a>
          </Button>
        </Hint>
      ) : null}
    </>
  )

  const votes = post.poll?.votes ?? null
  const totalVotes = votes ? votes.reduce((sum, value) => sum + value, 0) : 0

  return (
    <XPanelFrame header={header} onBack={onBack}>
      <ScrollArea className="min-h-0 flex-1">
        <div className="grid gap-4 p-4">
          {post.title ? <p className="text-base font-semibold">{post.title}</p> : null}
          {editing ? (
            <div className="grid gap-2">
              <Textarea aria-label="The new words" value={words} onChange={(event) => setWords(event.target.value)} aria-invalid={words.trim().length > LINKEDIN_POST_CHARS || undefined} />
              <p className={cn("text-xs tabular-nums", words.trim().length > LINKEDIN_POST_CHARS ? "text-destructive" : "text-muted-foreground")}>
                {words.trim().length}/{LINKEDIN_POST_CHARS}
              </p>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  disabled={busy !== null}
                  onClick={() =>
                    void run("edit", async () => {
                      if (!words.trim()) throw new Error("Write the new words first, or delete it instead.")
                      const changed = await changeOnLinkedin({ postRowId: post.id, action: "edit", text: words.trim() })
                      setEditing(false)
                      toast.success("The new words are on their way to LinkedIn.")
                      if (changed.similarTo) toast.warning(`It still goes. ${changed.similarTo}`)
                    })
                  }
                >
                  {busy === "edit" ? <Loader2Icon className="animate-spin" /> : null}
                  Save changes
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm whitespace-pre-wrap break-words">{post.text}</p>
          )}
          {post.firstComment ? (
            <p className="text-xs break-all text-muted-foreground">
              First comment, with the link: {post.firstComment}
              {post.firstCommentPosted ? "" : " (not posted yet)"}
            </p>
          ) : null}
          {post.pictureUrl ? <img src={post.pictureUrl} alt={post.kind === "newsletter" ? "The issue's cover" : "The picture on the post"} className="aspect-video w-full rounded-lg border object-cover" /> : null}
          {post.videoUrl ? <video src={post.videoUrl} controls className="aspect-video w-full rounded-lg border bg-black" aria-label="The video on the post" /> : null}
          {post.poll ? (
            <div className="grid gap-1 rounded-lg border p-3">
              <p className="text-xs font-medium text-muted-foreground">
                {post.poll.question}
                {votes ? ` · ${totalVotes} ${totalVotes === 1 ? "vote" : "votes"}` : " · votes not read yet"}
              </p>
              {post.poll.choices.map((choice, index) => (
                <p key={index} className="flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate">{choice}</span>
                  <span className="shrink-0 text-muted-foreground tabular-nums">{votes ? (votes[index] ?? 0) : "?"}</span>
                </p>
              ))}
            </div>
          ) : null}
          <dl className="grid grid-cols-3 gap-2 text-center">
            {(
              [
                ["Reactions", post.reactions],
                ["Comments", post.commentCount],
                ["Reposts", post.reposts],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="rounded-lg border p-2">
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="text-lg font-semibold tabular-nums">{figure(value)}</dd>
              </div>
            ))}
          </dl>
          <p className="text-xs text-muted-foreground">
            {upWords(post)}
            {post.checkedAt ? `. Checked ${postedDateText(new Date(post.checkedAt)).toLowerCase()}.` : ". Its numbers are read with the daily check."}
          </p>

          {post.incoming === null ? (
            <p className="border-t pt-4 text-sm text-muted-foreground">The comments under it are read on the next check.</p>
          ) : post.incoming.length ? (
            <div className="grid gap-3 border-t pt-4">
              <p className="text-xs font-medium text-muted-foreground">Comments under it</p>
              {post.incoming.map((item) =>
                post.account ? (
                  <LinkedinIncomingAnswer
                    key={item.id}
                    projectId={projectId}
                    accountId={post.account.id}
                    handle={post.account.handle}
                    under={{ postRowId: post.id }}
                    mine={(post.title ? `${post.title}\n\n${post.text}` : post.text).slice(0, 2_000)}
                    item={item}
                    answered={item.answered}
                    onChanged={onChanged}
                  />
                ) : null
              )}
            </div>
          ) : (
            <p className="border-t pt-4 text-sm text-muted-foreground">Nobody has commented on it yet.</p>
          )}
        </div>
      </ScrollArea>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this from LinkedIn?"
        description="The account's browser deletes it on LinkedIn, looking before and after. Promo keeps its record and its numbers."
        confirmLabel="Delete"
        loading={busy === "delete"}
        onConfirm={() =>
          void run("delete", async () => {
            await changeOnLinkedin({ postRowId: post.id, action: "delete" })
            setConfirmDelete(false)
            toast.success("On its way to being deleted on LinkedIn.")
          })
        }
      />
    </XPanelFrame>
  )
}
