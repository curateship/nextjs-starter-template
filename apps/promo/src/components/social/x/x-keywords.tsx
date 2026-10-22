import * as React from "react"
import {
  BellIcon,
  BellOffIcon,
  EllipsisVerticalIcon,
  EyeIcon,
  ListChecksIcon,
  Loader2Icon,
  PlusIcon,
  RotateCwIcon,
  SparklesIcon,
  TagIcon,
  TrendingUpIcon,
  XIcon,
} from "lucide-react"
import { toast } from "sonner"

import { DashboardCardHeader, DashboardCardHeaderIcon, dashboardCardHeadingClassName } from "@/components/shared/dashboard-card-header"
import { DashboardToolbarButton } from "@/components/shared/dashboard-toolbar"
import { Hint } from "@/components/social/hint"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  askXKeywordIdeas,
  changeXHidden,
  changeXKeyword,
  getXErrorMessage,
  loadXIdeaAccounts,
  saveXKeyword,
  searchAllX,
  type XIdeas,
  type XKeywordIdea,
  type XModuleView,
} from "@/lib/api/social/x"
import {
  X_KEYWORD_KIND_WORDS,
  X_KEYWORD_KINDS,
  X_KEYWORD_MARKS,
  X_MARK_WORDS,
  xKeywordLabel,
  type XKeywordKind,
  type XKeywordMark,
  type XSpendPart,
} from "@/lib/social/x/options"
import { shortCount } from "@/lib/social/x/wording"
import { keywordChipTimeText, postedDateText } from "@/lib/social/wording"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

import { KeywordPicker } from "../keyword-picker"
import { NetworkIcon } from "../network-icon"

type Keyword = XModuleView["keywords"][number]

/** How often the accounts look-up is asked about while it runs. */
const LOOKUP_POLL_MS = 2_000

/** What each kind's box asks for, and an example of it. */
const KIND_HINTS: Record<XKeywordKind, { hint: string; placeholder: string }> = {
  search: { hint: "Words someone would type into X's search. A search account reads X's Latest tab for them.", placeholder: "best tool for small teams" },
  hashtag: { hint: "A hashtag. A search account reads its newest posts on X's Latest tab.", placeholder: "#buildinpublic" },
  account: {
    hint: "An X account's address or @name. Its new posts are read every 15 minutes in waking hours, and go to the top of To look at.",
    placeholder: "@levelsio",
  },
}

/** "2 hours ago", "searching", "search failed", in the same words as Reddit's and Medium's keywords. */
function keywordTime(keyword: Keyword): string {
  if (keyword.searching) return "searching"
  if (keyword.lastError) return "search failed"
  return keywordChipTimeText(keyword)
}

/** The parts of X's AI spend, in the More menu (part 45). */
const SPEND_PARTS: Array<[XSpendPart, string]> = [
  ["replies", "Replies"],
  ["posts", "Posts"],
  ["ideas", "Ideas"],
]

/** Cents as dollars: 420 is $4.20. */
function dollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

const dayFormat = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", timeZone: "UTC" })

/**
 * The middle column's header: X's name, then on the right the search box,
 * the shared keywords dropdown, Jobs and More, the same row as Medium's. An X
 * keyword is search words, a hashtag or a watched account (parts 9 and 11).
 * Search words can be marked as the product's own name or a rival's (part
 * 13), and a watched account rings the bell for its new posts unless its
 * bell is switched off (part 12). More holds searching every keyword, the
 * AI's ideas with X's trends (parts 14 and 15), the AI spend (part 45) and
 * the hidden accounts (part 16).
 */
export function XKeywords({
  view,
  failed,
  projectId,
  selectedId,
  search,
  onSelect,
  onChanged,
  onOpenJobs,
}: {
  view: XModuleView | null
  /** The module did not load, so the dropdown stops waiting for its keywords. */
  failed: boolean
  projectId: string
  selectedId: string | null
  /** The search box, drawn among the row's buttons on the post tabs. */
  search: React.ReactNode
  onSelect: (keywordId: string | null) => void
  onChanged: () => Promise<void>
  onOpenJobs: () => void
}) {
  const [ideas, setIdeas] = React.useState<XIdeas | null>(null)
  const [asking, setAsking] = React.useState(false)
  const keywords = view?.keywords ?? []
  const jobsWaiting = view ? view.jobs.queued + view.jobs.running : 0
  // Nothing waiting starts without the browser program or a search account.
  const stalled = !view?.jobs.programRunning || !view.searchers.length

  async function act(action: () => Promise<unknown>, done?: string) {
    try {
      await action()
      await onChanged()
      if (done) toast.success(done)
    } catch (error) {
      showErrorToast(getXErrorMessage(error))
    }
  }

  async function askIdeas() {
    setAsking(true)
    try {
      setIdeas(await askXKeywordIdeas(projectId, keywords.map((keyword) => keyword.label)))
    } catch (error) {
      showErrorToast(getXErrorMessage(error))
    } finally {
      setAsking(false)
    }
  }

  return (
    <DashboardCardHeader className="flex-wrap items-center gap-x-3 gap-y-2">
      <DashboardCardHeaderIcon>
        <NetworkIcon network="x" />
      </DashboardCardHeaderIcon>
      <h2 className={cn(dashboardCardHeadingClassName, "min-w-0 truncate")}>X</h2>

      <div className="ml-auto flex w-full min-w-0 items-center gap-2 sm:w-auto sm:shrink-0">
        {search}
        <KeywordPicker
          items={keywords.map((keyword) => ({
            id: keyword.id,
            label: keyword.label,
            count: keyword.waiting,
            badge: keyword.mark ? (
              <Hint label={X_MARK_WORDS[keyword.mark]}>
                <TagIcon className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-label={X_MARK_WORDS[keyword.mark]} />
              </Hint>
            ) : keyword.kind === "account" && !keyword.notify ? (
              <Hint label="The bell is off for this account's new posts">
                <BellOffIcon className="size-3.5 shrink-0 text-muted-foreground" aria-label="The bell is off for this account's new posts" />
              </Hint>
            ) : undefined,
            status: `${keyword.searching && stalled ? "waiting" : keywordTime(keyword)} · ${X_KEYWORD_KIND_WORDS[keyword.kind].toLowerCase()}`,
            failed: keyword.lastError || null,
            enabled: keyword.enabled,
            running: keyword.searching,
            stalled,
            runHint: keyword.kind === "account" ? "Read its newest posts now" : "Search again now",
            runningReason: stalled ? "A search is already waiting for the browser program or a search account. The Jobs page says why." : "Searching now",
          }))}
          loading={!view && !failed}
          selectedId={selectedId}
          allCount={view?.counts.toLook}
          onSelect={onSelect}
          onRun={(id) => act(() => changeXKeyword({ change: "search", keywordId: id }))}
          onSwitch={(id, enabled) => act(() => changeXKeyword({ change: "enabled", keywordId: id, enabled }))}
          menu={(item) => {
            const keyword = keywords.find((row) => row.id === item.id)
            return (
              <>
                {keyword?.kind === "search" ? (
                  <>
                    <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">What these words are</DropdownMenuLabel>
                    {X_KEYWORD_MARKS.map((mark) => (
                      <DropdownMenuItem key={mark || "plain"} onSelect={() => void act(() => changeXKeyword({ change: "mark", keywordId: item.id, mark }))}>
                        <TagIcon className={mark ? undefined : "opacity-0"} />
                        {mark ? X_MARK_WORDS[mark] : "Ordinary search words"}
                        {keyword.mark === mark ? <span className="ml-auto text-xs text-muted-foreground">Picked</span> : null}
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuSeparator />
                  </>
                ) : null}
                {keyword?.kind === "account" ? (
                  <>
                    <DropdownMenuItem
                      onSelect={() =>
                        void act(
                          () => changeXKeyword({ change: "notify", keywordId: item.id, notify: !keyword.notify }),
                          keyword.notify ? `The bell stays quiet for ${item.label}'s new posts.` : `The bell rings for each new post from ${item.label}.`
                        )
                      }
                    >
                      {keyword.notify ? <BellOffIcon /> : <BellIcon />}
                      {keyword.notify ? "Stop the bell for its new posts" : "Ring the bell for its new posts"}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                ) : null}
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() =>
                    void act(async () => {
                      await changeXKeyword({ change: "delete", keywordId: item.id })
                      // Its posts are gone, so listing them alone would show nothing.
                      if (item.id === selectedId) onSelect(null)
                    }, `${item.label} removed. Replies already sent keep their record.`)
                  }
                >
                  <XIcon />
                  Remove {item.label} and the posts only it found
                </DropdownMenuItem>
              </>
            )
          }}
          addForm={(close) => (
            <AddKeywordForm
              onAdd={async (input) => {
                try {
                  const saved = await saveXKeyword({ projectId, ...input })
                  close()
                  await onChanged()
                  if (saved.searchRefused) showErrorToast(`Saved, but not searched yet. ${saved.searchRefused}`)
                  else toast.success("Saved. Its posts show here once a search account has read them.")
                } catch (error) {
                  showErrorToast(getXErrorMessage(error))
                }
              }}
              onCancel={close}
            />
          )}
        />
        <DashboardToolbarButton
          type="button"
          variant="outline"
          onClick={onOpenJobs}
          aria-label={jobsWaiting ? `Jobs, ${jobsWaiting} running or waiting` : "Jobs"}
        >
          <ListChecksIcon className="size-4" />
          <span className="hidden sm:inline">Jobs</span>
          {jobsWaiting ? <span className="text-muted-foreground tabular-nums">{jobsWaiting}</span> : null}
        </DashboardToolbarButton>
        <DropdownMenu>
          <Hint label="Search all, ideas, AI spend and hidden accounts">
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" size="icon" aria-label="More">
                {asking ? <Loader2Icon className="animate-spin" /> : <EllipsisVerticalIcon />}
              </Button>
            </DropdownMenuTrigger>
          </Hint>
          <DropdownMenuContent align="end" className="w-72">
            <DropdownMenuItem
              onSelect={() =>
                void act(async () => {
                  if (!keywords.length) throw new Error("Add a keyword first, then it can be searched.")
                  const { queued } = await searchAllX(projectId)
                  if (!queued) throw new Error("Every switched-on keyword is already being searched.")
                }, "Searching every switched-on keyword.")
              }
            >
              <RotateCwIcon />
              Search every keyword now
            </DropdownMenuItem>
            <DropdownMenuItem disabled={asking} onSelect={() => void askIdeas()}>
              <SparklesIcon />
              Search word and account ideas
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="flex items-center justify-between gap-2 text-xs font-normal text-muted-foreground">
              <span>X&apos;s AI this month</span>
              <span className="text-foreground tabular-nums">{view ? dollars(view.spend.totalCents) : "…"}</span>
            </DropdownMenuLabel>
            {view ? (
              <dl className="grid gap-1 px-2 pb-1.5 text-sm">
                {SPEND_PARTS.map(([part, words]) => (
                  <div key={part} className="flex items-center justify-between gap-2">
                    <dt className="text-muted-foreground">{words}</dt>
                    <dd className="tabular-nums">{dollars(view.spend.parts[part])}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
            {view?.spend.days.length ? (
              <>
                <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">The last two weeks, day by day</DropdownMenuLabel>
                <dl className="grid gap-1 px-2 pb-1.5 text-sm">
                  {view.spend.days.map((day) => (
                    <div key={day.day} className="flex items-center justify-between gap-2">
                      <dt className="text-muted-foreground">{dayFormat.format(new Date(`${day.day}T12:00:00Z`))}</dt>
                      <dd className="tabular-nums">{dollars(day.cents)}</dd>
                    </div>
                  ))}
                </dl>
              </>
            ) : null}
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Accounts you never see</DropdownMenuLabel>
            {view?.hidden.length ? (
              view.hidden.map((hidden) => (
                <DropdownMenuItem
                  key={hidden.id}
                  onSelect={() => void act(() => changeXHidden({ change: "show", hiddenId: hidden.id }), `@${hidden.handle} shows again.`)}
                >
                  <EyeIcon />
                  <span className="truncate">Show @{hidden.handle} again</span>
                </DropdownMenuItem>
              ))
            ) : (
              <p className="px-2 py-1.5 text-sm text-muted-foreground">None hidden. Hide an account from one of its posts&apos; rows.</p>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        <Dialog open={ideas !== null} onOpenChange={(open) => (open ? null : setIdeas(null))}>
          <DialogContent variant="admin">
            <DialogHeader>
              <DialogTitle>Search word and account ideas</DialogTitle>
              <DialogDescription>From the project&apos;s description, and from what is trending on X. Add the ones worth searching.</DialogDescription>
            </DialogHeader>
            <DialogBody>
              {ideas ? (
                <IdeasList
                  // A new ask starts the accounts look-up afresh.
                  key={ideas.lookupJobId ?? "none"}
                  ideas={ideas}
                  onAdd={async (input) => {
                    try {
                      const saved = await saveXKeyword({ projectId, kind: input.kind, value: input.value })
                      if (saved.searchRefused) showErrorToast(`Saved, but not searched yet. ${saved.searchRefused}`)
                      await onChanged()
                      return true
                    } catch (error) {
                      showErrorToast(getXErrorMessage(error))
                      return false
                    }
                  }}
                />
              ) : null}
            </DialogBody>
            <DialogFooter>
              <Button type="button" onClick={() => setIdeas(null)}>
                Done
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardCardHeader>
  )
}

function AddKeywordForm({
  onAdd,
  onCancel,
}: {
  onAdd: (input: { kind: XKeywordKind; value: string; mark?: XKeywordMark }) => Promise<void>
  onCancel: () => void
}) {
  const [kind, setKind] = React.useState<XKeywordKind>("search")
  const [value, setValue] = React.useState("")
  const [mark, setMark] = React.useState<XKeywordMark>("")
  const [tried, setTried] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const empty = !value.trim()

  async function add(event: React.FormEvent) {
    event.preventDefault()
    setTried(true)
    if (empty) {
      showErrorToast(`Type the ${X_KEYWORD_KIND_WORDS[kind].toLowerCase()} first.`)
      return
    }
    setBusy(true)
    try {
      await onAdd({ kind, value: value.trim(), ...(kind === "search" && mark ? { mark } : {}) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={add} className="grid gap-4">
      <div className="grid gap-2">
        <FieldLabel htmlFor="x-keyword-kind">Kind</FieldLabel>
        <Select value={kind} onValueChange={(next) => setKind(next as XKeywordKind)}>
          <SelectTrigger id="x-keyword-kind">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {X_KEYWORD_KINDS.map((item) => (
              <SelectItem key={item} value={item}>
                {X_KEYWORD_KIND_WORDS[item]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-2">
        <FieldLabel htmlFor="x-keyword-value" hint={KIND_HINTS[kind].hint}>
          {X_KEYWORD_KIND_WORDS[kind]}
        </FieldLabel>
        <Input
          id="x-keyword-value"
          value={value}
          autoFocus
          aria-invalid={(tried && empty) || undefined}
          placeholder={KIND_HINTS[kind].placeholder}
          onChange={(event) => setValue(event.target.value)}
        />
      </div>
      {kind === "search" ? (
        <div className="grid gap-2">
          <FieldLabel htmlFor="x-keyword-mark" hint="Posts found by your product's own name, or a rival's, carry a chip and go first.">
            These words are
          </FieldLabel>
          <Select value={mark || "plain"} onValueChange={(next) => setMark(next === "plain" ? "" : (next as XKeywordMark))}>
            <SelectTrigger id="x-keyword-mark">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="plain">Ordinary search words</SelectItem>
              <SelectItem value="you">{X_MARK_WORDS.you}</SelectItem>
              <SelectItem value="rival">{X_MARK_WORDS.rival}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy}>
          {busy ? <Loader2Icon className="animate-spin" /> : null}
          Add keyword
        </Button>
      </div>
    </form>
  )
}

type FoundAccount = { handle: string; name: string; followers: number | null }

/**
 * The ideas: search words and hashtags at once, trending ones marked with
 * the place X tuned them to (part 15), then the accounts the AI named, shown
 * only once a search account has seen they exist on X (part 14).
 */
function IdeasList({ ideas, onAdd }: { ideas: XIdeas; onAdd: (input: { kind: XKeywordKind; value: string }) => Promise<boolean> }) {
  const [added, setAdded] = React.useState<Set<string>>(new Set())
  const [adding, setAdding] = React.useState<string | null>(null)
  const [lookup, setLookup] = React.useState<{ done: boolean; error: string; found: FoundAccount[] }>({
    done: ideas.lookupJobId === null,
    error: "",
    found: [],
  })

  // The look-up runs in a search account's browser, so it is asked about
  // every two seconds until it has finished.
  React.useEffect(() => {
    const jobId = ideas.lookupJobId
    if (!jobId) return
    let live = true
    let timer: ReturnType<typeof setTimeout> | undefined
    const ask = () => {
      loadXIdeaAccounts(jobId).then(
        (answer) => {
          if (!live) return
          setLookup(answer)
          if (!answer.done) timer = setTimeout(ask, LOOKUP_POLL_MS)
        },
        (failure: unknown) => {
          if (live) setLookup({ done: true, error: `The look-up could not be read. ${getXErrorMessage(failure)}`, found: [] })
        }
      )
    }
    ask()
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [ideas.lookupJobId])

  async function add(key: string, input: { kind: XKeywordKind; value: string }) {
    setAdding(key)
    try {
      if (await onAdd(input)) setAdded((current) => new Set(current).add(key))
    } finally {
      setAdding(null)
    }
  }

  const words = ideas.ideas.filter((idea) => !added.has(ideaKey(idea)))
  const accounts = lookup.found.filter((account) => !added.has(`account:${account.handle}`))

  return (
    <div className="grid gap-6">
      <section className="grid gap-2" aria-label="Search words and hashtags">
        <p className="text-xs font-medium text-muted-foreground">Search words and hashtags</p>
        {ideas.trends ? (
          <p className="text-xs text-muted-foreground">
            Trends were read for {ideas.trends.place || "the search account's place"}, {postedDateText(new Date(ideas.trends.readAt)).toLowerCase()}. X picks
            trends by where the search account&apos;s proxy is.
          </p>
        ) : null}
        {words.length ? (
          words.map((idea) => {
            const key = ideaKey(idea)
            return (
              <IdeaRow
                key={key}
                label={xKeywordLabel(idea)}
                detail={
                  idea.trending ? (
                    <span className="inline-flex items-center gap-1">
                      <TrendingUpIcon className="size-3" aria-hidden="true" />
                      Trending{ideas.trends?.place ? ` in ${ideas.trends.place}` : ""}
                    </span>
                  ) : (
                    X_KEYWORD_KIND_WORDS[idea.kind]
                  )
                }
                busy={adding === key}
                disabled={adding !== null}
                onAdd={() => void add(key, { kind: idea.kind, value: idea.value })}
              />
            )
          })
        ) : (
          <p className="text-sm text-muted-foreground">{ideas.ideas.length ? "Every idea has been added." : "No search word ideas this time."}</p>
        )}
      </section>
      <section className="grid gap-2" aria-label="Accounts worth watching">
        <p className="text-xs font-medium text-muted-foreground">Accounts worth watching</p>
        {ideas.lookupRefused ? (
          <p className="text-sm text-muted-foreground">The accounts could not be looked up on X. {ideas.lookupRefused}</p>
        ) : !ideas.lookupJobId ? (
          <p className="text-sm text-muted-foreground">The AI named no accounts this time.</p>
        ) : !lookup.done ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />
            Looking the accounts up on X, so only ones that exist are offered
          </p>
        ) : lookup.error ? (
          <p className="text-sm text-muted-foreground">{lookup.error}</p>
        ) : accounts.length ? (
          accounts.map((account) => {
            const key = `account:${account.handle}`
            return (
              <IdeaRow
                key={key}
                label={`@${account.handle}`}
                detail={[account.name, account.followers === null ? null : `${shortCount(account.followers)} followers`].filter(Boolean).join(" · ")}
                busy={adding === key}
                disabled={adding !== null}
                onAdd={() => void add(key, { kind: "account", value: account.handle })}
              />
            )
          })
        ) : (
          <p className="text-sm text-muted-foreground">{lookup.found.length ? "Every account has been added." : "None of the accounts the AI named exist on X."}</p>
        )}
      </section>
    </div>
  )
}

function ideaKey(idea: XKeywordIdea): string {
  return `${idea.kind}:${idea.value}`
}

function IdeaRow({
  label,
  detail,
  busy,
  disabled,
  onAdd,
}: {
  label: string
  detail: React.ReactNode
  busy: boolean
  disabled: boolean
  onAdd: () => void
}) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="grid min-w-0 flex-1">
        <span className="truncate text-sm">{label}</span>
        <span className="truncate text-xs text-muted-foreground">{detail}</span>
      </span>
      <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={onAdd}>
        {busy ? <Loader2Icon className="animate-spin" /> : <PlusIcon />}
        Add
      </Button>
    </div>
  )
}
