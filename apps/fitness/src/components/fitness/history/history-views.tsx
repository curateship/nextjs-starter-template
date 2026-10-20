import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import { BookmarkIcon, Loader2Icon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"

import { PanelBody, PanelEmpty } from "@/components/fitness/dashboard/panel-parts"
import type { ProgramViewProps } from "@/components/fitness/dashboard/view-props"
import { programRows } from "@/components/fitness/dashboard/view-rows"
import { WorkoutDetail } from "@/components/fitness/history/workout-detail"
import { DashboardToolbarButton } from "@/components/shared/dashboard-toolbar"
import { FilterPopover } from "@/components/shared/filter-popover"
import { SearchToggle } from "@/components/shared/search-toggle"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { FormDialog } from "@/components/ui/form-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { deleteHistoryView, saveHistoryView, type SavedView } from "@/lib/api/fitness/saved-views"
import type { HistoryRow } from "@/lib/api/fitness/workouts"
import { formatDay } from "@/lib/fitness/dates"
import {
  HISTORY_FILTER_MAX,
  HISTORY_GROUP_LABELS,
  HISTORY_GROUPS,
  NO_HISTORY_FILTERS,
  filterHistory,
  groupHistory,
  historyFilterCount,
  type HistoryFilters,
  type HistoryGroup,
  type HistoryStatus,
} from "@/lib/fitness/history-filters"
import { reportFitnessError } from "@/lib/fitness/report-error"
import { formatWeight } from "@/lib/fitness/weights"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

const MONTH_SHORT = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short" })

/** A Select's value for "no filter": Radix keeps an empty value for the placeholder. */
const ANY = "any"

/** The Filter popover's choices, from the workouts this program has. */
function choicesOf(rows: readonly HistoryRow[]) {
  const sorted = (values: Iterable<string>) => [...new Set(values)].sort((a, b) => a.localeCompare(b))
  return { names: sorted(rows.map((row) => row.name)), exercises: sorted(rows.flatMap((row) => row.exerciseNames)) }
}

/**
 * History in the middle panel: every workout logged in this program, newest
 * first, in groups of this week, last week and then by month, as Tyler drew it
 * on 18 Oct 2026. Each workout is a card with its date, what was done and how
 * much was lifted; clicking one opens it on the right. The header's search,
 * Filter and Views narrow it (Tyler, 20 Oct 2026, "Add them", over his 18 Oct
 * list with no search).
 */
export function HistoryMiddle(props: ProgramViewProps) {
  const { page, search, go } = props
  if (page.viewData.view !== "history") return null
  const unit = page.viewData.history.preferences.unit
  const all = programRows(props)
  const rows = filterHistory(all, search)

  if (all.length === 0) {
    return (
      <PanelBody>
        <PanelEmpty>No workouts in this program yet. Start one from a day of the week.</PanelEmpty>
      </PanelBody>
    )
  }
  if (rows.length === 0) {
    return (
      <PanelBody>
        <PanelEmpty>No workout matches. Change the search or press Clear in Filter to see them all.</PanelEmpty>
      </PanelBody>
    )
  }

  return (
    <PanelBody>
      {groupHistory(rows, page.today, search.group).map((group) => (
        <section key={group.name} className="grid gap-2" aria-label={group.name}>
          <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {group.name} · {group.rows.length}
          </h3>
          <ul className="grid gap-2">
            {group.rows.map((row) => {
              const picked = row.id === search.open
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
                    onClick={() => go({ open: row.id })}
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

/**
 * History's tools in the middle header, in the UI standard's order: the
 * search, Filter and Views. Every change replaces the address rather than
 * adding to Back's list, and closes the open workout only when the filters
 * hide it.
 */
export function HistoryTools(props: ProgramViewProps) {
  const { page, search, go } = props
  const [filterOpen, setFilterOpen] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  if (page.viewData.view !== "history") return null
  const rows = programRows(props)
  const { names, exercises } = choicesOf(rows)
  const views = page.viewData.views
  const filters: HistoryFilters = {
    q: search.q,
    name: search.name,
    status: search.status,
    exercise: search.exercise,
    group: search.group,
  }

  function change(patch: HistoryFilters) {
    const next = { ...filters, ...patch }
    const stillShown = search.open && filterHistory(rows, next).some((row) => row.id === search.open)
    go({ ...patch, open: stillShown ? search.open : undefined }, { replace: true })
  }

  function openView(view: SavedView) {
    const missing: string[] = []
    const next: HistoryFilters = { ...view.filters }
    if (next.name && !names.includes(next.name)) {
      missing.push(`${next.name} isn't in this program's History any more`)
      delete next.name
    }
    if (next.exercise && !exercises.includes(next.exercise)) {
      missing.push(`${next.exercise} isn't in this program's History any more`)
      delete next.exercise
    }
    change({ ...NO_HISTORY_FILTERS, ...next })
    if (missing.length) showErrorToast(`${missing.join(". ")}, so "${view.name}" opened without it.`)
  }

  return (
    <>
      <SearchToggle
        name="workout-search"
        label="Search workouts"
        placeholder="Search workouts"
        value={search.q ?? ""}
        // The address keeps at most HISTORY_FILTER_MAX characters, so the box stops there too.
        onChange={(value) => change({ q: value.trim() ? value.slice(0, HISTORY_FILTER_MAX) : undefined })}
      />
      <FilterPopover
        count={historyFilterCount(filters)}
        open={filterOpen}
        onOpenChange={setFilterOpen}
        onClear={() => change({ name: undefined, status: undefined, exercise: undefined })}
        save={
          <Button
            type="button"
            onClick={() => {
              setFilterOpen(false)
              setSaving(true)
            }}
          >
            Save as view
          </Button>
        }
      >
        <FilterRow label="Workout" value={filters.name} options={names.map((name) => ({ value: name, label: name }))} onChange={(name) => change({ name })} />
        <FilterRow
          label="Status"
          value={filters.status}
          options={[
            { value: "finished", label: "Finished" },
            { value: "unfinished", label: "Unfinished" },
          ]}
          onChange={(status) => change({ status: status as HistoryStatus | undefined })}
        />
        <FilterRow label="Exercise" value={filters.exercise} options={exercises.map((name) => ({ value: name, label: name }))} onChange={(exercise) => change({ exercise })} />
        <FilterRow
          label="Group"
          value={filters.group ?? "week"}
          options={HISTORY_GROUPS.map((group) => ({ value: group, label: HISTORY_GROUP_LABELS[group] }))}
          onChange={(group) => change({ group: group === "week" ? undefined : (group as HistoryGroup) })}
          noAny
        />
      </FilterPopover>
      <ViewsMenu views={views} onOpen={openView} />
      <SaveViewDialog
        open={saving}
        programId={page.program.id}
        filters={filters}
        onClose={() => setSaving(false)}
      />
    </>
  )
}

/** One row of the Filter popover: a label, then its Select. */
function FilterRow({
  label,
  value,
  options,
  onChange,
  noAny = false,
}: {
  label: string
  value: string | undefined
  options: { value: string; label: string }[]
  onChange: (value: string | undefined) => void
  /** For Group, which always has a value. */
  noAny?: boolean
}) {
  const id = React.useId()
  return (
    <div className="grid grid-cols-[5rem_minmax(0,1fr)] items-center gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value ?? ANY} onValueChange={(next) => onChange(next === ANY ? undefined : next)}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {noAny ? null : <SelectItem value={ANY}>Any</SelectItem>}
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

/** "Chest day · Unfinished · Bench press", so a view says what it shows before it is opened. */
function describeView({ filters }: SavedView) {
  const parts: string[] = []
  if (filters.q) parts.push(`"${filters.q}"`)
  if (filters.name) parts.push(filters.name)
  if (filters.status) parts.push(filters.status === "finished" ? "Finished" : "Unfinished")
  if (filters.exercise) parts.push(filters.exercise)
  if (filters.group) parts.push(`Group: ${HISTORY_GROUP_LABELS[filters.group]}`)
  return parts.join(" · ") || "Every workout"
}

/** The Views button: the person's own saved filters on this program, each opened in one click. */
function ViewsMenu({ views, onOpen }: { views: SavedView[]; onOpen: (view: SavedView) => void }) {
  const router = useRouter()
  const [deleting, setDeleting] = React.useState<string | null>(null)

  async function remove(view: SavedView) {
    setDeleting(view.id)
    try {
      await deleteHistoryView(view.id)
      toast.success(`"${view.name}" deleted.`)
      await router.invalidate()
    } catch (error) {
      reportFitnessError(error)
    } finally {
      setDeleting(null)
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <DashboardToolbarButton type="button" variant="ghost" aria-label={views.length ? `Views, ${views.length} saved` : "Views"}>
          <BookmarkIcon className="size-4" />
          <span className="@max-3xl:sr-only">Views</span>
          {views.length ? <span className="text-muted-foreground">{views.length}</span> : null}
        </DashboardToolbarButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel>My views</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {views.length === 0 ? (
          <p className="px-2 py-2 text-sm text-muted-foreground">
            None yet. Search or pick filters, then press Save as view in Filter.
          </p>
        ) : (
          views.map((view) => (
            <div key={view.id} className="flex items-center gap-1">
              <DropdownMenuItem className="flex min-w-0 flex-1" onSelect={() => onOpen(view)}>
                <span className="grid min-w-0 flex-1">
                  <span className="truncate">{view.name}</span>
                  <span className="truncate text-xs text-muted-foreground">{describeView(view)}</span>
                </span>
              </DropdownMenuItem>
              <DropdownMenuItem
                className="shrink-0 self-stretch text-muted-foreground"
                aria-label={`Delete ${view.name}`}
                onSelect={(event) => {
                  // The menu stays open, so a second view can go too.
                  event.preventDefault()
                  void remove(view)
                }}
              >
                {deleting === view.id ? <Loader2Icon className="animate-spin" aria-hidden /> : <Trash2Icon aria-hidden />}
              </DropdownMenuItem>
            </div>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Names the filters set now and keeps them as one of the person's views on this program. */
function SaveViewDialog({
  open,
  programId,
  filters,
  onClose,
}: {
  open: boolean
  programId: string
  filters: HistoryFilters
  onClose: () => void
}) {
  const router = useRouter()
  const [name, setName] = React.useState("")
  const [invalid, setInvalid] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const nameId = React.useId()
  const shown = describeView({ id: "", name: "", filters })

  async function save() {
    if (!name.trim()) {
      setInvalid(true)
      showErrorToast("Give the view a name.")
      return
    }
    setBusy(true)
    try {
      const kept = Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== undefined))
      await saveHistoryView({ programId, name: name.trim(), filters: kept })
      toast.success(`"${name.trim()}" saved. Open it from Views.`)
      await router.invalidate()
      setName("")
      onClose()
    } catch (error) {
      reportFitnessError(error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <FormDialog open={open} dirty={name.trim() !== ""} busy={busy} onClose={onClose}>
      {(requestClose) => (
        <DialogContent variant="admin">
          <DialogHeader>
            <DialogTitle>Save as view</DialogTitle>
            <DialogDescription>It shows: {shown}. Only you see your views.</DialogDescription>
          </DialogHeader>
          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(event) => {
              event.preventDefault()
              void save()
            }}
          >
            <DialogBody>
              <Card size="sm">
                <CardHeader>
                  <CardTitle>View</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-2">
                  <Label htmlFor={nameId}>Name</Label>
                  <Input
                    id={nameId}
                    value={name}
                    maxLength={60}
                    autoFocus
                    placeholder="Unfinished leg days"
                    aria-invalid={invalid || undefined}
                    onChange={(event) => {
                      setName(event.target.value)
                      setInvalid(false)
                    }}
                  />
                </CardContent>
              </Card>
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="outline" size="lg" onClick={requestClose} disabled={busy}>
                Cancel
              </Button>
              <Button type="submit" size="lg" disabled={busy}>
                {busy ? <Loader2Icon className="animate-spin" /> : null}
                Create view
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      )}
    </FormDialog>
  )
}

/** The picked workout on the right, or this program's last four weeks when none is picked. */
export function HistoryRight(props: ProgramViewProps) {
  const { page, search, go } = props
  if (page.viewData.view !== "history") return null
  const { history } = page.viewData
  return (
    <WorkoutDetail
      workoutId={search.open}
      rows={programRows(props)}
      unit={history.preferences.unit}
      timeZone={history.preferences.timeZone}
      canChange={page.program.mine}
      onClose={() => go({ open: undefined })}
      onOpen={(workout) => go({ workout, open: undefined })}
    />
  )
}
