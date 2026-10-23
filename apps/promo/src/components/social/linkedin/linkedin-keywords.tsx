import * as React from "react"
import {
  BadgeCheckIcon,
  BellIcon,
  BellOffIcon,
  EllipsisVerticalIcon,
  ExternalLinkIcon,
  EyeIcon,
  ListChecksIcon,
  Loader2Icon,
  PlusIcon,
  RotateCwIcon,
  SparklesIcon,
  TagIcon,
  Trash2Icon,
  UsersRoundIcon,
  XIcon,
} from "lucide-react"
import { toast } from "sonner"

import { DashboardCardHeader, DashboardCardHeaderIcon, dashboardCardHeadingClassName } from "@/components/shared/dashboard-card-header"
import { DashboardToolbarButton } from "@/components/shared/dashboard-toolbar"
import { Hint } from "@/components/social/hint"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
import { FormDialog } from "@/components/ui/form-dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import {
  askLinkedinKeywordIdeas,
  changeLinkedinGroup,
  changeLinkedinHidden,
  changeLinkedinKeyword,
  getLinkedinErrorMessage,
  loadLinkedinIdeaPeople,
  saveLinkedinBuyerTitles,
  saveLinkedinKeyword,
  searchAllLinkedin,
  type LinkedinFoundPerson,
  type LinkedinGroupView,
  type LinkedinIdeas,
  type LinkedinKeywordIdea,
  type LinkedinModuleView,
} from "@/lib/api/social/linkedin"
import {
  BUYER_TITLE_CHARS,
  LINKEDIN_KEYWORD_KIND_WORDS,
  LINKEDIN_KEYWORD_KINDS,
  LINKEDIN_KEYWORD_MARKS,
  LINKEDIN_MARK_WORDS,
  LINKEDIN_SEARCH_EVERY_HOURS,
  LINKEDIN_WATCH_EVERY_MINUTES,
  MAX_BUYER_TITLES,
  isWatchKind,
  linkedinKeywordLabel,
  type LinkedinKeywordKind,
  type LinkedinKeywordMark,
  type LinkedinSpendPart,
} from "@/lib/social/linkedin/options"
import { shortCount } from "@/lib/social/x/wording"
import { keywordChipTimeText, postedDateText } from "@/lib/social/wording"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

import { KeywordPicker } from "../keyword-picker"
import { NetworkIcon } from "../network-icon"

type Keyword = LinkedinModuleView["keywords"][number]

/** How often the people look-up is asked about while it runs. */
const LOOKUP_POLL_MS = 2_000

/** What each kind's box asks for, and an example of it. */
const KIND_HINTS: Record<LinkedinKeywordKind, { hint: string; placeholder: string }> = {
  search: {
    hint: `Words someone would write in a LinkedIn post. A search account reads LinkedIn's newest posts for them every ${LINKEDIN_SEARCH_EVERY_HOURS} hours.`,
    placeholder: "hiring my first salesperson",
  },
  hashtag: { hint: "A hashtag. A search account reads its newest posts.", placeholder: "#saas" },
  person: {
    hint: `A person's LinkedIn address. Their new posts are read every ${LINKEDIN_WATCH_EVERY_MINUTES} minutes on weekdays, and go to the top of To look at.`,
    placeholder: "linkedin.com/in/jane-doe",
  },
  company: {
    hint: `A company page's LinkedIn address. Its new posts are read every ${LINKEDIN_WATCH_EVERY_MINUTES} minutes on weekdays, and go to the top of To look at.`,
    placeholder: "linkedin.com/company/acme",
  },
}

/** "2 hours ago", "searching", "search failed", in the same words as the other networks' keywords. */
function keywordTime(keyword: Keyword): string {
  if (keyword.searching) return "searching"
  if (keyword.lastError) return "search failed"
  return keywordChipTimeText(keyword)
}

/** The parts of LinkedIn's AI spend, in the More menu (part 48). */
const SPEND_PARTS: Array<[LinkedinSpendPart, string]> = [
  ["comments", "Comments"],
  ["posts", "Posts and newsletters"],
  ["ideas", "Ideas"],
  ["people", "Connection notes"],
]

/** Cents as dollars: 420 is $4.20. */
function dollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

const dayFormat = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", timeZone: "UTC" })

/**
 * The middle column's header: LinkedIn's name, then on the right the search
 * box, the shared keywords dropdown, Jobs and More, the same row as X's. A
 * LinkedIn keyword is search words, a hashtag, or a person or company page
 * watched for its new posts (parts 10 and 12). Search words can be marked as
 * the product's own name or a rival's (part 15), and a watched one rings the
 * bell for its new posts unless its bell is off. More holds searching every
 * keyword, the AI's ideas (part 16), who the project sells to (part 14), the
 * groups (part 37), the AI spend (part 48) and the hidden people (part 17).
 */
export function LinkedinKeywords({
  view,
  failed,
  projectId,
  selectedId,
  search,
  onSelect,
  onChanged,
  onOpenJobs,
}: {
  view: LinkedinModuleView | null
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
  const [ideas, setIdeas] = React.useState<LinkedinIdeas | null>(null)
  const [asking, setAsking] = React.useState(false)
  const [openWindow, setOpenWindow] = React.useState<null | "buyers" | "groups">(null)
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
      showErrorToast(getLinkedinErrorMessage(error))
    }
  }

  async function askIdeas() {
    setAsking(true)
    try {
      setIdeas(await askLinkedinKeywordIdeas(projectId, keywords.map((keyword) => keyword.label)))
    } catch (error) {
      showErrorToast(getLinkedinErrorMessage(error))
    } finally {
      setAsking(false)
    }
  }

  return (
    <DashboardCardHeader className="flex-wrap items-center gap-x-3 gap-y-2">
      <DashboardCardHeaderIcon>
        <NetworkIcon network="linkedin" />
      </DashboardCardHeaderIcon>
      <h2 className={cn(dashboardCardHeadingClassName, "min-w-0 truncate")}>LinkedIn</h2>

      <div className="ml-auto flex w-full min-w-0 items-center gap-2 sm:w-auto sm:shrink-0">
        {search}
        <KeywordPicker
          items={keywords.map((keyword) => ({
            id: keyword.id,
            label: keyword.label,
            count: keyword.waiting,
            badge: keyword.mark ? (
              <Hint label={LINKEDIN_MARK_WORDS[keyword.mark]}>
                <TagIcon className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-label={LINKEDIN_MARK_WORDS[keyword.mark]} />
              </Hint>
            ) : isWatchKind(keyword.kind) && !keyword.notify ? (
              <Hint label="The bell is off for these new posts">
                <BellOffIcon className="size-3.5 shrink-0 text-muted-foreground" aria-label="The bell is off for these new posts" />
              </Hint>
            ) : undefined,
            status: `${keyword.searching && stalled ? "waiting" : keywordTime(keyword)} · ${LINKEDIN_KEYWORD_KIND_WORDS[keyword.kind].toLowerCase()}`,
            failed: keyword.lastError || null,
            enabled: keyword.enabled,
            running: keyword.searching,
            stalled,
            runHint: isWatchKind(keyword.kind) ? "Read the newest posts now" : "Search again now",
            runningReason: stalled ? "A search is already waiting for the browser program or a search account. The Jobs page says why." : "Searching now",
          }))}
          loading={!view && !failed}
          selectedId={selectedId}
          allCount={view?.counts.toLook}
          onSelect={onSelect}
          onRun={(id) => act(() => changeLinkedinKeyword({ change: "search", keywordId: id }))}
          onSwitch={(id, enabled) => act(() => changeLinkedinKeyword({ change: "enabled", keywordId: id, enabled }))}
          menu={(item) => {
            const keyword = keywords.find((row) => row.id === item.id)
            return (
              <>
                {keyword?.kind === "search" ? (
                  <>
                    <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">What these words are</DropdownMenuLabel>
                    {LINKEDIN_KEYWORD_MARKS.map((mark) => (
                      <DropdownMenuItem key={mark || "plain"} onSelect={() => void act(() => changeLinkedinKeyword({ change: "mark", keywordId: item.id, mark }))}>
                        <TagIcon className={mark ? undefined : "opacity-0"} />
                        {mark ? LINKEDIN_MARK_WORDS[mark] : "Ordinary search words"}
                        {keyword.mark === mark ? <span className="ml-auto text-xs text-muted-foreground">Picked</span> : null}
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuSeparator />
                  </>
                ) : null}
                {keyword && isWatchKind(keyword.kind) ? (
                  <>
                    <DropdownMenuItem
                      onSelect={() =>
                        void act(
                          () => changeLinkedinKeyword({ change: "notify", keywordId: item.id, notify: !keyword.notify }),
                          keyword.notify ? `The bell stays quiet for ${item.label}'s new posts.` : `The bell rings for each new post from ${item.label}.`
                        )
                      }
                    >
                      {keyword.notify ? <BellOffIcon /> : <BellIcon />}
                      {keyword.notify ? "Stop the bell for new posts" : "Ring the bell for new posts"}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                ) : null}
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() =>
                    void act(async () => {
                      await changeLinkedinKeyword({ change: "delete", keywordId: item.id })
                      // Its posts are gone, so listing them alone would show nothing.
                      if (item.id === selectedId) onSelect(null)
                    }, `${item.label} removed. Comments already sent keep their record.`)
                  }
                >
                  <Trash2Icon />
                  Remove {item.label} and the posts only it found
                </DropdownMenuItem>
              </>
            )
          }}
          addForm={(close) => (
            <AddKeywordForm
              onAdd={async (input) => {
                try {
                  const saved = await saveLinkedinKeyword({ projectId, ...input })
                  close()
                  await onChanged()
                  if (saved.searchRefused) showErrorToast(`Saved, but not searched yet. ${saved.searchRefused}`)
                  else toast.success("Saved. Its posts show here once a search account has read them.")
                } catch (error) {
                  showErrorToast(getLinkedinErrorMessage(error))
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
          <Hint label="Search all, ideas, who you sell to, groups, AI spend and hidden people">
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
                  const { queued } = await searchAllLinkedin(projectId)
                  if (!queued) throw new Error("Every switched-on keyword is already being searched.")
                }, "Searching every switched-on keyword.")
              }
            >
              <RotateCwIcon />
              Search every keyword now
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void askIdeas()}>
              <SparklesIcon />
              Search word and people ideas
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setOpenWindow("buyers")}>
              <BadgeCheckIcon />
              Who we sell to
              {view?.buyerTitles.length ? <span className="ml-auto text-xs text-muted-foreground tabular-nums">{view.buyerTitles.length}</span> : null}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setOpenWindow("groups")}>
              <UsersRoundIcon />
              Groups
              {view?.groups.length ? <span className="ml-auto text-xs text-muted-foreground tabular-nums">{view.groups.length}</span> : null}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="flex items-center justify-between gap-2 text-xs font-normal text-muted-foreground">
              <span>LinkedIn&apos;s AI this month</span>
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
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">People and pages you never see</DropdownMenuLabel>
            {view?.hidden.length ? (
              view.hidden.map((hidden) => (
                <DropdownMenuItem key={hidden.id} onSelect={() => void act(() => changeLinkedinHidden({ change: "show", hiddenId: hidden.id }), `${hidden.name || hidden.slug} shows again.`)}>
                  <EyeIcon />
                  <span className="truncate">Show {hidden.name || hidden.slug} again</span>
                </DropdownMenuItem>
              ))
            ) : (
              <p className="px-2 py-1.5 text-sm text-muted-foreground">Nobody hidden. Hide a writer from one of their posts&apos; rows.</p>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        <Dialog open={ideas !== null} onOpenChange={(open) => (open ? null : setIdeas(null))}>
          <DialogContent variant="admin">
            <DialogHeader>
              <DialogTitle>Search word and people ideas</DialogTitle>
              <DialogDescription>From the project&apos;s description. Add the ones worth searching or watching.</DialogDescription>
            </DialogHeader>
            <DialogBody>
              {ideas ? (
                <IdeasList
                  // A new ask starts the people look-up afresh.
                  key={ideas.lookupJobId ?? "none"}
                  ideas={ideas}
                  onAdd={async (input) => {
                    try {
                      const saved = await saveLinkedinKeyword({ projectId, kind: input.kind, value: input.value })
                      if (saved.searchRefused) showErrorToast(`Saved, but not searched yet. ${saved.searchRefused}`)
                      await onChanged()
                      return true
                    } catch (error) {
                      showErrorToast(getLinkedinErrorMessage(error))
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
        {openWindow === "buyers" ? (
          <BuyerTitlesWindow projectId={projectId} titles={view?.buyerTitles ?? []} onClose={() => setOpenWindow(null)} onChanged={onChanged} />
        ) : null}
        <GroupsWindow open={openWindow === "groups"} projectId={projectId} groups={view?.groups ?? []} onClose={() => setOpenWindow(null)} onChanged={onChanged} />
      </div>
    </DashboardCardHeader>
  )
}

function AddKeywordForm({
  onAdd,
  onCancel,
}: {
  onAdd: (input: { kind: LinkedinKeywordKind; value: string; mark?: LinkedinKeywordMark }) => Promise<void>
  onCancel: () => void
}) {
  const [kind, setKind] = React.useState<LinkedinKeywordKind>("search")
  const [value, setValue] = React.useState("")
  const [mark, setMark] = React.useState<LinkedinKeywordMark>("")
  const [tried, setTried] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const empty = !value.trim()

  async function add(event: React.FormEvent) {
    event.preventDefault()
    setTried(true)
    if (empty) {
      showErrorToast(`Type the ${LINKEDIN_KEYWORD_KIND_WORDS[kind].toLowerCase()} first.`)
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
        <FieldLabel htmlFor="linkedin-keyword-kind">Kind</FieldLabel>
        <Select value={kind} onValueChange={(next) => setKind(next as LinkedinKeywordKind)}>
          <SelectTrigger id="linkedin-keyword-kind">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LINKEDIN_KEYWORD_KINDS.map((item) => (
              <SelectItem key={item} value={item}>
                {LINKEDIN_KEYWORD_KIND_WORDS[item]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-2">
        <FieldLabel htmlFor="linkedin-keyword-value" hint={KIND_HINTS[kind].hint}>
          {LINKEDIN_KEYWORD_KIND_WORDS[kind]}
        </FieldLabel>
        <Input
          id="linkedin-keyword-value"
          value={value}
          autoFocus
          aria-invalid={(tried && empty) || undefined}
          placeholder={KIND_HINTS[kind].placeholder}
          onChange={(event) => setValue(event.target.value)}
        />
      </div>
      {kind === "search" ? (
        <div className="grid gap-2">
          <FieldLabel htmlFor="linkedin-keyword-mark" hint="Posts found by your product's own name, or a rival's, carry a chip and go first.">
            These words are
          </FieldLabel>
          <Select value={mark || "plain"} onValueChange={(next) => setMark(next === "plain" ? "" : (next as LinkedinKeywordMark))}>
            <SelectTrigger id="linkedin-keyword-mark">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="plain">Ordinary search words</SelectItem>
              <SelectItem value="you">{LINKEDIN_MARK_WORDS.you}</SelectItem>
              <SelectItem value="rival">{LINKEDIN_MARK_WORDS.rival}</SelectItem>
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

/**
 * The project's "who we sell to" job titles (part 14): a post whose writer's
 * job title holds every word of one of them is lifted in the list and
 * carries a "Sells to" chip. Saved together with Save changes.
 */
function BuyerTitlesWindow({
  projectId,
  titles,
  onClose,
  onChanged,
}: {
  projectId: string
  titles: string[]
  onClose: () => void
  onChanged: () => Promise<void>
}) {
  const [list, setList] = React.useState(titles)
  const [typed, setTyped] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const dirty = list.join("\n") !== titles.join("\n") || Boolean(typed.trim())

  function add() {
    const words = typed.trim().replace(/\s+/g, " ")
    if (!words) {
      showErrorToast("Type a job title first, such as founder or head of marketing.")
      return
    }
    if (words.length > BUYER_TITLE_CHARS) {
      showErrorToast(`A job title here is at most ${BUYER_TITLE_CHARS} characters.`)
      return
    }
    if (list.some((have) => have.toLowerCase() === words.toLowerCase())) {
      showErrorToast(`${words} is on the list already.`)
      return
    }
    if (list.length >= MAX_BUYER_TITLES) {
      showErrorToast(`A project holds at most ${MAX_BUYER_TITLES} job titles.`)
      return
    }
    setList([...list, words])
    setTyped("")
  }

  async function save() {
    setBusy(true)
    try {
      // A title still in the box counts, so Save never drops what was typed.
      const pending = typed.trim()
      await saveLinkedinBuyerTitles(projectId, pending ? [...list, pending] : list)
      await onChanged()
      toast.success("Saved. Posts are lifted by these titles from their next search.")
      onClose()
    } catch (error) {
      showErrorToast(getLinkedinErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <FormDialog open dirty={dirty} busy={busy} onClose={onClose}>
      {(requestClose) => (
        <DialogContent variant="admin">
          <DialogHeader>
            <DialogTitle>Who we sell to</DialogTitle>
            <DialogDescription>
              The job titles of the people this project sells to. A post by one of them goes up the list, because a comment there is read by a buyer.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Card size="sm">
              <CardHeader>
                <CardTitle>Job titles</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                {list.length ? (
                  <ul className="flex flex-wrap gap-2" aria-label="Job titles">
                    {list.map((title) => (
                      <li key={title} className="inline-flex items-center gap-1 rounded-md border bg-background py-0.5 pr-1 pl-2 text-sm">
                        {title}
                        <button
                          type="button"
                          aria-label={`Take ${title} off the list`}
                          className="rounded-sm p-0.5 text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                          onClick={() => setList(list.filter((have) => have !== title))}
                        >
                          <XIcon className="size-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">No titles yet. Posts are ranked by freshness, room and reach alone.</p>
                )}
                <form
                  className="grid gap-2"
                  onSubmit={(event) => {
                    event.preventDefault()
                    add()
                  }}
                >
                  <FieldLabel htmlFor="linkedin-buyer-title" hint="Every word must be in the writer's job title, in any order. Founder matches Co-founder and CEO.">
                    Add a job title
                  </FieldLabel>
                  <div className="flex gap-2">
                    <Input id="linkedin-buyer-title" value={typed} placeholder="head of marketing" onChange={(event) => setTyped(event.target.value)} />
                    <Button type="submit" variant="outline">
                      <PlusIcon />
                      Add
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={requestClose}>
              Cancel
            </Button>
            <Button type="button" disabled={busy} onClick={() => void save()}>
              {busy ? <Loader2Icon className="animate-spin" /> : null}
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </FormDialog>
  )
}

/**
 * The project's LinkedIn groups (part 37): added by pasting the group's
 * address, its rules read by a search account and handed to the AI before it
 * writes a post there. Rules LinkedIn shows only to members can be pasted by
 * hand. Each change saves at once, so the window ends with Done.
 */
function GroupsWindow({
  open,
  projectId,
  groups,
  onClose,
  onChanged,
}: {
  open: boolean
  projectId: string
  groups: LinkedinGroupView[]
  onClose: () => void
  onChanged: () => Promise<void>
}) {
  const [address, setAddress] = React.useState("")
  const [busy, setBusy] = React.useState<string | null>(null)

  async function run(key: string, action: () => Promise<void>) {
    setBusy(key)
    try {
      await action()
      await onChanged()
    } catch (error) {
      showErrorToast(getLinkedinErrorMessage(error))
    } finally {
      setBusy(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? null : onClose())}>
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>Groups</DialogTitle>
          <DialogDescription>LinkedIn groups this project posts in. A post into a group follows the group&apos;s rules, which the rules check reads too.</DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-6">
          <Card size="sm">
            <CardHeader>
              <CardTitle>Add a group</CardTitle>
            </CardHeader>
            <CardContent>
              <form
                className="grid gap-2"
                onSubmit={(event) => {
                  event.preventDefault()
                  if (!address.trim()) {
                    showErrorToast("Paste the group's address first.")
                    return
                  }
                  void run("add", async () => {
                    const added = await changeLinkedinGroup({ change: "add", projectId, address: address.trim() })
                    setAddress("")
                    if (added.readRefused) showErrorToast(`Added, but its rules are not read yet. ${added.readRefused}`)
                    else toast.success("Added. A search account reads its name and rules next.")
                  })
                }}
              >
                <FieldLabel htmlFor="linkedin-group-address">The group&apos;s address</FieldLabel>
                <div className="flex gap-2">
                  <Input id="linkedin-group-address" value={address} placeholder="linkedin.com/groups/1234567" onChange={(event) => setAddress(event.target.value)} />
                  <Button type="submit" variant="outline" disabled={busy === "add"}>
                    {busy === "add" ? <Loader2Icon className="animate-spin" /> : <PlusIcon />}
                    Add
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
          {groups.length ? (
            groups.map((group) => (
              <GroupCard
                key={group.id}
                group={group}
                busy={busy}
                onRead={() => run(`read:${group.id}`, async () => void (await changeLinkedinGroup({ change: "read", groupRowId: group.id })))}
                onRules={(rules) =>
                  run(`rules:${group.id}`, async () => {
                    await changeLinkedinGroup({ change: "rules", groupRowId: group.id, rules })
                    toast.success("Rules saved.")
                  })
                }
                onRemove={() =>
                  run(`remove:${group.id}`, async () => {
                    await changeLinkedinGroup({ change: "remove", groupRowId: group.id })
                    toast.success(`${group.name || "The group"} taken off this project.`)
                  })
                }
              />
            ))
          ) : (
            <p className="text-sm text-muted-foreground">No groups yet. Paste a group&apos;s address above.</p>
          )}
        </DialogBody>
        <DialogFooter>
          <Button type="button" onClick={onClose}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function GroupCard({
  group,
  busy,
  onRead,
  onRules,
  onRemove,
}: {
  group: LinkedinGroupView
  busy: string | null
  onRead: () => Promise<void>
  onRules: (rules: string) => Promise<void>
  onRemove: () => Promise<void>
}) {
  const [rules, setRules] = React.useState(group.rules)
  // Rules read again from LinkedIn replace the box's words, unless the box was
  // being changed, the way X's communities do.
  const [shownRules, setShownRules] = React.useState(group.rules)
  if (group.rules !== shownRules) {
    setShownRules(group.rules)
    if (rules === shownRules) setRules(group.rules)
  }
  const [confirmRemove, setConfirmRemove] = React.useState(false)
  const reading = group.reading || busy === `read:${group.id}`
  return (
    <Card size="sm">
      <CardHeader className="flex flex-row items-center gap-2">
        <CardTitle className="min-w-0 flex-1 truncate">{group.name || `Group ${group.groupId}`}</CardTitle>
        <Hint label="Open the group on LinkedIn">
          <Button type="button" size="icon" variant="ghost" asChild>
            <a href={group.url} target="_blank" rel="noreferrer" aria-label="Open the group on LinkedIn">
              <ExternalLinkIcon />
            </a>
          </Button>
        </Hint>
        <Hint label="Take the group off this project">
          <Button type="button" size="icon" variant="ghost" aria-label="Take the group off this project" disabled={busy === `remove:${group.id}`} onClick={() => setConfirmRemove(true)}>
            {busy === `remove:${group.id}` ? <Loader2Icon className="animate-spin" /> : <Trash2Icon />}
          </Button>
        </Hint>
      </CardHeader>
      <CardContent className="grid gap-4">
        <p className="text-xs text-muted-foreground">
          {[
            group.members === null ? null : `${shortCount(group.members)} members`,
            reading ? "Reading its rules now" : group.rulesReadAt ? `Rules read ${postedDateText(new Date(group.rulesReadAt)).toLowerCase()}` : "Rules not read yet",
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        <div className="grid gap-2">
          <FieldLabel htmlFor={`linkedin-group-rules-${group.id}`} hint="Read from the group's page, or pasted by hand when LinkedIn shows them only to members.">
            Its rules
          </FieldLabel>
          <Textarea id={`linkedin-group-rules-${group.id}`} value={rules} placeholder="No rules read or pasted yet" onChange={(event) => setRules(event.target.value)} />
        </div>
        {confirmRemove ? (
          <div className="flex flex-wrap items-center justify-end gap-2 rounded-md border p-2">
            <p className="min-w-0 flex-1 text-sm">Take this group off the project? Rules pasted by hand go with it. Nothing changes on LinkedIn.</p>
            <Button type="button" variant="outline" onClick={() => setConfirmRemove(false)}>
              Keep it
            </Button>
            <Button type="button" variant="destructive" disabled={busy === `remove:${group.id}`} onClick={() => void onRemove()}>
              {busy === `remove:${group.id}` ? <Loader2Icon className="animate-spin" /> : null}
              Take it off
            </Button>
          </div>
        ) : null}
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" disabled={reading} onClick={() => void onRead()}>
            {reading ? <Loader2Icon className="animate-spin" /> : <RotateCwIcon />}
            Read the rules again
          </Button>
          <Button type="button" disabled={busy === `rules:${group.id}`} onClick={() => void onRules(rules)}>
            {busy === `rules:${group.id}` ? <Loader2Icon className="animate-spin" /> : null}
            Save rules
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * The ideas: search words and hashtags at once, then the people and pages the
 * AI named, shown only once a search account has seen they exist on LinkedIn
 * (part 16).
 */
function IdeasList({ ideas, onAdd }: { ideas: LinkedinIdeas; onAdd: (input: { kind: LinkedinKeywordKind; value: string }) => Promise<boolean> }) {
  const [added, setAdded] = React.useState<Set<string>>(new Set())
  const [adding, setAdding] = React.useState<string | null>(null)
  const [lookup, setLookup] = React.useState<{ done: boolean; error: string; found: LinkedinFoundPerson[] }>({
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
      loadLinkedinIdeaPeople(jobId).then(
        (answer) => {
          if (!live) return
          setLookup(answer)
          if (!answer.done) timer = setTimeout(ask, LOOKUP_POLL_MS)
        },
        (failure: unknown) => {
          if (live) setLookup({ done: true, error: `The look-up could not be read. ${getLinkedinErrorMessage(failure)}`, found: [] })
        }
      )
    }
    ask()
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [ideas.lookupJobId])

  async function add(key: string, input: { kind: LinkedinKeywordKind; value: string }) {
    setAdding(key)
    try {
      if (await onAdd(input)) setAdded((current) => new Set(current).add(key))
    } finally {
      setAdding(null)
    }
  }

  const words = ideas.ideas.filter((idea) => !added.has(ideaKey(idea)))
  const people = lookup.found.filter((person) => !added.has(`${person.kind}:${person.slug}`))

  return (
    <div className="grid gap-6">
      <section className="grid gap-2" aria-label="Search words and hashtags">
        <p className="text-xs font-medium text-muted-foreground">Search words and hashtags</p>
        {words.length ? (
          words.map((idea) => {
            const key = ideaKey(idea)
            return (
              <IdeaRow
                key={key}
                label={linkedinKeywordLabel(idea)}
                detail={LINKEDIN_KEYWORD_KIND_WORDS[idea.kind]}
                busy={adding === key}
                onAdd={() => void add(key, { kind: idea.kind, value: idea.value })}
              />
            )
          })
        ) : (
          <p className="text-sm text-muted-foreground">{ideas.ideas.length ? "Every idea has been added." : "No search word ideas this time."}</p>
        )}
      </section>
      <section className="grid gap-2" aria-label="People and pages worth watching">
        <p className="text-xs font-medium text-muted-foreground">People and pages worth watching</p>
        {ideas.lookupRefused ? (
          <p className="text-sm text-muted-foreground">They could not be looked up on LinkedIn. {ideas.lookupRefused}</p>
        ) : !ideas.lookupJobId ? (
          <p className="text-sm text-muted-foreground">The AI named nobody this time.</p>
        ) : !lookup.done ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />
            Looking them up on LinkedIn, so only ones that exist are offered
          </p>
        ) : lookup.error ? (
          <p className="text-sm text-muted-foreground">{lookup.error}</p>
        ) : people.length ? (
          people.map((person) => {
            const key = `${person.kind}:${person.slug}`
            return (
              <IdeaRow
                key={key}
                label={person.name || linkedinKeywordLabel({ kind: person.kind, value: person.slug })}
                detail={[
                  linkedinKeywordLabel({ kind: person.kind, value: person.slug }),
                  person.headline || null,
                  person.followers === null ? null : `${shortCount(person.followers)} followers`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
                busy={adding === key}
                onAdd={() => void add(key, { kind: person.kind, value: person.slug })}
              />
            )
          })
        ) : (
          <p className="text-sm text-muted-foreground">{lookup.found.length ? "Every one has been added." : "None of the people or pages the AI named exist on LinkedIn."}</p>
        )}
      </section>
    </div>
  )
}

function ideaKey(idea: LinkedinKeywordIdea): string {
  return `${idea.kind}:${idea.value}`
}

function IdeaRow({ label, detail, busy, onAdd }: { label: string; detail: React.ReactNode; busy: boolean; onAdd: () => void }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="grid min-w-0 flex-1">
        <span className="truncate text-sm">{label}</span>
        <span className="truncate text-xs text-muted-foreground">{detail}</span>
      </span>
      <Button type="button" variant="outline" size="sm" disabled={busy} onClick={onAdd}>
        {busy ? <Loader2Icon className="animate-spin" /> : <PlusIcon />}
        Add
      </Button>
    </div>
  )
}
