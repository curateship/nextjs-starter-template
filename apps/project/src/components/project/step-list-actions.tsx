import * as React from "react"
import { ListChecksIcon, ListPlusIcon } from "lucide-react"

import type { Change } from "@/components/project/task-body"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { addStepListTo, saveTaskStepsAsList } from "@/lib/api/project/planning"
import type { TaskDetail } from "@/lib/api/project/tasks"
import { LIMITS } from "@/lib/project/rules"
import { useEscapeCancels } from "@/lib/project/use-escape-cancels"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * Under a task's steps: "Add a step list" drops one of the team's saved lists
 * in after the steps already there, and "Save these steps as a list" keeps
 * this task's steps under a name for next time. The owner and admins rename
 * and delete lists in Team settings.
 */
export function StepListActions({
  detail,
  change,
  busy,
}: {
  detail: TaskDetail
  change: Change
  busy: boolean
}) {
  const [naming, setNaming] = React.useState(false)
  const [name, setName] = React.useState("")
  const frame = React.useRef<HTMLDivElement>(null)
  const taskId = detail.task.id
  const lists = detail.stepLists

  function stopNaming() {
    setNaming(false)
    setName("")
  }
  useEscapeCancels(frame, stopNaming)

  async function save() {
    const next = name.trim()
    if (!next) {
      showErrorToast("Give the list a name.")
      return
    }
    if (await change(() => saveTaskStepsAsList(taskId, next), `Saved as "${next}". Anyone on the team can add it to a task.`)) {
      stopNaming()
    }
  }

  if (naming) {
    return (
      <div ref={frame} className="grid gap-2">
        <Label htmlFor="step-list-name">Name for this step list</Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id="step-list-name"
            value={name}
            maxLength={LIMITS.stepListName}
            placeholder="Payroll"
            autoFocus
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault()
                void save()
              }
            }}
          />
          <div className="flex shrink-0 gap-2">
            <Button type="button" variant="outline" onClick={stopNaming}>
              Cancel
            </Button>
            <Button type="button" disabled={busy} onClick={() => void save()}>
              Save list
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-wrap gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="sm" disabled={busy}>
            <ListPlusIcon className="size-4" />
            Add a step list
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-w-72">
          {lists.length === 0 ? (
            <DropdownMenuLabel className="font-normal text-muted-foreground">
              No step lists yet. Save a task's steps as one first.
            </DropdownMenuLabel>
          ) : (
            lists.map((list) => (
              <DropdownMenuItem
                key={list.id}
                onSelect={() =>
                  void change(
                    () => addStepListTo(taskId, list.id),
                    `Added ${list.stepCount} ${list.stepCount === 1 ? "step" : "steps"} from "${list.name}".`
                  )
                }
              >
                <span className="min-w-0 flex-1 truncate">{list.name}</span>
                <span className="text-xs text-muted-foreground">
                  {list.stepCount} {list.stepCount === 1 ? "step" : "steps"}
                </span>
              </DropdownMenuItem>
            ))
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {detail.steps.length ? (
        <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => setNaming(true)}>
          <ListChecksIcon className="size-4" />
          Save these steps as a list
        </Button>
      ) : null}
    </div>
  )
}
