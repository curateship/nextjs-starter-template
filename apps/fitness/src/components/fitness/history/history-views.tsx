import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import { FileUpIcon } from "lucide-react"

import { PanelBody, PanelEmpty, PanelToolbar } from "@/components/fitness/dashboard/panel-parts"
import type { ProgramViewProps } from "@/components/fitness/dashboard/view-props"
import { ImportDialog } from "@/components/fitness/history/import-dialog"
import { WorkoutDetail } from "@/components/fitness/history/workout-detail"
import { DashboardToolbarButton, DashboardToolbarSearch } from "@/components/shared/dashboard-toolbar"
import { Badge } from "@/components/ui/badge"
import type { HistoryRow } from "@/lib/api/fitness/workouts"
import { formatDay } from "@/lib/fitness/dates"
import { formatWeight } from "@/lib/fitness/weights"
import { cn } from "@/lib/utils"

/** This program's workouts, newest first. Older ones with no program show in none. */
function programRows(props: ProgramViewProps): HistoryRow[] {
  if (props.page.viewData.view !== "history") return []
  return props.page.viewData.history.rows.filter((row) => row.programId === props.page.program.id)
}

/**
 * History in the middle panel: every workout logged in this program, newest
 * first, unfinished ones marked so they can be picked up. Clicking one opens
 * it on the right. The owner can also import another app's history into
 * this program or start an empty workout; a coach only reads.
 */
export function HistoryMiddle(props: ProgramViewProps) {
  const { page, search, go } = props
  const router = useRouter()
  const [query, setQuery] = React.useState("")
  const [importing, setImporting] = React.useState(false)
  if (page.viewData.view !== "history") return null
  const { history } = page.viewData
  const unit = history.preferences.unit
  const mine = page.program.mine
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const rows = programRows(props).filter((row) => {
    const text = `${row.name} ${row.exerciseNames.join(" ")} ${row.note}`.toLowerCase()
    return words.every((word) => text.includes(word))
  })

  return (
    <>
      <PanelToolbar>
        <DashboardToolbarSearch
          className="basis-full sm:basis-auto"
          aria-label="Search workouts"
          placeholder="Search workouts or lifts"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        {mine ? (
          <DashboardToolbarButton type="button" variant="outline" onClick={() => setImporting(true)}>
            <FileUpIcon />
            Import
          </DashboardToolbarButton>
        ) : null}
      </PanelToolbar>
      <PanelBody padded={false}>
        {rows.length === 0 ? (
          <PanelEmpty>
            {query
              ? "No workout matches. Clear the search to see them all."
              : "No workouts in this program yet. Start one from a day of the week."}
          </PanelEmpty>
        ) : (
          <ul className="divide-y">
            {rows.map((row) => {
              const picked = row.id === search.pick
              return (
                <li key={row.id}>
                  <button
                    type="button"
                    aria-current={picked ? "true" : undefined}
                    className={cn(
                      "flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none",
                      picked && "bg-muted/60"
                    )}
                    onClick={() => go({ pick: row.id })}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium">{row.name}</span>
                        {row.finished ? null : <Badge variant="outline">Unfinished</Badge>}
                        {row.source === "import" ? <Badge variant="secondary">Imported</Badge> : null}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {formatDay(row.day)} · {row.setsDone} {row.setsDone === 1 ? "set" : "sets"}
                        {row.exerciseNames.length ? ` · ${row.exerciseNames.join(", ")}` : ""}
                      </span>
                    </span>
                    <span className="hidden shrink-0 text-right text-xs text-muted-foreground tabular-nums sm:block">
                      {formatWeight(row.totalKg, unit)}
                      {row.minutes ? <span className="block">{row.minutes} min</span> : null}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </PanelBody>
      {mine ? (
        <ImportDialog
          open={importing}
          programId={page.program.id}
          unit={unit}
          exercises={history.exercises.filter((exercise) => exercise.routineType === page.program.routineType)}
          onClose={() => setImporting(false)}
          onImported={async () => {
            setImporting(false)
            await router.invalidate()
          }}
        />
      ) : null}
    </>
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
