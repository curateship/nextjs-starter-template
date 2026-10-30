import * as React from "react"
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"

import { HabitIconGlyph } from "@/components/project/habit-icons"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ErrorRow } from "@/components/ui/error-row"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { LoadingRow } from "@/components/ui/loading-row"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
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
 * of ratings, and a search through the journal. Only they can open it.
 */
export function DailyLookBackDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(next) => (next ? null : onClose())}>
      <DialogContent variant="admin" className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Look back</DialogTitle>
          <DialogDescription>Your habits, ratings and journal. Only you see these.</DialogDescription>
        </DialogHeader>
        {/* Mounted only while open, so each opening loads fresh. */}
        {open ? <LookBack /> : null}
        <DialogFooter>
          <Button type="button" size="lg" onClick={onClose}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function thisMonth() {
  return new Date().toISOString().slice(0, 7)
}

function LookBack() {
  return (
    <DialogBody>
      <Tabs defaultValue="month" className="grid gap-4">
        <TabsList>
          <TabsTrigger value="month">Month</TabsTrigger>
          <TabsTrigger value="year">Year</TabsTrigger>
          <TabsTrigger value="search">Search</TabsTrigger>
        </TabsList>
        <TabsContent value="month">
          <MonthTab />
        </TabsContent>
        <TabsContent value="year">
          <YearTab />
        </TabsContent>
        <TabsContent value="search">
          <SearchTab />
        </TabsContent>
      </Tabs>
    </DialogBody>
  )
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
    <div className="grid gap-3">
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

function MonthGrid({ month }: { month: MonthOfTicks }) {
  if (month.habits.length === 0) return <p className="text-sm text-muted-foreground">No habits in {monthLabel(month.month)}.</p>
  return (
    <ScrollArea className="w-full">
      <table className="border-separate border-spacing-1 text-xs">
        <thead>
          <tr>
            <th className="text-left font-medium text-muted-foreground">Habit</th>
            {month.days.map((day) => (
              <th key={day} className="w-4 font-normal text-muted-foreground">
                {Number(day.slice(8))}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {month.habits.map((habit) => (
            <tr key={habit.id}>
              <th scope="row" className="pr-2 text-left font-normal whitespace-nowrap">
                <span className="flex items-center gap-1.5">
                  <HabitIconGlyph icon={habit.icon} className="size-3.5 text-muted-foreground" />
                  <span className={cn(habit.retired && "text-muted-foreground")}>{habit.name}</span>
                </span>
              </th>
              {habit.cells.map((cell, index) => (
                <td key={month.days[index]} aria-label={`${dayLabel(month.days[index])}: ${MONTH_WORDS[cell]}`}>
                  <span className="flex size-4 items-center justify-center">
                    {cell === "done" ? (
                      <span className="size-3 rounded-sm bg-primary" />
                    ) : cell === "missed" ? (
                      <span className="size-3 rounded-sm border border-muted-foreground" />
                    ) : cell === "open" ? (
                      <span className="size-3 rounded-sm border border-dashed border-primary" />
                    ) : cell === "off" ? (
                      <span className="h-px w-2.5 bg-muted-foreground/60" />
                    ) : null}
                  </span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  )
}

/** A rating's square: stronger for a better day, with the number for anyone who can't tell shades apart. */
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
    <div className="grid gap-3">
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
        <ScrollArea className="w-full">
          <div className="grid gap-1 text-xs">
            {Array.from({ length: 12 }, (_, index) => {
              const month = `${year}-${String(index + 1).padStart(2, "0")}`
              const days: string[] = []
              for (let day = `${month}-01`; day.startsWith(month); day = addDays(day, 1)) days.push(day)
              return (
                <div key={month} className="flex items-center gap-1">
                  <span className="w-8 text-muted-foreground">
                    {new Date(`${month}-15T12:00:00Z`).toLocaleDateString("en", { month: "short", timeZone: "UTC" })}
                  </span>
                  {days.map((day) => {
                    const rating = loaded.value.ratings[day]
                    return (
                      <span
                        key={day}
                        aria-label={`${dayLabel(day)}: ${rating ? `${rating} out of 5` : "not rated"}`}
                        className={cn(
                          "flex size-4 shrink-0 items-center justify-center rounded-sm text-[9px]",
                          rating ? RATING_LOOK[rating] : "bg-muted"
                        )}
                      >
                        {rating ?? ""}
                      </span>
                    )
                  })}
                </div>
              )
            })}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      )}
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
    <div className="grid gap-3">
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
