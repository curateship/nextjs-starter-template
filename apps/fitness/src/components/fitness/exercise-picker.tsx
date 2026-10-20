import * as React from "react"
import { CheckIcon, SearchIcon, TriangleAlertIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
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
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { Exercise } from "@/lib/api/fitness/exercises"
import {
  EQUIPMENT_LABELS,
  MUSCLES,
  MUSCLE_LABELS,
  type Muscle,
} from "@/lib/fitness/exercise-catalog"
import { cn } from "@/lib/utils"

/**
 * Picks one lift from the library: search by name, narrow by muscle. Used by
 * the plan builder, the starting-data form and the workout logger, so the
 * library reads the same everywhere. A lift on the pain list is marked, never
 * hidden, so the person can still pick it on purpose.
 */
export function ExercisePicker({
  open,
  onOpenChange,
  exercises,
  title = "Add an exercise",
  description,
  onPick,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  exercises: readonly Exercise[]
  title?: string
  description?: string
  onPick: (exercise: Exercise) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <DialogBody className="grid gap-4">
          <ExerciseList
            exercises={exercises}
            onPick={(exercise) => {
              onPick(exercise)
              onOpenChange(false)
            }}
          />
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" size="lg" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * The picker's search, muscle choice and list, without a window around it, for
 * a dropdown that can't open a window of its own: the program dashboard's New
 * exercise and the settings window's "Add a best lift". `picked` marks the
 * chosen lift; `compact` keeps the list short enough for a dropdown.
 */
export function ExerciseList({
  exercises,
  picked,
  compact = false,
  muscles = MUSCLES,
  onPick,
}: {
  exercises: readonly Exercise[]
  picked?: string
  compact?: boolean
  /** The muscles the muscle choice offers; every muscle when left out. */
  muscles?: readonly Muscle[]
  onPick: (exercise: Exercise) => void
}) {
  const [query, setQuery] = React.useState("")
  const [muscle, setMuscle] = React.useState<Muscle | "all">("all")

  const shown = React.useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
    return exercises.filter(
      (exercise) =>
        (muscle === "all" || exercise.muscles.includes(muscle)) &&
        words.every((word) => exercise.name.toLowerCase().includes(word))
    )
  }, [exercises, muscle, query])

  const list =
    shown.length === 0 ? (
      <p className={cn("p-4 text-muted-foreground", compact && "text-sm")}>No exercise matches. Add your own on the Exercises dashboard.</p>
    ) : (
      <ul className="divide-y" aria-label="Exercises">
        {shown.map((exercise) => (
          <li key={exercise.id}>
            <button
              type="button"
              aria-pressed={picked === undefined ? undefined : picked === exercise.id}
              className={cn(
                "flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-muted focus-visible:bg-muted focus-visible:outline-none",
                picked === exercise.id && "bg-muted"
              )}
              onClick={() => onPick(exercise)}
            >
              <span className="min-w-0 flex-1">
                <span className={cn("block truncate font-medium", compact && "text-sm")}>{exercise.name}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {exercise.muscles.map((entry) => MUSCLE_LABELS[entry]).join(", ") || "No muscle set"}
                  {exercise.equipment.length ? ` · ${exercise.equipment.map((entry) => EQUIPMENT_LABELS[entry]).join(", ")}` : ""}
                </span>
              </span>
              {picked === exercise.id ? <CheckIcon className="size-4 shrink-0" aria-hidden /> : null}
              {exercise.avoided ? (
                <Badge variant="outline" className="gap-1">
                  <TriangleAlertIcon className="size-3" />
                  Painful
                </Badge>
              ) : null}
              {!exercise.builtIn ? <Badge variant="secondary">Yours</Badge> : null}
            </button>
          </li>
        ))}
      </ul>
    )

  return (
    <div className="grid gap-2">
      <div className={cn("flex flex-col gap-2", !compact && "sm:flex-row")}>
        <div className="relative flex-1">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Search exercises"
            placeholder="Search exercises"
            className="pl-8"
            value={query}
            autoFocus
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <Select value={muscle} onValueChange={(value) => setMuscle(value as Muscle | "all")}>
          <SelectTrigger aria-label="Muscle" className={compact ? undefined : "sm:w-44"}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Every muscle</SelectItem>
            {muscles.map((entry) => (
              <SelectItem key={entry} value={entry}>
                {MUSCLE_LABELS[entry]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {compact ? (
        <ScrollArea className="rounded-lg border" viewportClassName="max-h-56">
          {list}
        </ScrollArea>
      ) : (
        <div className="rounded-lg border">{list}</div>
      )}
    </div>
  )
}
