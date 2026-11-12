import * as React from "react"
import { CheckIcon, ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react"
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"

import { HabitIconGlyph } from "@/components/project/habit-icons"
import { BlockTabs } from "@/components/project/notes/project-block-card"
import { Button } from "@/components/ui/button"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { ErrorRow } from "@/components/ui/error-row"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { LoadingRow } from "@/components/ui/loading-row"
import {
  findInJournal,
  loadMonthOfTicksPage,
  loadYearOfRatingsPage,
  type JournalDay,
  type JournalHit,
  type MonthOfTicks,
  type WeekDot,
} from "@/lib/api/project/daily-card"
import { DAILY_LIMITS, DAY_RATING_TOP } from "@/lib/project/daily-card"
import { addDays, dayLabel } from "@/lib/project/days"
import { getProjectErrorMessage } from "@/lib/project/errors"
import { focusRingInset } from "@/lib/layout/focus-ring"
import { cn } from "@/lib/utils"

type Loaded<T> = { state: "loading" } | { state: "error"; message: string } | { state: "ready"; value: T }

/** Loads `load()` whenever `key` changes, with its loading and error states. */
function useLoaded<T>(key: string, load: () => Promise<T>) {
  const [loaded, setLoaded] = React.useState<{ key: string; result: Loaded<T> } | null>(null)
  const [tries, setTries] = React.useState(0)
  const loadRef = React.useRef(load)
  React.useEffect(() => {
    loadRef.current = load
  })
  React.useEffect(() => {
    let live = true
    loadRef.current().then(
      (value) => live && setLoaded({ key, result: { state: "ready", value } }),
      (error: unknown) => live && setLoaded({ key, result: { state: "error", message: getProjectErrorMessage(error) } })
    )
    return () => {
      live = false
    }
  }, [key, tries])
  const result: Loaded<T> = loaded?.key === key ? loaded.result : { state: "loading" }
  return [result, () => setTries((n) => n + 1)] as const
}

/**
 * The site admin's look back (Tyler, 29 Oct 2026): a month of ticks, a year
 * of ratings, and a search through the journal. Only they can see it. Since
 * 11 Nov 2026 it is a "/" block on their own page (Tyler: "turn look back and
 * inbox tabs into blocks"); before, a graph in the panel's header swapped the
 * page for it. The block holds its tabs and the tab showing, and the block's
 * tile scrolls a long tab, as every block's does.
 */
export function LookBackTabs() {
  const [tab, setTab] = React.useState<"month" | "year" | "search">("month")
  return (
    <>
      <BlockTabs
        value={tab}
        onValueChange={(value) => setTab(value as typeof tab)}
        tabs={[
          { value: "month", label: "Month" },
          { value: "year", label: "Year" },
          { value: "search", label: "Search" },
        ]}
      />
      {/* minmax(0, 1fr): nothing here widens the panel. */}
      <div className="grid grid-cols-[minmax(0,1fr)] p-3">
        {tab === "month" ? <MonthTab /> : tab === "year" ? <YearTab /> : <SearchTab />}
      </div>
    </>
  )
}

function thisMonth() {
  return new Date().toISOString().slice(0, 7)
}

function monthLabel(month: string) {
  return new Date(`${month}-15T12:00:00Z`).toLocaleDateString("en", { month: "long", year: "numeric", timeZone: "UTC" })
}

function shiftMonth(month: string, by: number) {
  const [year, number] = month.split("-").map(Number)
  const date = new Date(Date.UTC(year, number - 1 + by, 15))
  return date.toISOString().slice(0, 7)
}

function MonthTab() {
  const [month, setMonth] = React.useState(thisMonth)
  const [loaded, retry] = useLoaded(month, () => loadMonthOfTicksPage(month))
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-3">
      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" size="icon" aria-label="The month before" onClick={() => setMonth(shiftMonth(month, -1))}>
          <ChevronLeftIcon className="size-4" />
        </Button>
        <span className="min-w-0 flex-1 truncate text-center text-sm font-medium">{monthLabel(month)}</span>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="The month after"
          disabled={month >= thisMonth()}
          onClick={() => setMonth(shiftMonth(month, 1))}
        >
          <ChevronRightIcon className="size-4" />
        </Button>
      </div>
      {loaded.state === "loading" ? (
        <LoadingRow label="Loading the month" />
      ) : loaded.state === "error" ? (
        <ErrorRow message={loaded.message} onRetry={retry} />
      ) : (
        <MonthGrid month={loaded.value} />
      )}
    </div>
  )
}

/** Monday first, as the card's week of dots. */
const WEEKDAY_LETTERS = ["M", "T", "W", "T", "F", "S", "S"]

/** Days that count for a habit so far: done, missed, or today not done yet. */
function countedDays(cells: WeekDot[]) {
  return cells.filter((cell) => cell === "done" || cell === "missed" || cell === "open").length
}

/** A day's shade: stronger the more of its habits were done. */
function shareLook(done: number, counted: number) {
  const share = done / counted
  if (share >= 1) return "bg-primary text-primary-foreground"
  if (share > 2 / 3) return "bg-primary/75 text-primary-foreground"
  if (share > 1 / 3) return "bg-primary/50"
  return "bg-primary/25"
}

/**
 * The month as one calendar, Monday first, each day shaded by how many of
 * its habits were done, the full width of the panel, as is the row of
 * arrows above it (Tyler, 30 Oct 2026: "this should be full width"). Under it, a folded card for
 * each day so far, newest first (Tyler, 30 Oct 2026, in place of Today's
 * habits: "replace it with collapsible card for each day of the month. Day
 * on the left and rating on the right, uncollapse it to show all the checked
 * habits and notes for that day"). This is where the journal's past days
 * are read.
 */
function MonthGrid({ month }: { month: MonthOfTicks }) {
  const [year, monthNumber] = month.month.split("-").map(Number)
  // Blank cells before the 1st, so it lands under its weekday.
  const lead = (new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay() + 6) % 7
  const daysSoFar = month.days.map((day, index) => ({ day, index })).filter(({ day }) => day <= month.today).reverse()
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      {month.habits.length ? (
        <ol className="grid grid-cols-7 gap-1 text-[11px] tabular-nums" aria-label={monthLabel(month.month)}>
          {WEEKDAY_LETTERS.map((letter, index) => (
            <li key={`h${index}`} aria-hidden className="flex h-5 items-center justify-center text-muted-foreground">
              {letter}
            </li>
          ))}
          {Array.from({ length: lead }, (_, index) => (
            <li key={`b${index}`} aria-hidden />
          ))}
          {month.days.map((day, index) => (
            <MonthDay key={day} day={day} cells={month.habits.map((item) => item.cells[index])} />
          ))}
        </ol>
      ) : null}
      {daysSoFar.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing in {monthLabel(month.month)} yet.</p>
      ) : (
        <ul className="grid grid-cols-[minmax(0,1fr)] gap-2" aria-label={`Days of ${monthLabel(month.month)}`}>
          {daysSoFar.map(({ day, index }) => (
            <DayCard
              key={day}
              day={day}
              journal={month.journal[day] ?? null}
              ticked={month.habits.filter((habit) => habit.cells[index] === "done")}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

function MonthDay({ day, cells }: { day: string; cells: WeekDot[] }) {
  const done = cells.filter((cell) => cell === "done").length
  const counted = countedDays(cells)
  const open = cells.includes("open")
  const words = counted ? `${done} of ${counted} ${counted === 1 ? "habit" : "habits"} done` : "nothing to do"
  return (
    <li
      aria-label={`${dayLabel(day)}: ${words}`}
      className={cn(
        "flex aspect-square items-center justify-center rounded-sm",
        done ? shareLook(done, counted) : open ? "border border-dashed border-primary" : counted ? "border border-muted-foreground/60" : "text-muted-foreground/60"
      )}
    >
      {Number(day.slice(8))}
    </li>
  )
}

/** One day under the calendar: folded to its date and rating, opened to the habits ticked and what was written. */
function DayCard({ day, journal, ticked }: { day: string; journal: JournalDay | null; ticked: MonthOfTicks["habits"] }) {
  const words: { label: string; text: string }[] = journal
    ? [
        { label: "Win of the day", text: journal.win },
        { label: "A note about today", text: journal.note },
      ].filter((part) => part.text)
    : []
  const nothing = ticked.length === 0 && words.length === 0
  return (
    <li>
      <Collapsible className="group/day rounded-md border text-sm">
        <CollapsibleTrigger asChild>
          <button type="button" className={cn("flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left", focusRingInset)}>
            <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=closed]/day:-rotate-90" />
            <span className="min-w-0 flex-1 truncate font-medium">{dayLabel(day)}</span>
            {journal?.rating ? (
              <span className={cn("rounded-sm px-1.5 text-xs leading-5 tabular-nums", RATING_LOOK[journal.rating])}>{journal.rating} of {DAY_RATING_TOP}</span>
            ) : (
              <span className="text-xs text-muted-foreground">Not rated</span>
            )}
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="grid grid-cols-[minmax(0,1fr)] gap-3 px-3 pb-3">
          {nothing ? <p className="text-muted-foreground">Nothing ticked or written.</p> : null}
          {ticked.length ? (
            <div className="grid gap-1">
              <span className="text-xs text-muted-foreground">Habits done</span>
              <ul className="grid gap-1">
                {ticked.map((habit) => (
                  <li key={habit.id} className="flex items-center gap-2">
                    <HabitIconGlyph icon={habit.icon} className="size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{habit.name}</span>
                    <CheckIcon className="size-3.5 shrink-0" aria-label="Done" />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {words.map((part) => (
            <div key={part.label} className="grid gap-0.5">
              <span className="text-xs text-muted-foreground">{part.label}</span>
              <p className="whitespace-pre-line">{part.text}</p>
            </div>
          ))}
        </CollapsibleContent>
      </Collapsible>
    </li>
  )
}

/** A rating's square: stronger for a better day. */
const RATING_LOOK: Record<number, string> = {
  1: "bg-primary/10",
  2: "bg-primary/15",
  3: "bg-primary/25",
  4: "bg-primary/35",
  5: "bg-primary/45 text-primary-foreground",
  6: "bg-primary/55 text-primary-foreground",
  7: "bg-primary/65 text-primary-foreground",
  8: "bg-primary/75 text-primary-foreground",
  9: "bg-primary/90 text-primary-foreground",
  10: "bg-primary text-primary-foreground",
}
const RATINGS = Array.from({ length: DAY_RATING_TOP }, (_, index) => index + 1)

function YearTab() {
  const [year, setYear] = React.useState(() => new Date().getUTCFullYear())
  const [loaded, retry] = useLoaded(String(year), () => loadYearOfRatingsPage(year))
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-3">
      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" size="icon" aria-label="The year before" onClick={() => setYear(year - 1)}>
          <ChevronLeftIcon className="size-4" />
        </Button>
        <span className="min-w-0 flex-1 text-center text-sm font-medium">{year}</span>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="The year after"
          disabled={year >= new Date().getUTCFullYear()}
          onClick={() => setYear(year + 1)}
        >
          <ChevronRightIcon className="size-4" />
        </Button>
      </div>
      {loaded.state === "loading" ? (
        <LoadingRow label="Loading the year" />
      ) : loaded.state === "error" ? (
        <ErrorRow message={loaded.message} onRetry={retry} />
      ) : (
        <YearGrid year={year} ratings={loaded.value.ratings} />
      )}
    </div>
  )
}

/**
 * The year as twelve small month calendars, Monday first, each day's square
 * stronger for a better rating. They fill the panel's width, two across in a
 * narrow panel and more as it widens (Tyler, 30 Oct 2026: "fix the year
 * tab", after one long row of squares per month ran off the panel). A rated
 * square shows its number ("place the rating here"), with a key from 1 to 10
 * above for the shades.
 */
function YearGrid({ year, ratings }: { year: number; ratings: Record<string, number> }) {
  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-1 text-xs text-muted-foreground" aria-hidden>
        <span className="mr-1">Rating</span>
        {RATINGS.map((rating) => (
          <span key={rating} className={cn("flex size-4 items-center justify-center rounded-sm text-[9px]", RATING_LOOK[rating])}>
            {rating}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] gap-x-4 gap-y-3">
        {Array.from({ length: 12 }, (_, index) => {
          const month = `${year}-${String(index + 1).padStart(2, "0")}`
          const days: string[] = []
          for (let day = `${month}-01`; day.startsWith(month); day = addDays(day, 1)) days.push(day)
          // Blank squares before the 1st, so it lands under its weekday.
          const lead = (new Date(Date.UTC(year, index, 1)).getUTCDay() + 6) % 7
          const name = new Date(`${month}-15T12:00:00Z`).toLocaleDateString("en", { month: "short", timeZone: "UTC" })
          return (
            <div key={month} className="grid gap-1">
              <span className="text-xs text-muted-foreground">{name}</span>
              <ol className="grid grid-cols-7 gap-0.5" aria-label={`${name} ${year}`}>
                {Array.from({ length: lead }, (_, blank) => (
                  <li key={`b${blank}`} aria-hidden />
                ))}
                {days.map((day) => {
                  const rating = ratings[day]
                  return (
                    <li
                      key={day}
                      aria-label={`${dayLabel(day)}: ${rating ? `${rating} out of ${DAY_RATING_TOP}` : "not rated"}`}
                      className={cn(
                        "flex aspect-square items-center justify-center rounded-[2px] text-[9px] leading-none tabular-nums",
                        rating ? RATING_LOOK[rating] : "bg-muted"
                      )}
                    >
                      {/* The rating itself in its square (Tyler, 30 Oct 2026: "place the rating here"). */}
                      {rating ? <span aria-hidden>{rating}</span> : null}
                    </li>
                  )
                })}
              </ol>
            </div>
          )
        })}
      </div>
    </div>
  )
}

const FIELD_WORDS: Record<JournalHit["field"], string> = {
  win: "Win",
  note: "Note",
}

function SearchTab() {
  const [draft, setDraft] = React.useState("")
  const [q, setQ] = React.useState("")
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-3">
      <form
        className="grid gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          setQ(draft.trim())
        }}
      >
        <Label htmlFor="daily-journal-search">Find a word in your wins and notes</Label>
        <div className="flex gap-2">
          <Input
            id="daily-journal-search"
            value={draft}
            maxLength={DAILY_LIMITS.search}
            onChange={(event) => setDraft(event.target.value)}
          />
          <Button type="submit" variant="outline">
            Search
          </Button>
        </div>
      </form>
      {q ? <SearchResults q={q} /> : null}
    </div>
  )
}

function SearchResults({ q }: { q: string }) {
  const [loaded, retry] = useLoaded(q, () => findInJournal(q))
  if (loaded.state === "loading") return <LoadingRow label="Searching your journal" />
  if (loaded.state === "error") return <ErrorRow message={loaded.message} onRetry={retry} />
  if (loaded.value.length === 0) return <p className="text-sm text-muted-foreground">Nothing in your journal says "{q}".</p>
  return (
    <ul className="grid gap-2">
      {loaded.value.map((hit) => (
        <li key={`${hit.day}:${hit.field}`} className="grid gap-0.5 rounded-md border px-3 py-2 text-sm">
          <span className="text-xs text-muted-foreground">
            {dayLabel(hit.day)} · {FIELD_WORDS[hit.field]}
          </span>
          <span>{hit.text}</span>
        </li>
      ))}
    </ul>
  )
}

/**
 * The Rating calendar block on the site admin's page (task "My
 * dashboard/left-panel-blocks", Tyler, 6 Nov 2026: "I mean the yearly
 * rating"): one month laid out as the Month tab is, Monday first under the
 * month's arrows, each day's square shaded by its rating as the Year tab
 * shades them, with its date in the middle and its rating in the corner. Days to come are faded. It only shows:
 * a day is rated with Rate your day.
 */
export function RatingMonth({ today }: { today: string }) {
  const [month, setMonth] = React.useState(() => today.slice(0, 7))
  const year = Number(month.slice(0, 4))
  const [loaded, retry] = useLoaded(String(year), () => loadYearOfRatingsPage(year))
  const [, monthNumber] = month.split("-").map(Number)
  const lead = (new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay() + 6) % 7
  const days: string[] = []
  for (let day = `${month}-01`; day.startsWith(month); day = addDays(day, 1)) days.push(day)
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-3">
      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" size="icon" aria-label="The month before" onClick={() => setMonth(shiftMonth(month, -1))}>
          <ChevronLeftIcon className="size-4" />
        </Button>
        <span className="min-w-0 flex-1 truncate text-center text-sm font-medium">{monthLabel(month)}</span>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="The month after"
          disabled={month >= today.slice(0, 7)}
          onClick={() => setMonth(shiftMonth(month, 1))}
        >
          <ChevronRightIcon className="size-4" />
        </Button>
      </div>
      {loaded.state === "loading" ? (
        <LoadingRow label="Loading the ratings" />
      ) : loaded.state === "error" ? (
        <ErrorRow message={loaded.message} onRetry={retry} />
      ) : (
        <ol className="grid grid-cols-7 gap-1 text-[11px] tabular-nums" aria-label={`Day ratings, ${monthLabel(month)}`}>
          {WEEKDAY_LETTERS.map((letter, index) => (
            <li key={`h${index}`} aria-hidden className="flex h-5 items-center justify-center text-muted-foreground">
              {letter}
            </li>
          ))}
          {Array.from({ length: lead }, (_, index) => (
            <li key={`b${index}`} aria-hidden />
          ))}
          {days.map((day) => {
            const rating = loaded.value.ratings[day]
            const later = day > today
            return (
              <li
                key={day}
                aria-label={`${dayLabel(day)}: ${later ? "still to come" : rating ? `${rating} out of ${DAY_RATING_TOP}` : "not rated"}`}
                className={cn(
                  "relative flex aspect-square items-center justify-center rounded-md",
                  later ? "text-muted-foreground/60" : rating ? RATING_LOOK[rating] : "bg-muted",
                  day === today && !rating && "border border-muted-foreground/40 bg-transparent"
                )}
              >
                {/* The date, as a calendar reads, and the day's rating in the corner, as the Year tab shows it. */}
                <span aria-hidden>{Number(day.slice(8))}</span>
                {rating ? (
                  <span aria-hidden className="absolute top-0.5 right-1 text-[9px] leading-none font-semibold">
                    {rating}
                  </span>
                ) : null}
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}

/** Days the Rating trend block looks back over, today included. */
const RATING_TREND_DAYS = 30

const trendConfig: ChartConfig = { rating: { label: "Rating", color: "var(--primary)" } }

/**
 * The Rating trend block on the site admin's page (task "My
 * dashboard/left-panel-blocks", Tyler, 6 Nov 2026): a line of their day
 * ratings over the last 30 days, 1 to 10 up the side, oldest on the left. A
 * day with no rating leaves a gap. It is the shell's chart, drawn as the Team
 * dashboard's trends are.
 */
export function RatingTrend({ today }: { today: string }) {
  const first = addDays(today, -(RATING_TREND_DAYS - 1))
  const years = [...new Set([Number(first.slice(0, 4)), Number(today.slice(0, 4))])]
  const [loaded, retry] = useLoaded(`${first}:${today}`, () => Promise.all(years.map((year) => loadYearOfRatingsPage(year))))
  if (loaded.state === "loading") return <LoadingRow label="Loading the ratings" />
  if (loaded.state === "error") return <ErrorRow message={loaded.message} onRetry={retry} />
  const ratings: Record<string, number> = Object.assign({}, ...loaded.value.map((year) => year.ratings))
  const rows = Array.from({ length: RATING_TREND_DAYS }, (_, index) => {
    const day = addDays(first, index)
    return { day, label: dayLabel(day), rating: ratings[day] ?? null }
  })
  const rated = rows.filter((row) => row.rating !== null).length
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-2">
      <p className="text-sm font-medium">
        Day rating, last {RATING_TREND_DAYS} days
        <span className="font-normal text-muted-foreground"> · {rated} rated</span>
      </p>
      {rated === 0 ? (
        <p className="text-sm text-muted-foreground">No day rated in the last {RATING_TREND_DAYS} days. Rate your day at night.</p>
      ) : (
        <div className="h-36">
          <ChartContainer config={trendConfig} className="h-full w-full">
            <LineChart data={rows} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="0" vertical={false} />
              <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 10 }} dy={8} interval={9} />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10, dx: -5 }}
                width={28}
                domain={[1, DAY_RATING_TOP]}
                ticks={[1, 5, DAY_RATING_TOP]}
              />
              <ChartTooltip
                content={<ChartTooltipContent formatter={(value) => `${value} out of ${DAY_RATING_TOP}`} />}
              />
              <Line
                dataKey="rating"
                type="monotone"
                stroke="var(--color-rating)"
                strokeWidth={2}
                dot={{ r: 2, fill: "var(--color-rating)" }}
                activeDot={{ r: 4 }}
                connectNulls={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ChartContainer>
        </div>
      )}
    </div>
  )
}
