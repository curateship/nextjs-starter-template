import * as React from "react"
import { EllipsisVerticalIcon, EyeIcon, ListChecksIcon, Loader2Icon, PlusIcon, RotateCwIcon, SparklesIcon, TagIcon, XIcon } from "lucide-react"
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
  askMediumKeywordIdeas,
  changeMediumHidden,
  changeMediumKeyword,
  changeMediumPublication,
  getMediumErrorMessage,
  saveMediumKeyword,
  searchAllMedium,
  type KeywordIdea,
  type MediumModuleView,
} from "@/lib/api/social/medium"
import {
  MEDIUM_KEYWORD_KIND_WORDS,
  MEDIUM_KEYWORD_KINDS,
  MEDIUM_MARK_WORDS,
  mediumKeywordLabel,
  type MediumKeywordKind,
  type MediumKeywordMark,
  type MediumSpendPart,
} from "@/lib/social/medium/options"
import { keywordChipTimeText } from "@/lib/social/wording"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

import { KeywordPicker } from "../keyword-picker"
import { NetworkIcon } from "../network-icon"

type Keyword = MediumModuleView["keywords"][number]

/** What each kind's box asks for, and an example of it. */
const KIND_HINTS: Record<MediumKeywordKind, { hint: string; placeholder: string }> = {
  tag: { hint: "A Medium tag. Its ten newest stories are read off Medium's public feed.", placeholder: "project management" },
  search: { hint: "Words a reader would type into Medium's search. Read in the reader browser.", placeholder: "best tool for small teams" },
  publication: { hint: "A publication's address on Medium. Its newest stories are listed with no search words.", placeholder: "medium.com/better-programming" },
  writer: { hint: "A writer's address or @name on Medium. Their newest stories are listed.", placeholder: "@sam" },
}

/** "2 hours ago", "searching", "search failed", in the same words as Reddit's keywords. */
function keywordTime(keyword: Keyword): string {
  if (keyword.searching) return "searching"
  if (keyword.lastError) return "search failed"
  return keywordChipTimeText(keyword)
}

/** The parts of Medium's AI spend, in the More menu. */
const SPEND_PARTS: Array<[MediumSpendPart, string]> = [
  ["responses", "Responses"],
  ["articles", "Articles"],
  ["covers", "Covers"],
]

/** Cents as dollars: 420 is $4.20. */
function dollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

/**
 * The middle column's header: Medium's name, then on the right the search
 * box, the shared keywords dropdown, Jobs and More (Tyler, 21 Oct 2026, the
 * same for Reddit). Picking a
 * keyword lists its stories alone, All keywords lists every one. Add keyword
 * turns the list into Medium's add box, with the kind first, since a Medium
 * keyword is a tag, search words, a publication or a writer (parts 6 and 9).
 * The column's less used tools sit behind one More button: searching every
 * keyword, the AI's ideas (part 8), and the hidden writers and publications
 * (part 10), and the month's AI spend (part 41).
 */
export function MediumKeywords({
  view,
  failed,
  projectId,
  selectedId,
  search,
  onSelect,
  onChanged,
  onOpenJobs,
}: {
  view: MediumModuleView | null
  /** The module did not load, so the dropdown stops waiting for its keywords. */
  failed: boolean
  projectId: string
  selectedId: string | null
  /** The search box, drawn among the row's buttons on story tabs. */
  search: React.ReactNode
  onSelect: (keywordId: string | null) => void
  onChanged: () => Promise<void>
  onOpenJobs: () => void
}) {
  const [ideas, setIdeas] = React.useState<KeywordIdea[] | null>(null)
  const [asking, setAsking] = React.useState(false)
  const keywords = view?.keywords ?? []
  const jobsWaiting = view ? view.jobs.queued + view.jobs.running : 0
  // Nothing waiting starts without the browser program or a reader browser.
  const stalled = !view?.jobs.programRunning || !view.readerPicked

  async function act(action: () => Promise<unknown>, done?: string) {
    try {
      await action()
      await onChanged()
      if (done) toast.success(done)
    } catch (error) {
      showErrorToast(getMediumErrorMessage(error))
    }
  }

  async function askIdeas() {
    setAsking(true)
    try {
      setIdeas(await askMediumKeywordIdeas(projectId, keywords.map((keyword) => keyword.label)))
    } catch (error) {
      showErrorToast(getMediumErrorMessage(error))
    } finally {
      setAsking(false)
    }
  }

  return (
    <DashboardCardHeader className="flex-wrap items-center gap-x-3 gap-y-2">
      <DashboardCardHeaderIcon>
        <NetworkIcon network="medium" />
      </DashboardCardHeaderIcon>
      <h2 className={cn(dashboardCardHeadingClassName, "min-w-0 truncate")}>Medium</h2>

      <div className="ml-auto flex w-full min-w-0 items-center gap-2 sm:w-auto sm:shrink-0">
        {search}
        <KeywordPicker
          items={keywords.map((keyword) => ({
            id: keyword.id,
            label: keyword.label,
            count: keyword.waiting,
            badge: keyword.mark ? (
              <Hint label={MEDIUM_MARK_WORDS[keyword.mark]}>
                <TagIcon className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-label={MEDIUM_MARK_WORDS[keyword.mark]} />
              </Hint>
            ) : undefined,
            status: `${keyword.searching && stalled ? "waiting" : keywordTime(keyword)} · ${MEDIUM_KEYWORD_KIND_WORDS[keyword.kind].toLowerCase()}`,
            failed: keyword.lastError || null,
            enabled: keyword.enabled,
            running: keyword.searching,
            stalled,
            runHint: "Search again now",
            runningReason: stalled ? "A search is already waiting for the browser program. The Jobs page says why." : "Searching now",
          }))}
          loading={!view && !failed}
          selectedId={selectedId}
          allCount={view?.counts.toLook}
          onSelect={onSelect}
          onRun={(id) => act(() => changeMediumKeyword({ change: "search", keywordId: id }))}
          onSwitch={(id, enabled) => act(() => changeMediumKeyword({ change: "enabled", keywordId: id, enabled }))}
          menu={(item) => {
            const keyword = keywords.find((row) => row.id === item.id)
            return (
              <>
                {keyword?.kind === "search" ? (
                  <>
                    <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">What these words are</DropdownMenuLabel>
                    {(["", "you", "rival"] as const).map((mark) => (
                      <DropdownMenuItem key={mark || "plain"} onSelect={() => void act(() => changeMediumKeyword({ change: "mark", keywordId: item.id, mark }))}>
                        <TagIcon className={mark ? undefined : "opacity-0"} />
                        {mark ? MEDIUM_MARK_WORDS[mark] : "Ordinary search words"}
                        {keyword.mark === mark ? <span className="ml-auto text-xs text-muted-foreground">Picked</span> : null}
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuSeparator />
                  </>
                ) : null}
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() =>
                    void act(async () => {
                      await changeMediumKeyword({ change: "delete", keywordId: item.id })
                      // Its stories are gone, so listing them alone would show nothing.
                      if (item.id === selectedId) onSelect(null)
                    }, `${item.label} removed. Responses already sent keep their record.`)
                  }
                >
                  <XIcon />
                  Remove {item.label} and the stories only it found
                </DropdownMenuItem>
              </>
            )
          }}
          addForm={(close) => (
            <AddKeywordForm
              onAdd={async (input) => {
                try {
                  const saved = await saveMediumKeyword({ projectId, ...input })
                  close()
                  await onChanged()
                  if (saved.searchRefused) showErrorToast(`Saved, but not searched yet. ${saved.searchRefused}`)
                  else toast.success("Saved. Its stories show here once the reader has read them.")
                } catch (error) {
                  showErrorToast(getMediumErrorMessage(error))
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
          <Hint label="Search all, ideas, AI spend and hidden writers">
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" size="icon" aria-label="More">
                {asking ? <Loader2Icon className="animate-spin" /> : <EllipsisVerticalIcon />}
              </Button>
            </DropdownMenuTrigger>
          </Hint>
          <DropdownMenuContent align="end" className="w-72">
            <DropdownMenuItem
              onSelect={() => void act(async () => {
                if (!keywords.length) throw new Error("Add a keyword first, then it can be searched.")
                const { queued } = await searchAllMedium(projectId)
                if (!queued) throw new Error("Every switched-on keyword is already being searched.")
              }, "Searching every switched-on keyword.")}
            >
              <RotateCwIcon />
              Search every keyword now
            </DropdownMenuItem>
            <DropdownMenuItem disabled={asking} onSelect={() => void askIdeas()}>
              <SparklesIcon />
              Tag and publication ideas
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {/* Medium's AI this month (part 41). It sat in the header until
                Tyler moved it here on 21 Oct 2026, so the keywords dropdown
                could take its place. */}
            <DropdownMenuLabel className="flex items-center justify-between gap-2 text-xs font-normal text-muted-foreground">
              <span>Medium&apos;s AI this month</span>
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
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Writers and publications you never see</DropdownMenuLabel>
            {view?.hidden.length ? (
              view.hidden.map((hidden) => (
                <DropdownMenuItem key={hidden.id} onSelect={() => void act(() => changeMediumHidden({ change: "show", hiddenId: hidden.id }), `${hidden.name || hidden.value} shows again.`)}>
                  <EyeIcon />
                  <span className="truncate">Show {hidden.kind === "writer" ? `@${hidden.value}` : hidden.name || hidden.value} again</span>
                </DropdownMenuItem>
              ))
            ) : (
              <p className="px-2 py-1.5 text-sm text-muted-foreground">None hidden. Hide a writer or a publication from its story&apos;s row.</p>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        <Dialog open={ideas !== null} onOpenChange={(open) => (open ? null : setIdeas(null))}>
          <DialogContent variant="admin">
            <DialogHeader>
              <DialogTitle>Tag and publication ideas</DialogTitle>
              <DialogDescription>From the project&apos;s description. Add the ones worth searching.</DialogDescription>
            </DialogHeader>
            <DialogBody>
              <IdeasList
                ideas={ideas ?? []}
                onAdd={async (idea) => {
                  try {
                    if (idea.kind === "publication") {
                      const added = await changeMediumPublication({ change: "add", projectId, slug: idea.value })
                      if (added.checkRefused) showErrorToast(`Added to Publications, but not checked yet. ${added.checkRefused}`)
                      else toast.success("Added to the Publications tab.")
                    } else {
                      const saved = await saveMediumKeyword({ projectId, kind: idea.kind, value: idea.value })
                      if (saved.searchRefused) showErrorToast(`Saved, but not searched yet. ${saved.searchRefused}`)
                    }
                    setIdeas((current) => (current ?? []).filter((item) => item !== idea))
                    await onChanged()
                  } catch (error) {
                    showErrorToast(getMediumErrorMessage(error))
                  }
                }}
              />
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
  onAdd: (input: { kind: MediumKeywordKind; value: string; mark?: MediumKeywordMark }) => Promise<void>
  onCancel: () => void
}) {
  const [kind, setKind] = React.useState<MediumKeywordKind>("tag")
  const [value, setValue] = React.useState("")
  const [mark, setMark] = React.useState<MediumKeywordMark>("")
  const [tried, setTried] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const empty = !value.trim()

  async function add(event: React.FormEvent) {
    event.preventDefault()
    setTried(true)
    if (empty) {
      showErrorToast(`Type the ${MEDIUM_KEYWORD_KIND_WORDS[kind].toLowerCase()} first.`)
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
        <FieldLabel htmlFor="medium-keyword-kind">Kind</FieldLabel>
        <Select value={kind} onValueChange={(next) => setKind(next as MediumKeywordKind)}>
          <SelectTrigger id="medium-keyword-kind">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MEDIUM_KEYWORD_KINDS.map((item) => (
              <SelectItem key={item} value={item}>
                {MEDIUM_KEYWORD_KIND_WORDS[item]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-2">
        <FieldLabel htmlFor="medium-keyword-value" hint={KIND_HINTS[kind].hint}>
          {MEDIUM_KEYWORD_KIND_WORDS[kind]}
        </FieldLabel>
        <Input
          id="medium-keyword-value"
          value={value}
          autoFocus
          aria-invalid={(tried && empty) || undefined}
          placeholder={KIND_HINTS[kind].placeholder}
          onChange={(event) => setValue(event.target.value)}
        />
      </div>
      {kind === "search" ? (
        <div className="grid gap-2">
          <FieldLabel htmlFor="medium-keyword-mark" hint="Stories found by your product's own name, or a rival's, carry a chip and go first.">
            These words are
          </FieldLabel>
          <Select value={mark || "plain"} onValueChange={(next) => setMark(next === "plain" ? "" : (next as MediumKeywordMark))}>
            <SelectTrigger id="medium-keyword-mark">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="plain">Ordinary search words</SelectItem>
              <SelectItem value="you">{MEDIUM_MARK_WORDS.you}</SelectItem>
              <SelectItem value="rival">{MEDIUM_MARK_WORDS.rival}</SelectItem>
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

function IdeasList({ ideas, onAdd }: { ideas: KeywordIdea[]; onAdd: (idea: KeywordIdea) => Promise<void> }) {
  const [adding, setAdding] = React.useState<string | null>(null)
  if (!ideas.length) return <p className="text-sm text-muted-foreground">Every idea has been added.</p>
  return (
    <div className="grid gap-2">
      {ideas.map((idea) => {
        const key = `${idea.kind}:${idea.value}`
        return (
          <div key={key} className="flex min-w-0 items-center gap-2">
            <span className="grid min-w-0 flex-1">
              <span className="truncate text-sm">{mediumKeywordLabel(idea)}</span>
              <span className="text-xs text-muted-foreground">{idea.kind === "publication" ? "Publication, for the Publications tab" : MEDIUM_KEYWORD_KIND_WORDS[idea.kind]}</span>
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={adding !== null}
              onClick={async () => {
                setAdding(key)
                try {
                  await onAdd(idea)
                } finally {
                  setAdding(null)
                }
              }}
            >
              {adding === key ? <Loader2Icon className="animate-spin" /> : <PlusIcon />}
              Add
            </Button>
          </div>
        )
      })}
    </div>
  )
}
