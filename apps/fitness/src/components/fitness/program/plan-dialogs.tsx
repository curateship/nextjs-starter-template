import * as React from "react"
import { Loader2Icon, SparklesIcon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { NumberField } from "@/components/ui/number-field"
import { askForAiPlan, changeProgram, saveAiPlan, type PlanDraft } from "@/lib/api/fitness/programs"
import { WEEKDAY_NAMES } from "@/lib/fitness/dates"
import { reportFitnessError } from "@/lib/fitness/report-error"
import { formatWeight, type WeightUnit } from "@/lib/fitness/weights"

/**
 * Picks one of the starter weeks. Using one replaces the program's whole
 * week and lays the calendar out again, so the window says so before
 * anything is pressed.
 */
export function TemplateDialog({
  open,
  programId,
  templates,
  hasPlan,
  onClose,
  onDone,
}: {
  open: boolean
  programId: string
  templates: readonly { id: string; label: string; description: string }[]
  hasPlan: boolean
  onClose: () => void
  onDone: () => Promise<void>
}) {
  const [busy, setBusy] = React.useState<string | null>(null)

  async function use(templateId: string, label: string) {
    setBusy(templateId)
    try {
      await changeProgram({ action: "template", programId, templateId })
      toast.success(`${label} is now your week.`)
      await onDone()
      onClose()
    } catch (error) {
      reportFitnessError(error)
    } finally {
      setBusy(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && busy === null && onClose()}>
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>Start from a template</DialogTitle>
          <DialogDescription>
            {hasPlan
              ? "Using a template replaces the whole week you have now. Workouts you already logged stay in History."
              : "Each lift starts at 75 out of 100 of the best lift in your starting data, or empty when you gave none."}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-6">
          {templates.map((template) => (
            <Card key={template.id} size="sm">
              <CardHeader>
                <CardTitle>{template.label}</CardTitle>
                <CardDescription>{template.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy !== null}
                  onClick={() => void use(template.id, template.label)}
                >
                  {busy === template.id ? <Loader2Icon className="animate-spin" /> : null}
                  {hasPlan ? `Replace my week with ${template.label}` : `Use ${template.label}`}
                </Button>
              </CardContent>
            </Card>
          ))}
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" size="lg" disabled={busy !== null} onClick={onClose}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * "Build the week with AI": the AI writes a week from the starting data, each
 * workout on its own weekday. The draft is shown here to read first; nothing
 * changes until Use this week.
 */
export function AiPlanDialog({
  open,
  programId,
  defaultDays,
  unit,
  hasPlan,
  onClose,
  onDone,
}: {
  open: boolean
  programId: string
  defaultDays: number
  unit: WeightUnit
  hasPlan: boolean
  onClose: () => void
  onDone: () => Promise<void>
}) {
  const [days, setDays] = React.useState(defaultDays)
  const [draft, setDraft] = React.useState<PlanDraft | null>(null)
  const [busy, setBusy] = React.useState<"build" | "use" | null>(null)
  const [wasOpen, setWasOpen] = React.useState(open)
  if (wasOpen !== open) {
    setWasOpen(open)
    if (open) {
      setDays(Math.min(Math.max(defaultDays, 1), 6))
      setDraft(null)
    }
  }

  async function build() {
    setBusy("build")
    try {
      setDraft(await askForAiPlan(programId, days))
    } catch (error) {
      reportFitnessError(error)
    } finally {
      setBusy(null)
    }
  }

  async function use() {
    if (!draft) return
    setBusy("use")
    try {
      await saveAiPlan(programId, draft)
      toast.success("The AI's week is now your week.")
      await onDone()
      onClose()
    } catch (error) {
      reportFitnessError(error)
    } finally {
      setBusy(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && busy === null && onClose()}>
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>Build the week with AI</DialogTitle>
          <DialogDescription>
            The AI uses your goal, experience and equipment from Starting data, and only lifts in the library. A
            beginner gets at most four days and five lifts a day.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-6">
          <Card size="sm">
            <CardContent className="grid gap-4 sm:grid-cols-[12rem_auto] sm:items-end">
              <NumberField
                id="ai-plan-days"
                label="Days a week"
                value={days}
                min={1}
                max={6}
                onChange={setDays}
              />
              <Button type="button" variant="outline" disabled={busy !== null} onClick={() => void build()}>
                {busy === "build" ? <Loader2Icon className="animate-spin" /> : <SparklesIcon />}
                {draft ? "Build another" : "Build the week"}
              </Button>
            </CardContent>
          </Card>
          {draft ? (
            <>
              <p className="text-muted-foreground">
                Every other weekday is a rest day.{hasPlan ? " Using it replaces your current week." : ""}
              </p>
              {draft.days.map((day, index) => (
                <Card key={`${day.name}-${index}`} size="sm">
                  <CardHeader>
                    <CardTitle>
                      {WEEKDAY_NAMES[day.weekday]} · {day.name}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="grid gap-1.5">
                      {day.exercises.map((exercise, position) => (
                        <li key={`${exercise.exerciseId}-${position}`} className="flex gap-2">
                          <span className="min-w-0 flex-1 truncate">{exercise.name}</span>
                          <span className="shrink-0 text-muted-foreground tabular-nums">
                            {exercise.sets} x {exercise.reps}
                            {exercise.weightKg > 0 ? ` at ${formatWeight(exercise.weightKg, unit)}` : ""}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              ))}
            </>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" size="lg" disabled={busy !== null} onClick={onClose}>
            Cancel
          </Button>
          {draft ? (
            <Button type="button" size="lg" disabled={busy !== null} onClick={() => void use()}>
              {busy === "use" ? <Loader2Icon className="animate-spin" /> : null}
              Use this week
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
