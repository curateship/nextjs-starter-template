import { PanelBody, PanelEmpty } from "@/components/fitness/dashboard/panel-parts"
import type { ProgramViewProps } from "@/components/fitness/dashboard/view-props"
import { WorkoutDetail } from "@/components/fitness/history/workout-detail"
import { Badge } from "@/components/ui/badge"
import type { HistoryRow } from "@/lib/api/fitness/workouts"
import { addDays, formatDay, weekStart, type Day } from "@/lib/fitness/dates"
import { formatWeight } from "@/lib/fitness/weights"
import { cn } from "@/lib/utils"

const MONTH_SHORT = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short" })
const MONTH_LONG = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "long", year: "numeric" })

/** This program's workouts, newest first. Older ones with no program show in none. */
function programRows(props: ProgramViewProps): HistoryRow[] {
  if (props.page.viewData.view !== "history") return []
  return props.page.viewData.history.rows.filter((row) => row.programId === props.page.program.id)
}

/** "This week", "Last week", then the month: "September 2026". */
function groupName(day: Day, today: Day) {
  const monday = weekStart(today)
  if (day >= monday) return "This week"
  if (day >= addDays(monday, -7)) return "Last week"
  return MONTH_LONG.format(new Date(`${day}T00:00:00Z`))
}

/** The rows in their groups, newest group first, keeping the rows' own order. */
function grouped(rows: HistoryRow[], today: Day) {
  const groups: { name: string; rows: HistoryRow[] }[] = []
  for (const row of rows) {
    const name = groupName(row.day, today)
    const last = groups.at(-1)
    if (last?.name === name) last.rows.push(row)
    else groups.push({ name, rows: [row] })
  }
  return groups
}

/**
 * History in the middle panel: every workout logged in this program, newest
 * first, in groups of this week, last week and then by month, as Tyler drew it
 * on 18 Oct 2026. Each workout is a card with its date, what was done and how
 * much was lifted; clicking one opens it on the right. Tyler took import and
 * search out the same day, so the list is all there is.
 */
export function HistoryMiddle(props: ProgramViewProps) {
  const { page, search, go } = props
  if (page.viewData.view !== "history") return null
  const unit = page.viewData.history.preferences.unit
  const rows = programRows(props)

  if (rows.length === 0) {
    return (
      <PanelBody>
        <PanelEmpty>No workouts in this program yet. Start one from a day of the week.</PanelEmpty>
      </PanelBody>
    )
  }

  return (
    <PanelBody>
      {grouped(rows, page.today).map((group) => (
        <section key={group.name} className="grid gap-2" aria-label={group.name}>
          <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {group.name} · {group.rows.length}
          </h3>
          <ul className="grid gap-2">
            {group.rows.map((row) => {
              const picked = row.id === search.pick
              return (
                <li key={row.id}>
                  <button
                    type="button"
                    aria-current={picked ? "true" : undefined}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-xl border bg-card p-3 text-left transition-colors hover:bg-muted/40",
                      "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                      picked && "border-foreground"
                    )}
                    onClick={() => go({ pick: row.id })}
                  >
                    <span className="grid w-11 shrink-0 justify-items-center rounded-lg border py-1 leading-none">
                      <span className="text-[10px] font-medium text-muted-foreground uppercase">
                        {MONTH_SHORT.format(new Date(`${row.day}T00:00:00Z`))}
                      </span>
                      <span className="mt-0.5 text-base font-semibold tabular-nums">{Number(row.day.slice(8))}</span>
                    </span>
                    <span className="grid min-w-0 flex-1">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="truncate text-sm font-medium">{row.name}</span>
                        {row.finished ? null : <Badge variant="outline">Unfinished</Badge>}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        {formatDay(row.day)} · {row.setsDone} {row.setsDone === 1 ? "set" : "sets"}
                        {row.exerciseNames.length ? ` · ${row.exerciseNames.join(", ")}` : ""}
                      </span>
                    </span>
                    <span className="hidden shrink-0 items-center gap-1.5 sm:flex">
                      <span className="rounded-md border px-2 py-0.5 text-xs font-medium tabular-nums">
                        {formatWeight(row.totalKg, unit)}
                      </span>
                      {row.minutes ? (
                        <span className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground tabular-nums">
                          {row.minutes} min
                        </span>
                      ) : null}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </PanelBody>
  )
}

/** The picked workout on the right, or this program's last four weeks when none is picked. */
export function HistoryRight(props: ProgramViewProps) {
  const { page, search, go } = props
  if (page.viewData.view !== "history") return null
  const { history } = page.viewData
  return (
    <WorkoutDetail
      workoutId={search.pick}
      rows={programRows(props)}
      unit={history.preferences.unit}
      timeZone={history.preferences.timeZone}
      canChange={page.program.mine}
      onClose={() => go({ pick: undefined })}
      onOpen={(workout) => go({ workout, pick: undefined })}
    />
  )
}
