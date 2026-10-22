import * as React from "react"
import { EyeOffIcon, HandIcon, Loader2Icon, LockIcon, MessageSquareIcon, MessageSquareTextIcon, RefreshCwIcon, TagIcon } from "lucide-react"

import { DashboardToolbarSearch } from "@/components/shared/dashboard-toolbar"
import { Hint } from "@/components/social/hint"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { MediumFindView } from "@/lib/api/social/medium"
import { MEDIUM_MARK_WORDS } from "@/lib/social/medium/options"
import { followersText } from "@/lib/social/medium/wording"
import { postedDateText } from "@/lib/social/wording"
import { cn } from "@/lib/utils"

/** Each band's dot and name, the same three Reddit groups its posts under. */
const BANDS: Array<{ band: MediumFindView["band"]; label: string; dot: string }> = [
  { band: "strong", label: "Strong fit", dot: "bg-emerald-500" },
  { band: "possible", label: "Possible", dot: "bg-amber-500" },
  { band: "low", label: "Low fit", dot: "bg-muted-foreground/40" },
]

/** What an empty tab says, so "none found yet" and "none match" stay apart. */
function emptyWords(input: { tab: "new" | "replied" | "skipped"; hasKeywords: boolean; searched: boolean; readerPicked: boolean }): string {
  if (input.searched) return "No story here matches those words."
  if (!input.hasKeywords) return "Add a keyword above, a tag, search words, a publication or a writer, and its stories show here."
  if (!input.readerPicked) return "Nothing is searched until a reader browser is picked in Settings → Behaviour."
  if (input.tab === "replied") return "Nothing replied to yet. A story you respond to moves here."
  if (input.tab === "skipped") return "Nothing skipped."
  return "No stories to look at. They show here as the keywords are searched."
}

/**
 * The stories, best to respond to first, grouped under the same three named
 * bands as Reddit's posts (parts 6, 11, 13 and 14). The score itself is never
 * shown; each row's tooltip says why it is where it is. A story found by
 * several keywords is one row. On To look at, rows can be ticked and skipped
 * together, as on Reddit (Tyler, 13 Oct 2026).
 */
export function MediumStories({
  tab,
  finds,
  loading,
  error,
  selectedId,
  everything,
  hasKeywords,
  readerPicked,
  searched,
  onSelect,
  onSkip,
  onHide,
  onRetry,
}: {
  tab: "new" | "replied" | "skipped"
  finds: MediumFindView[]
  loading: boolean
  error: string | null
  selectedId: string | null
  /** Every keyword's stories together, so each row names its keywords. */
  everything: boolean
  hasKeywords: boolean
  readerPicked: boolean
  /** Words are in the search box. */
  searched: boolean
  onSelect: (findId: string) => void
  onSkip: (findIds: string[]) => Promise<void>
  onHide: (findId: string, kind: "writer" | "publication") => Promise<void>
  onRetry: () => void
}) {
  const [rawTicked, setTicked] = React.useState<Set<string>>(new Set())
  const [skipping, setSkipping] = React.useState(false)
  const tickable = tab === "new"

  // A tick only counts while its row is on screen.
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
            aria-label="Tick every story listed"
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
          <div className="grid justify-items-start gap-3 p-4">
            <p className="text-sm text-muted-foreground">The stories could not be read. {error}</p>
            <Button type="button" variant="outline" onClick={onRetry}>
              <RefreshCwIcon />
              Try again
            </Button>
          </div>
        ) : loading && !finds.length ? (
          <p className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
            <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />
            Reading the stories
          </p>
        ) : !finds.length ? (
          <p className="p-4 text-sm text-muted-foreground">{emptyWords({ tab, hasKeywords, searched, readerPicked })}</p>
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
                  <StoryLine
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
                    onHide={(kind) => onHide(find.id, kind)}
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

/** One story: its title, who and where and when, then claps, responses and Hide. */
function StoryLine({
  find,
  everything,
  selected,
  tick,
  onSelect,
  onHide,
}: {
  find: MediumFindView
  everything: boolean
  selected: boolean
  tick: { checked: boolean; onChange: (checked: boolean) => void } | null
  onSelect: () => void
  onHide: (kind: "writer" | "publication") => Promise<void>
}) {
  const [hiding, setHiding] = React.useState(false)
  const where = [
    find.writer.name || (find.writer.handle ? `@${find.writer.handle}` : null),
    find.publication?.name ?? null,
    find.postedAt ? postedDateText(find.postedAt) : null,
    followersText(find.writer.followers),
    everything && find.keywords.length ? find.keywords.join(", ") : null,
  ]
    .filter(Boolean)
    .join(" · ")

  return (
    <div
      className={cn(
        "group flex min-w-0 items-center gap-3 px-3 py-2.5 hover:bg-muted/50",
        selected && "bg-muted shadow-[inset_2px_0_0_var(--foreground)] hover:bg-muted"
      )}
    >
      {tick ? <Checkbox checked={tick.checked} aria-label={`Tick ${find.title}`} onCheckedChange={(checked) => tick.onChange(checked === true)} /> : null}
      <Hint label={find.reason}>
        <button
          type="button"
          onClick={onSelect}
          aria-current={selected || undefined}
          className="grid min-w-0 flex-1 gap-0.5 rounded-sm text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <span className="flex min-w-0 items-center gap-1.5">
            {find.named ? (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-emerald-500/10 px-1.5 text-xs text-emerald-700 dark:text-emerald-400">
                <TagIcon className="size-3" aria-hidden="true" />
                {MEDIUM_MARK_WORDS[find.named]}
              </span>
            ) : null}
            <span className="truncate text-sm">{find.title}</span>
          </span>
          <span className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
            <span className="truncate">{where}</span>
            {find.membersOnly ? <LockIcon className="size-3.5 shrink-0" role="img" aria-label="Members-only: only its opening can be read" /> : null}
            {find.read ? <MessageSquareTextIcon className="size-3.5 shrink-0" role="img" aria-label="Read in full, ready to answer" /> : null}
          </span>
        </button>
      </Hint>
      <Hint label="Claps">
        <span className="flex w-14 shrink-0 items-center gap-1 text-xs text-muted-foreground tabular-nums">
          <HandIcon className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="sr-only">Claps </span>
          {find.claps}
        </span>
      </Hint>
      <Hint label="Responses">
        <span className="flex w-14 shrink-0 items-center gap-1 text-xs text-muted-foreground tabular-nums">
          <MessageSquareIcon className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="sr-only">Responses </span>
          {find.responseCount}
        </span>
      </Hint>
      {find.status === "commented" ? (
        <span className="size-8 shrink-0" aria-hidden="true" />
      ) : (
        <DropdownMenu>
          <Hint label="Never see this writer or publication again">
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" size="icon" className="shrink-0 text-muted-foreground" aria-label={`Hide the writer or publication of ${find.title}`} disabled={hiding}>
                {hiding ? <Loader2Icon className="size-4 animate-spin" /> : <EyeOffIcon className="size-4" />}
              </Button>
            </DropdownMenuTrigger>
          </Hint>
          <DropdownMenuContent align="end">
            {(["writer", "publication"] as const).map((kind) =>
              kind === "publication" && !find.publication ? null : (
                <DropdownMenuItem
                  key={kind}
                  onSelect={async () => {
                    setHiding(true)
                    try {
                      await onHide(kind)
                    } finally {
                      setHiding(false)
                    }
                  }}
                >
                  <EyeOffIcon />
                  Hide {kind === "writer" ? find.writer.name || `@${find.writer.handle}` : find.publication?.name}
                </DropdownMenuItem>
              )
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  )
}

/** The box that searches the stories by title or writer (part 11). */
export function MediumStorySearch({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <DashboardToolbarSearch
      name="medium-story-search"
      aria-label="Search these stories by title or writer"
      placeholder="Search"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      // Keeps room to type on a phone, where the keywords dropdown shares its row.
      className="min-w-28"
      inputClassName="sm:w-40 lg:w-40"
    />
  )
}
