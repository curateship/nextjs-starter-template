import * as React from "react"
import { BadgeCheckIcon, EyeOffIcon, Loader2Icon, MessageCircleIcon, RadarIcon, RssIcon, TagIcon, ThumbsUpIcon } from "lucide-react"

import { DashboardToolbarSearch } from "@/components/shared/dashboard-toolbar"
import { Hint } from "@/components/social/hint"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { LinkedinFindView } from "@/lib/api/social/linkedin"
import { LINKEDIN_MARK_WORDS, LINKEDIN_TIDY_AFTER_HOURS } from "@/lib/social/linkedin/options"
import { shortCount } from "@/lib/social/x/wording"
import { postedDateText } from "@/lib/social/wording"
import { cn } from "@/lib/utils"

import { XListError } from "../x/x-panel-frame"
import { linkedinFollowersText, writerWords } from "./linkedin-words"

type FindTab = "new" | "commented" | "skipped"

/** Each band's dot and name, the same three the other networks group their finds under. */
const BANDS: Array<{ band: LinkedinFindView["band"]; label: string; dot: string }> = [
  { band: "strong", label: "Strong fit", dot: "bg-emerald-500" },
  { band: "possible", label: "Possible", dot: "bg-amber-500" },
  { band: "low", label: "Low fit", dot: "bg-muted-foreground/40" },
]

const TIDY_DAYS = LINKEDIN_TIDY_AFTER_HOURS / 24

/** What an empty tab says, so "none found yet" and "none match" stay apart. */
function emptyWords(input: { tab: FindTab; hasKeywords: boolean; searched: boolean; hasSearcher: boolean }): string {
  if (input.searched) return `No post here matches those words. Typed words also look through posts older than ${TIDY_DAYS} days.`
  if (!input.hasKeywords) return "Add a keyword above, search words, a hashtag, or a person or company page to watch, and its posts show here."
  if (!input.hasSearcher) return "Nothing is searched until a LinkedIn search account is added under LinkedIn in Settings → Behaviour."
  if (input.tab === "commented") return "Nothing commented on yet. A post you comment on moves here."
  if (input.tab === "skipped") return "Nothing skipped."
  return `No posts to look at. They show here as the keywords are searched, and leave ${TIDY_DAYS} days after they went up. Type words in the search box to find older ones.`
}

/**
 * The posts, best to comment on first, grouped under the same three named
 * bands as the other networks' (parts 10, 12, 13, 14, 15 and 20). The score
 * is never shown; each row's tooltip says why it is where it is. On To look
 * at, rows can be ticked and skipped together.
 */
export function LinkedinFinds({
  tab,
  finds,
  loading,
  error,
  selectedId,
  everything,
  hasKeywords,
  hasSearcher,
  searched,
  onSelect,
  onSkip,
  onHide,
  onRetry,
}: {
  tab: FindTab
  finds: LinkedinFindView[]
  loading: boolean
  error: string | null
  selectedId: string | null
  /** Every keyword's posts together, so each row names its keywords. */
  everything: boolean
  hasKeywords: boolean
  hasSearcher: boolean
  /** Words are in the search box. */
  searched: boolean
  onSelect: (findId: string) => void
  onSkip: (findIds: string[]) => Promise<void>
  onHide: (findId: string) => Promise<void>
  onRetry: () => void
}) {
  const [rawTicked, setTicked] = React.useState<Set<string>>(new Set())
  const [skipping, setSkipping] = React.useState(false)
  const tickable = tab === "new"

  // A tick only counts while its row is on the list.
  const ticked = React.useMemo(() => {
    if (!tickable) return new Set<string>()
    const alive = new Set(finds.map((find) => find.id))
    return new Set([...rawTicked].filter((id) => alive.has(id)))
  }, [tickable, finds, rawTicked])
  const allTicked = finds.length > 0 && ticked.size === finds.length

  const grouped = React.useMemo(
    () => BANDS.map((band) => ({ ...band, rows: finds.filter((find) => find.band === band.band) })).filter((group) => group.rows.length),
    [finds]
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {ticked.size ? (
        <div className="flex h-11 shrink-0 items-center gap-3 border-b px-3">
          <Checkbox
            checked={allTicked ? true : "indeterminate"}
            aria-label="Tick every post listed"
            onCheckedChange={() => setTicked(allTicked ? new Set() : new Set(finds.map((find) => find.id)))}
          />
          <span className="text-sm whitespace-nowrap text-muted-foreground tabular-nums">{ticked.size} ticked</span>
          <Button type="button" variant="ghost" size="sm" onClick={() => setTicked(new Set())}>
            Clear
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={skipping}
            onClick={async () => {
              setSkipping(true)
              try {
                await onSkip([...ticked])
                setTicked(new Set())
              } finally {
                setSkipping(false)
              }
            }}
          >
            {skipping ? <Loader2Icon className="animate-spin" /> : null}
            Skip {ticked.size}
          </Button>
        </div>
      ) : null}
      <ScrollArea className="min-h-0 flex-1">
        {error ? (
          <XListError what="posts" error={error} onRetry={onRetry} />
        ) : loading && !finds.length ? (
          <p className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
            <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />
            Reading the posts
          </p>
        ) : !finds.length ? (
          <p className="p-4 text-sm text-muted-foreground">{emptyWords({ tab, hasKeywords, searched, hasSearcher })}</p>
        ) : (
          <div className="pb-3">
            {grouped.map((group) => (
              <section key={group.band} aria-label={`${group.label}, ${group.rows.length}`}>
                <h3 className="flex items-center gap-2 px-3 pt-4 pb-1.5 text-xs font-medium">
                  <span className={cn("size-2 rounded-full", group.dot)} aria-hidden="true" />
                  {group.label}
                  <span className="font-normal text-muted-foreground tabular-nums">{group.rows.length}</span>
                </h3>
                {group.rows.map((find) => (
                  <PostLine
                    key={find.id}
                    find={find}
                    everything={everything}
                    selected={find.id === selectedId}
                    tick={
                      tickable
                        ? {
                            checked: ticked.has(find.id),
                            onChange: (checked) =>
                              setTicked((current) => {
                                const next = new Set(current)
                                if (checked) next.add(find.id)
                                else next.delete(find.id)
                                return next
                              }),
                          }
                        : null
                    }
                    onSelect={() => onSelect(find.id)}
                    onHide={() => onHide(find.id)}
                  />
                ))}
              </section>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  )
}

/** The small chips before a post's words: Sells to, Names you or a rival, Watched, From a feed. */
export function LinkedinFindChips({ find }: { find: Pick<LinkedinFindView, "named" | "watched" | "matchedTitle" | "feedAccount"> }) {
  return (
    <>
      {find.matchedTitle ? (
        <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-sky-500/10 px-1.5 text-xs text-sky-700 dark:text-sky-400">
          <BadgeCheckIcon className="size-3" aria-hidden="true" />
          Sells to: {find.matchedTitle}
        </span>
      ) : null}
      {find.named ? (
        <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-emerald-500/10 px-1.5 text-xs text-emerald-700 dark:text-emerald-400">
          <TagIcon className="size-3" aria-hidden="true" />
          {LINKEDIN_MARK_WORDS[find.named]}
        </span>
      ) : null}
      {find.watched ? (
        <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-muted px-1.5 text-xs text-muted-foreground">
          <RadarIcon className="size-3" aria-hidden="true" />
          Watched
        </span>
      ) : null}
      {find.feedAccount ? (
        <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-muted px-1.5 text-xs text-muted-foreground">
          <RssIcon className="size-3" aria-hidden="true" />
          From {find.feedAccount.handle ? `in/${find.feedAccount.handle}` : "an account"}&apos;s feed
        </span>
      ) : null}
    </>
  )
}

/** One post: who and when, its words, then reactions, comments and Hide. */
function PostLine({
  find,
  everything,
  selected,
  tick,
  onSelect,
  onHide,
}: {
  find: LinkedinFindView
  everything: boolean
  selected: boolean
  tick: { checked: boolean; onChange: (checked: boolean) => void } | null
  onSelect: () => void
  onHide: () => Promise<void>
}) {
  const [hiding, setHiding] = React.useState(false)
  const who = [
    writerWords(find),
    linkedinFollowersText(find.author.followers),
    find.postedAt ? postedDateText(new Date(find.postedAt)) : null,
    everything && find.keywords.length ? find.keywords.join(", ") : null,
  ]
    .filter(Boolean)
    .join(" · ")
  const name = find.author.name || "this writer"

  return (
    <div
      className={cn(
        "group flex min-w-0 items-center gap-3 px-3 py-2.5 hover:bg-muted/50",
        selected && "bg-muted shadow-[inset_2px_0_0_var(--foreground)] hover:bg-muted"
      )}
    >
      {tick ? <Checkbox checked={tick.checked} aria-label={`Tick the post by ${name}`} onCheckedChange={(checked) => tick.onChange(checked === true)} /> : null}
      <Hint label={find.reason}>
        <button
          type="button"
          onClick={onSelect}
          aria-current={selected || undefined}
          className="grid min-w-0 flex-1 gap-0.5 rounded-sm text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <span className="flex min-w-0 flex-wrap items-center gap-1.5">
            <LinkedinFindChips find={find} />
            <span className="min-w-0 truncate text-xs text-muted-foreground">{who}</span>
          </span>
          <span className="line-clamp-2 text-sm">{find.text || "A post with no words, only a picture or a link."}</span>
        </button>
      </Hint>
      <Hint label="Reactions">
        <span className="flex w-12 shrink-0 items-center gap-1 text-xs text-muted-foreground tabular-nums">
          <ThumbsUpIcon className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="sr-only">Reactions </span>
          {shortCount(find.reactions)}
        </span>
      </Hint>
      <Hint label="Comments">
        <span className="flex w-12 shrink-0 items-center gap-1 text-xs text-muted-foreground tabular-nums">
          <MessageCircleIcon className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="sr-only">Comments </span>
          {shortCount(find.comments)}
        </span>
      </Hint>
      {find.status === "commented" || !find.author.slug ? (
        <span className="size-8 shrink-0" aria-hidden="true" />
      ) : (
        <Hint label={`Never see ${name} again`}>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="shrink-0 text-muted-foreground"
            aria-label={`Hide ${name}`}
            disabled={hiding}
            onClick={async () => {
              setHiding(true)
              try {
                await onHide()
              } finally {
                setHiding(false)
              }
            }}
          >
            {hiding ? <Loader2Icon className="size-4 animate-spin" /> : <EyeOffIcon className="size-4" />}
          </Button>
        </Hint>
      )}
    </div>
  )
}

/** The box that searches the posts by their words, the writer or their job title (part 20). */
export function LinkedinFindSearch({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <DashboardToolbarSearch
      name="linkedin-post-search"
      aria-label="Search these posts by their words, the writer or their job title"
      placeholder="Search"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      // Keeps room to type on a phone, where the keywords dropdown shares its row.
      className="min-w-28"
      inputClassName="sm:w-40 lg:w-40"
    />
  )
}
