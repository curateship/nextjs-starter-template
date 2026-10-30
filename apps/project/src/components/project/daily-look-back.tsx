import * as React from "react"
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"

import { HabitIconGlyph } from "@/components/project/habit-icons"
import { Button } from "@/components/ui/button"
import { ErrorRow } from "@/components/ui/error-row"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { LoadingRow } from "@/components/ui/loading-row"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  findInJournal,
  loadMonthOfTicksPage,
  loadYearOfRatingsPage,
  type JournalHit,
  type MonthOfTicks,
  type WeekDot,
} from "@/lib/api/project/daily-card"
import { DAILY_LIMITS } from "@/lib/project/daily-card"
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

const MONTH_WORDS: Record<WeekDot, string> = {
  done: "done",
  missed: "missed",
  off: "not counted",
  open: "today, not done yet",
  later: "still to come",
}

/**
 * The site admin's look back (Tyler, 29 Oct 2026): a month of ticks, a year
 * of ratings, and a search through the journal. Only they can open it. It
 * opens in the left panel in place of the cards, like the inbox, from the
 * graph in the panel's header (Tyler, 30 Oct 2026: "Dont put the look back
 * into modal but instead put it inline in the left panel like inbox"). It is
 * mounted only while shown, so each opening loads fresh.
 */
export function DailyLookBack() {
  return (
    // minmax(0, 1fr): the month and year grids scroll sideways inside the panel instead of widening it.
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      <div className="grid gap-0.5">
        <h2 className="text-base leading-tight font-semibold">Look back</h2>
        <p className="text-sm text-muted-foreground">Your habits, ratings and journal. Only you see these.</p>
      </div>
      <Tabs defaultValue="month" className="grid grid-cols-[minmax(0,1fr)] gap-4">
        <TabsList>
          <TabsTrigger value="month">Month</TabsTrigger>
          <TabsTrigger value="year">Year</TabsTrigger>
          <TabsTrigger value="search">Search</TabsTrigger>
        </TabsList>
        <TabsContent value="month" className="min-w-0">
          <MonthTab />
        </TabsContent>
        <TabsContent value="year" className="min-w-0">
          <YearTab />
        </TabsContent>
        <TabsContent value="search" className="min-w-0">
          <SearchTab />
        </TabsContent>
      </Tabs>
    </div>
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
        <span className="min-w-36 text-center text-sm font-medium">{monthLabel(month)}</span>
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

type MonthHabit = MonthOfTicks["habits"][number]

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
 * The month as one calendar, Monday first, and a line per habit under it
 * (Tyler, 30 Oct 2026, after one calendar per habit: "If there is 10
 * habits, its too long"; he picked one calendar and a habit list). Each day
 * is shaded by how many of its habits were done. Pressing a habit shows only
 * its days; pressing it again goes back to all. The calendar fills the panel
 * up to a comfortable size ("it has to be responsive to the size of the
 * panel").
 */
function MonthGrid({ month }: { month: MonthOfTicks }) {
  const [picked, setPicked] = React.useState<string | null>(null)
  if (month.habits.length === 0) return <p className="text-sm text-muted-foreground">No habits in {monthLabel(month.month)}.</p>
  const habit = month.habits.find((item) => item.id === picked) ?? null
  const [year, monthNumber] = month.month.split("-").map(Number)
  // Blank cells before the 1st, so it lands under its weekday.
  const lead = (new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay() + 6) % 7
  return (
    <div className="grid gap-4">
      <ol className="grid max-w-sm grid-cols-7 gap-1 text-[11px] tabular-nums" aria-label={habit ? `${habit.name}, ${monthLabel(month.month)}` : monthLabel(month.month)}>
        {WEEKDAY_LETTERS.map((letter, index) => (
          <li key={`h${index}`} aria-hidden className="flex h-5 items-center justify-center text-muted-foreground">
            {letter}
          </li>
        ))}
        {Array.from({ length: lead }, (_, index) => (
          <li key={`b${index}`} aria-hidden />
        ))}
        {month.days.map((day, index) => (
          <MonthDay key={day} day={day} cells={habit ? [habit.cells[index]] : month.habits.map((item) => item.cells[index])} single={Boolean(habit)} />
        ))}
      </ol>
      <ul className="grid gap-1" aria-label="Habits this month">
        {month.habits.map((item) => (
          <HabitMonthLine key={item.id} habit={item} picked={item.id === picked} onPick={() => setPicked((shown) => (shown === item.id ? null : item.id))} />
        ))}
      </ul>
    </div>
  )
}

function MonthDay({ day, cells, single }: { day: string; cells: WeekDot[]; single: boolean }) {
  const done = cells.filter((cell) => cell === "done").length
  const counted = countedDays(cells)
  const open = cells.includes("open")
  const words = single
    ? MONTH_WORDS[cells[0]]
    : counted
      ? `${done} of ${counted} ${counted === 1 ? "habit" : "habits"} done`
      : "nothing to do"
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

/** "10 min run   Done 18 of 26 days" with a thin bar; pressing it shows only that habit's days. */
function HabitMonthLine({ habit, picked, onPick }: { habit: MonthHabit; picked: boolean; onPick: () => void }) {
  const done = habit.cells.filter((cell) => cell === "done").length
  const counted = countedDays(habit.cells)
  return (
    <li>
      <button
        type="button"
        aria-pressed={picked}
        onClick={onPick}
        className={cn(
          "grid w-full cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted",
          picked && "bg-muted",
          focusRingInset
        )}
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <HabitIconGlyph icon={habit.icon} className="size-3.5 shrink-0 text-muted-foreground" />
          <span className={cn("truncate", habit.retired && "text-muted-foreground")}>{habit.name}</span>
        </span>
        {/* Said in words, not "0/2" (Tyler, 30 Oct 2026: "i dont understsnd what 0/2 means for habit"). */}
        <span className="text-xs text-muted-foreground tabular-nums">
          {counted ? `Done ${done} of ${counted} ${counted === 1 ? "day" : "days"}` : "No days yet"}
        </span>
        <span aria-hidden className="col-span-2 h-1 overflow-hidden rounded-full bg-muted-foreground/15">
          <span className="block h-full rounded-full bg-primary" style={{ width: `${counted ? (done / counted) * 100 : 0}%` }} />
        </span>
      </button>
    </li>
  )
}

/** A rating's square: stronger for a better day. */
const RATING_LOOK: Record<number, string> = {
  1: "bg-primary/15",
  2: "bg-primary/30",
  3: "bg-primary/50",
  4: "bg-primary/75 text-primary-foreground",
  5: "bg-primary text-primary-foreground",
}

function YearTab() {
  const [year, setYear] = React.useState(() => new Date().getUTCFullYear())
  const [loaded, retry] = useLoaded(String(year), () => loadYearOfRatingsPage(year))
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-3">
      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" size="icon" aria-label="The year before" onClick={() => setYear(year - 1)}>
          <ChevronLeftIcon className="size-4" />
        </Button>
        <span className="min-w-16 text-center text-sm font-medium">{year}</span>
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
 * tab", after one long row of squares per month ran off the panel). The
 * squares are too small for the number, so a key from 1 to 5 sits above
 * them; each square still says its rating to a screen reader.
 */
function YearGrid({ year, ratings }: { year: number; ratings: Record<string, number> }) {
  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-1 text-xs text-muted-foreground" aria-hidden>
        <span className="mr-1">Rating</span>
        {[1, 2, 3, 4, 5].map((rating) => (
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
                      aria-label={`${dayLabel(day)}: ${rating ? `${rating} out of 5` : "not rated"}`}
                      className={cn("aspect-square rounded-[2px]", rating ? RATING_LOOK[rating] : "bg-muted")}
                    />
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
  intention: "Intention",
  win: "Win",
  note: "Note",
  answer: "Answer",
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
        <Label htmlFor="daily-journal-search">Find a word in your intentions, wins, notes and answers</Label>
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
