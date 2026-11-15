import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import { Loader2Icon } from "lucide-react"

import { ReasonDialog } from "@/components/project/reason-dialog"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { AdminAttention } from "@/lib/api/project/admin-dashboard"
import { answerMoreTaskTime, assignProjectTask, type TaskCard } from "@/lib/api/project/tasks"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { dayLabel } from "@/lib/project/days"
import { getProjectErrorMessage } from "@/lib/project/errors"

/**
 * The buttons a row of My tasks' Need your attention tab carries in its
 * Actions (task "My dashboard/left-panel-blocks", Tyler, 6 Nov 2026): Yes and
 * No on an ask for more time that falls to the site admin, and Hand to on a
 * task with nobody on it. They were the Waiting on you and No one on it cards
 * until those left the left panel the same day. Each answer is the task's own,
 * with its history line and notice, and one save waits on its own row only
 * (polish, Tyler, 6 Nov 2026): the other rows stay usable.
 */
export function useAttentionActions(attention: AdminAttention) {
  const router = useRouter()
  const [run] = useAsyncAction(getProjectErrorMessage)
  const [saving, setSaving] = React.useState<ReadonlySet<string>>(() => new Set())
  const [saying, setSaying] = React.useState<TaskCard | null>(null)
  const isSaving = (taskId: string) => saving.has(taskId)

  async function save(taskId: string, work: () => Promise<unknown>) {
    const mark = (on: boolean) =>
      setSaving((current) => {
        const next = new Set(current)
        if (on) next.add(taskId)
        else next.delete(taskId)
        return next
      })
    mark(true)
    try {
      const ok = await run(work)
      if (ok) await router.invalidate()
      return ok
    } finally {
      mark(false)
    }
  }

  function actions(task: TaskCard): React.ReactNode {
    const ask = attention.asks[task.id]
    if (ask) {
      return (
        <>
          {/* Who asked and for when, with their reason on hover, as the card's lines said. */}
          <Tooltip>
            <TooltipTrigger asChild>
              <span tabIndex={0} className="mr-1 text-xs text-muted-foreground">
                Asks for {dayLabel(ask.day)}
              </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-72">
              {ask.askedByName} asks for {dayLabel(ask.day)}
              {task.dueDate ? ` instead of ${dayLabel(task.dueDate)}` : ""}.{ask.reason ? ` "${ask.reason}"` : ""}
            </TooltipContent>
          </Tooltip>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isSaving(task.id)}
            aria-label={`Yes, move "${task.title}" to ${dayLabel(ask.day)}`}
            onClick={() =>
              void save(
                task.id,
                () => answerMoreTaskTime({ taskId: task.id, answer: "yes" })
              )
            }
          >
            {isSaving(task.id) ? <Loader2Icon className="size-4 animate-spin" /> : null}
            Yes
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={isSaving(task.id)} onClick={() => setSaying(task)}>
            No
          </Button>
        </>
      )
    }
    const people = attention.handTo[task.id]
    if (!people) return null
    return (
      <Select
        value=""
        disabled={isSaving(task.id)}
        onValueChange={(assigneeUserId) => {
          void save(task.id, () => assignProjectTask({ taskId: task.id, assigneeUserId }))
        }}
      >
        <SelectTrigger aria-label={`Hand "${task.title}" to`} className="w-32">
          <SelectValue placeholder="Hand to" />
        </SelectTrigger>
        <SelectContent>
          {people.map((person) => (
            <SelectItem key={person.userId} value={person.userId}>
              {person.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  }

  const ask = saying ? attention.asks[saying.id] : undefined
  const dialog = (
    <ReasonDialog
      open={Boolean(saying)}
      title="Keep the date?"
      description={saying && ask ? `${ask.askedByName} is told no, and "${saying.title}" stays due as it is.` : ""}
      label="Why not (optional)"
      confirmLabel="Say no"
      optional
      busy={saying ? isSaving(saying.id) : false}
      onClose={() => setSaying(null)}
      onConfirm={async (reason) => {
        if (!saying) return false
        const ok = await save(
          saying.id,
          () => answerMoreTaskTime({ taskId: saying.id, answer: "no", reason: reason.trim() || null })
        )
        if (ok) setSaying(null)
        return ok
      }}
    />
  )

  return { actions, dialog }
}
