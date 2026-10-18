import * as React from "react"
import { SearchIcon, TriangleAlertIcon } from "lucide-react"

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
  const [query, setQuery] = React.useState("")
  const [muscle, setMuscle] = React.useState<Muscle | "all">("all")
  const searchId = React.useId()

  const shown = React.useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
    return exercises.filter(
      (exercise) =>
        (muscle === "all" || exercise.muscles.includes(muscle)) &&
        words.every((word) => exercise.name.toLowerCase().includes(word))
    )
  }, [exercises, muscle, query])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <DialogBody className="grid gap-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id={searchId}
                aria-label="Search exercises"
                placeholder="Search exercises"
                className="pl-8"
                value={query}
                autoFocus
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <Select value={muscle} onValueChange={(value) => setMuscle(value as Muscle | "all")}>
              <SelectTrigger aria-label="Muscle" className="sm:w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Every muscle</SelectItem>
                {MUSCLES.map((entry) => (
                  <SelectItem key={entry} value={entry}>
                    {MUSCLE_LABELS[entry]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="rounded-lg border">
            {shown.length === 0 ? (
              <p className="p-4 text-muted-foreground">
                No exercise matches. Add your own on the Exercises dashboard.
              </p>
            ) : (
              <ul className="divide-y">
                {shown.map((exercise) => (
                  <li key={exercise.id}>
                    <button
                      type="button"
                      className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                      onClick={() => {
                        onPick(exercise)
                        onOpenChange(false)
                      }}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{exercise.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {exercise.muscles.map((entry) => MUSCLE_LABELS[entry]).join(", ") || "No muscle set"}
                          {exercise.equipment.length
                            ? ` · ${exercise.equipment.map((entry) => EQUIPMENT_LABELS[entry]).join(", ")}`
                            : ""}
                        </span>
                      </span>
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
            )}
          </div>
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
