import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import { DumbbellIcon, PlusIcon, SettingsIcon, Trash2Icon, TriangleAlertIcon } from "lucide-react"
import { toast } from "sonner"

import { ExerciseDialog } from "@/components/fitness/exercises/exercise-dialog"
import { DashboardTable } from "@/components/shared/dashboard-table"
import {
  DashboardToolbarButton,
  DashboardToolbarSearch,
  DashboardToolbarSelectTrigger,
} from "@/components/shared/dashboard-toolbar"
import {
  SelectAllTableHead,
  SortableTableHeader,
  type TableHeaderColumn,
} from "@/components/shared/sortable-table-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Select, SelectContent, SelectItem, SelectValue } from "@/components/ui/select"
import { TableCell, TableHead, TableRow } from "@/components/ui/table"
import { changeExercise, type Exercise } from "@/lib/api/fitness/exercises"
import { describeBulkResult } from "@/lib/format/bulk-result"
import {
  EQUIPMENT,
  EQUIPMENT_LABELS,
  MOVEMENT_LABELS,
  MUSCLES,
  MUSCLE_LABELS,
  type Equipment,
  type Muscle,
} from "@/lib/fitness/exercise-catalog"
import { reportFitnessError } from "@/lib/fitness/report-error"
import { ROUTINE_TYPES, routineTypeLabel, type RoutineTypeId } from "@/lib/fitness/routine-types"
import { useSelection } from "@/lib/hooks/use-selection"
import { useTableSort } from "@/lib/hooks/use-table-sort"
import { useOpenFromLink } from "@/lib/hooks/use-open-from-link"

type Column = "name" | "routineType" | "muscle" | "equipment" | "movement"

const COLUMNS: TableHeaderColumn<Column>[] = [
  { key: "name", label: "Name", column: "main" },
  { key: "routineType", label: "Routine type", column: "meta", className: "hidden lg:table-cell" },
  { key: "muscle", label: "Main muscle", column: "meta" },
  { key: "equipment", label: "Equipment", column: "meta", className: "hidden md:table-cell" },
  { key: "movement", label: "Movement", column: "meta", className: "hidden xl:table-cell" },
]

const PAGE_SIZE = 25

function sortValue(exercise: Exercise, column: Column) {
  switch (column) {
    case "name":
      return exercise.name.toLowerCase()
    case "routineType":
      return routineTypeLabel(exercise.routineType)
    case "muscle":
      return exercise.muscles[0] ? MUSCLE_LABELS[exercise.muscles[0]] : "~"
    case "equipment":
      return exercise.equipment.map((item) => EQUIPMENT_LABELS[item]).join(", ") || "~"
    case "movement":
      return MOVEMENT_LABELS[exercise.movement]
  }
}

/**
 * The exercise library at /exercises, a dashboard of its own. Tyler, 18 Oct
 * 2026: exercises are filtered by routine type, and a program only lists its
 * own type's lifts. A row opens the lift in a window that keeps `?open=<id>`
 * in the address. Built-in lifts read only; the person's own can be changed
 * and deleted.
 */
export function ExercisesDashboard({
  exercises,
  routineType,
  openId,
  onRoutineType,
  onOpen,
}: {
  exercises: readonly Exercise[]
  routineType: RoutineTypeId
  openId: string | undefined
  onRoutineType: (routineType: RoutineTypeId) => void
  onOpen: (id: string | undefined) => void
}) {
  const router = useRouter()
  const [query, setQuery] = React.useState("")
  const [muscle, setMuscle] = React.useState<Muscle | "all">("all")
  const [equipment, setEquipment] = React.useState<Equipment | "all">("all")
  const [page, setPage] = React.useState(1)
  const [dialog, setDialog] = React.useState<{ exercise: Exercise | null } | null>(null)
  const [deleting, setDeleting] = React.useState<Exercise[] | null>(null)
  const [busy, setBusy] = React.useState(false)
  const { sort, direction, toggleSort } = useTableSort<Column>("name")
  const selection = useSelection()

  const records = React.useMemo(() => [...exercises], [exercises])
  useOpenFromLink({ openId, records, onOpen: (exercise) => setDialog({ exercise }) })
  // Back takes `?open=` off the address, which closes the window it opened.
  const [lastOpenId, setLastOpenId] = React.useState(openId)
  if (lastOpenId !== openId) {
    setLastOpenId(openId)
    if (!openId && dialog?.exercise) setDialog(null)
  }
  // A lift saved in the window shows its new figures when the list reloads.
  const openExercise = dialog?.exercise ? (exercises.find((entry) => entry.id === dialog.exercise?.id) ?? dialog.exercise) : null

  const rows = React.useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
    const matching = exercises
      .filter((exercise) => exercise.routineType === routineType)
      .filter((exercise) => words.every((word) => exercise.name.toLowerCase().includes(word)))
      .filter((exercise) => muscle === "all" || exercise.muscles.includes(muscle))
      .filter((exercise) => equipment === "all" || exercise.equipment.includes(equipment))
    const order = direction === "asc" ? 1 : -1
    return matching.sort((a, b) => {
      const left = sortValue(a, sort)
      const right = sortValue(b, sort)
      return (left < right ? -1 : left > right ? 1 : 0) * order
    })
  }, [direction, equipment, exercises, muscle, query, routineType, sort])

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const shownPage = Math.min(page, totalPages)
  const visible = rows.slice((shownPage - 1) * PAGE_SIZE, shownPage * PAGE_SIZE)
  // Only a person's own lifts can be ticked: built-in ones can't be deleted.
  const tickable = visible.filter((exercise) => !exercise.builtIn).map((exercise) => exercise.id)
  const ticked = exercises.filter((exercise) => selection.selected.has(exercise.id))

  function open(exercise: Exercise | null) {
    setDialog({ exercise })
    if (exercise) onOpen(exercise.id)
  }

  function close() {
    setDialog(null)
    if (openId) onOpen(undefined)
  }

  async function remove(targets: Exercise[]) {
    setBusy(true)
    try {
      const result =
        targets.length === 1
          ? await changeExercise({ action: "delete", exerciseId: targets[0].id }).then(() => ({
              done: [targets[0].id],
              kept: [] as string[],
            }))
          : await changeExercise({ action: "deleteMany", exerciseIds: targets.map((target) => target.id) })
      const done = result.done?.length ?? 0
      const kept = result.kept?.length ?? 0
      const line = describeBulkResult({
        done,
        kept,
        one: "exercise",
        many: "exercises",
        verb: "deleted",
        keptReason: "kept because they have logged sets",
      })
      if (kept && !done) reportFitnessError(line)
      else toast.success(line)
      selection.clear()
      setDeleting(null)
      await router.invalidate()
    } catch (error) {
      setDeleting(null)
      reportFitnessError(error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <DashboardTable
        title="Exercises"
        icon={<DumbbellIcon />}
        count={rows.length}
        busy={busy}
        selectedCount={ticked.length}
        onClearSelection={selection.clear}
        controls={
          <>
            {ticked.length ? (
              <DashboardToolbarButton type="button" variant="destructive" disabled={busy} onClick={() => setDeleting(ticked)}>
                <Trash2Icon className="size-4" />
                Delete ({ticked.length})
              </DashboardToolbarButton>
            ) : null}
            <DashboardToolbarSearch
              name="exercise-search"
              aria-label="Search exercises"
              placeholder="Search exercises"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value)
                setPage(1)
              }}
            />
            <Select
              value={routineType}
              onValueChange={(value) => {
                onRoutineType(value as RoutineTypeId)
                selection.clear()
                setPage(1)
              }}
            >
              <DashboardToolbarSelectTrigger aria-label="Routine type">
                <SelectValue />
              </DashboardToolbarSelectTrigger>
              <SelectContent>
                {ROUTINE_TYPES.map((type) => (
                  <SelectItem key={type.id} value={type.id}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={muscle}
              onValueChange={(value) => {
                setMuscle(value as Muscle | "all")
                setPage(1)
              }}
            >
              <DashboardToolbarSelectTrigger aria-label="Muscle">
                <SelectValue />
              </DashboardToolbarSelectTrigger>
              <SelectContent>
                <SelectItem value="all">Every muscle</SelectItem>
                {MUSCLES.map((entry) => (
                  <SelectItem key={entry} value={entry}>
                    {MUSCLE_LABELS[entry]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={equipment}
              onValueChange={(value) => {
                setEquipment(value as Equipment | "all")
                setPage(1)
              }}
            >
              <DashboardToolbarSelectTrigger aria-label="Equipment">
                <SelectValue />
              </DashboardToolbarSelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any equipment</SelectItem>
                {EQUIPMENT.map((entry) => (
                  <SelectItem key={entry} value={entry}>
                    {EQUIPMENT_LABELS[entry]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <DashboardToolbarButton type="button" onClick={() => open(null)}>
              <PlusIcon className="size-4" />
              New exercise
            </DashboardToolbarButton>
          </>
        }
        header={
          <SortableTableHeader
            columns={COLUMNS}
            sort={sort}
            direction={direction}
            onSort={toggleSort}
            leading={
              <SelectAllTableHead
                noun="exercises of your own"
                checked={selection.selectAllState(tickable)}
                disabled={tickable.length === 0}
                onCheckedChange={() => selection.toggleVisible(tickable)}
              />
            }
            trailing={<TableHead column="meta">Actions</TableHead>}
          />
        }
        isEmpty={rows.length === 0}
        emptyText={
          exercises.some((exercise) => exercise.routineType === routineType)
            ? "No exercise matches. Clear the search or filters."
            : `No ${routineTypeLabel(routineType).toLowerCase()} exercises yet. Add your own with New exercise.`
        }
        emptyColSpan={7}
        footer={{
          type: "pagination",
          page: shownPage,
          pageSize: PAGE_SIZE,
          total: rows.length,
          totalPages,
          onPageChange: setPage,
        }}
      >
        {visible.map((exercise) => (
          <TableRow key={exercise.id} className="group" rowAction={() => open(exercise)}>
            <TableCell column="select">
              {exercise.builtIn ? null : (
                <Checkbox
                  checked={selection.selected.has(exercise.id)}
                  onCheckedChange={() => selection.toggle(exercise.id)}
                  aria-label={`Select ${exercise.name}`}
                />
              )}
            </TableCell>
            <TableCell column="main">
              <span className="flex min-w-0 items-center gap-2">
                <button
                  type="button"
                  className="block max-w-80 truncate text-left text-sm font-medium group-hover:underline"
                  onClick={() => open(exercise)}
                >
                  {exercise.name}
                </button>
                {exercise.builtIn ? null : <Badge variant="secondary">Yours</Badge>}
                {exercise.avoided ? (
                  <Badge variant="outline">
                    <TriangleAlertIcon />
                    Painful
                  </Badge>
                ) : null}
              </span>
            </TableCell>
            <TableCell column="meta" className="hidden lg:table-cell">
              {routineTypeLabel(exercise.routineType)}
            </TableCell>
            <TableCell column="meta">
              {exercise.muscles[0] ? MUSCLE_LABELS[exercise.muscles[0]] : <span className="text-muted-foreground">Not set</span>}
            </TableCell>
            <TableCell column="meta" className="hidden max-w-56 md:table-cell">
              <span className="block truncate">
                {exercise.equipment.map((item) => EQUIPMENT_LABELS[item]).join(", ") || "Not set"}
              </span>
            </TableCell>
            <TableCell column="meta" className="hidden xl:table-cell">
              {MOVEMENT_LABELS[exercise.movement]}
            </TableCell>
            <TableCell column="actions">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={exercise.builtIn ? `Open ${exercise.name}` : `Change ${exercise.name}`}
                onClick={() => open(exercise)}
              >
                <SettingsIcon className="size-4" />
              </Button>
              {exercise.builtIn ? (
                // Built-in lifts can't be deleted; the gap keeps the column lined up.
                <span className="inline-block size-8" aria-hidden />
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Delete ${exercise.name}`}
                  onClick={() => setDeleting([exercise])}
                >
                  <Trash2Icon className="size-4" />
                </Button>
              )}
            </TableCell>
          </TableRow>
        ))}
      </DashboardTable>
      <ExerciseDialog
        open={dialog !== null}
        exercise={openExercise}
        newRoutineType={routineType}
        onClose={close}
        onCreated={(id) => {
          setDialog(null)
          onOpen(id)
        }}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(next) => {
          if (!next && !busy) setDeleting(null)
        }}
        title={
          deleting && deleting.length === 1 ? `Delete ${deleting[0].name}?` : `Delete ${deleting?.length ?? 0} exercises?`
        }
        description="They leave your library and any program that uses them. A lift with logged sets is kept, so its history stays."
        confirmLabel="Delete"
        destructive
        loading={busy}
        onConfirm={() => {
          if (deleting) void remove(deleting)
        }}
      />
    </>
  )
}
