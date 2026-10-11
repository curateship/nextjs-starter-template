import * as React from "react"
import { Loader2Icon, PlusIcon } from "lucide-react"

import { ProjectColorSelect } from "@/components/project/project-form-fields"
import type { Change } from "@/components/project/task-body"
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
import { FormDialog } from "@/components/ui/form-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { MultiCombobox } from "@/components/ui/multi-combobox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { makeLabel, saveTaskLabels, type Label as TaskLabel } from "@/lib/api/project/sorting"
import { saveTask, type TaskDetail } from "@/lib/api/project/tasks"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { getProjectErrorMessage } from "@/lib/project/errors"
import { LIMITS, type ProjectColor } from "@/lib/project/rules"
import { showErrorToast } from "@/lib/toast/error-toast"

const NO_SECTION = "none"

/** Which of the project's sections the task sits under. */
export function TaskSectionField({
  detail,
  readOnly,
  busy,
  change,
}: {
  detail: TaskDetail
  readOnly: boolean
  busy: boolean
  change: Change
}) {
  const { task } = detail
  return (
    <div className="grid content-start gap-2">
      <Label htmlFor="task-section">Section</Label>
      <Select
        value={task.section?.id ?? NO_SECTION}
        onValueChange={(value) =>
          void change(() =>
            saveTask({ taskId: task.id, sectionId: value === NO_SECTION ? null : value })
          )
        }
        disabled={readOnly || busy}
      >
        <SelectTrigger id="task-section" className="w-full sm:w-fit">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_SECTION}>
            {detail.sections.length ? "No section" : "No sections yet"}
          </SelectItem>
          {detail.sections.map((section) => (
            <SelectItem key={section.id} value={section.id}>
              {section.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

/**
 * The task's labels, picked from the team's. New label makes one and puts it
 * on the task. Names are unique in a team, so the picker can work by name.
 */
export function TaskLabelsField({
  detail,
  readOnly,
  busy,
  change,
}: {
  detail: TaskDetail
  readOnly: boolean
  busy: boolean
  change: Change
}) {
  const { task } = detail
  const [making, setMaking] = React.useState(false)
  const byName = new Map(detail.labels.map((label) => [label.name, label.id]))

  function save(labelIds: string[]) {
    return change(() => saveTaskLabels(task.id, labelIds))
  }

  return (
    <div className="grid content-start gap-2">
      <Label htmlFor="task-labels">Labels</Label>
      <div className="flex flex-wrap items-center gap-2">
        <MultiCombobox
          id="task-labels"
          className="sm:w-64"
          value={task.labels.map((label) => label.name)}
          options={detail.labels.map((label) => label.name)}
          placeholder="No labels"
          searchPlaceholder="Search labels"
          emptyLabel="Your team has no labels yet"
          disabled={readOnly || busy}
          onChange={(names) =>
            void save(names.map((name) => byName.get(name)).filter((id): id is string => Boolean(id)))
          }
        />
        {readOnly ? null : (
          <Button type="button" variant="outline" onClick={() => setMaking(true)}>
            <PlusIcon className="size-4" />
            New label
          </Button>
        )}
      </div>
      <NewLabelDialog
        open={making}
        onClose={() => setMaking(false)}
        onMade={(label) => save([...task.labels.map((l) => l.id), label.id])}
      />
    </div>
  )
}

/** Makes a team label. Anyone on the team can; owners and admins rename and delete them. */
function NewLabelDialog({
  open,
  onClose,
  onMade,
}: {
  open: boolean
  onClose: () => void
  onMade: (label: TaskLabel) => Promise<boolean>
}) {
  const [name, setName] = React.useState("")
  const [color, setColor] = React.useState<ProjectColor>("blue")
  const [invalid, setInvalid] = React.useState(false)
  const [run, busy] = useAsyncAction(getProjectErrorMessage)

  function close() {
    setName("")
    setColor("blue")
    setInvalid(false)
    onClose()
  }

  async function submit() {
    const next = name.trim()
    if (!next) {
      setInvalid(true)
      showErrorToast("Give the label a name.")
      return
    }
    let made: TaskLabel | null = null
    const ok = await run(async () => {
      made = await makeLabel({ name: next, color })
    })
    if (!ok || !made) return
    await onMade(made)
    close()
  }

  return (
    <FormDialog open={open} dirty={Boolean(name.trim())} busy={busy} onClose={close}>
      {(requestClose) => (
        <DialogContent variant="admin" className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New label</DialogTitle>
            <DialogDescription>
              Labels belong to the team, so everyone can use this one on any task.
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(event) => {
              event.preventDefault()
              void submit()
            }}
          >
            <DialogBody>
              <Card size="sm">
                <CardHeader>
                  <CardTitle>Label</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="new-label-name">Name</Label>
                    <Input
                      id="new-label-name"
                      value={name}
                      maxLength={LIMITS.labelName}
                      placeholder="Bug, Client, Waiting on supplier…"
                      aria-invalid={invalid || undefined}
                      onChange={(event) => {
                        setName(event.target.value)
                        setInvalid(false)
                      }}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="new-label-color">Colour</Label>
                    <ProjectColorSelect id="new-label-color" value={color} onChange={setColor} />
                  </div>
                </CardContent>
              </Card>
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={requestClose} disabled={busy}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
                Create label
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      )}
    </FormDialog>
  )
}
