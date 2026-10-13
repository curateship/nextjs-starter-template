import * as React from "react"
import { getRouteApi, useRouter } from "@tanstack/react-router"
import { Loader2Icon, PlusIcon, Trash2Icon } from "lucide-react"

import { PersonAvatar, ProjectDot, RoomNote } from "@/components/project/task-bits"
import { FieldControl } from "@/components/project/task-fields-card"
import { TypeIconGlyph } from "@/components/project/task-type-icon"
import { DueDayPicker } from "@/components/project/due-day-picker"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { DocumentEditor } from "@/components/shared/rich-text-editor"
import {
  createProjectTask,
  createTasksFromLines,
  type NewTaskProject,
} from "@/lib/api/project/tasks"
import {
  emptyWrittenPageBody,
  writtenPageBodyIsEmpty,
  type WrittenPageNode,
} from "@/lib/pages/written-page-body"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { getProjectErrorMessage } from "@/lib/project/errors"
import { notesForEditor, readTaskNotes } from "@/lib/project/notes"
import { LIMITS } from "@/lib/project/rules"
import {
  fillInFirst,
  firstMissingField,
  valueFromDraft,
  visibleFieldIds,
  type FieldDraft,
  type FieldValues,
} from "@/lib/project/task-fields"
import type { TaskType } from "@/lib/project/task-types"
import { linesToTitles } from "@/lib/project/paste-lines"
import { usePeopleRoom } from "@/lib/project/use-people-room"
import { showErrorToast } from "@/lib/toast/error-toast"

const authenticatedRoute = getRouteApi("/_authenticated")
const NOBODY = "nobody"
const NO_TYPE = "none"

/** What a type puts into New task: its steps and its notes, as the editor holds them. */
function templateOf(type: TaskType | undefined) {
  return {
    steps: type?.steps ?? [],
    notes: type ? notesForEditor(readTaskNotes(type.notes)) : emptyWrittenPageBody(),
  }
}

/**
 * The fields New task asks for: each one "Needed when made", and any dropdown
 * that decides whether one of those shows. File fields wait until the task
 * exists.
 */
function fieldsAskedFor(type: TaskType | undefined) {
  if (!type) return []
  const needed = type.fields.filter((field) => field.neededWhenMade && field.kind !== "file")
  const controllers = new Set(needed.flatMap((field) => field.settings.showWhen?.fieldId ?? []))
  return type.fields.filter(
    (field) => field.kind !== "file" && (field.neededWhenMade || controllers.has(field.id))
  )
}

/**
 * A new task. It starts assigned to its maker when they are on the project.
 * Handing it to someone else leaves it Waiting until they accept, and tells
 * them in the bell.
 *
 * From a project page it makes the task there. From the header's New task
 * (`projects` holds more than one) it asks which project, with the one last
 * used chosen first. Pasting several lines into the title offers to make one
 * task per line.
 *
 * Picking a task type fills the Steps card and the notes from the type, and
 * asks for the type's fields that are needed when it is made. A pasted list
 * is made without a type.
 */
export function NewTaskDialog({
  projects,
  types,
  initialProjectId,
  initialTitle = "",
  open,
  onClose,
  onCreated,
}: {
  projects: NewTaskProject[]
  /** The team's types; each project says which of them it offers. */
  types: TaskType[]
  initialProjectId: string
  /** The title the window opens with, such as a line of a meeting's notes. */
  initialTitle?: string
  open: boolean
  onClose: () => void
  /**
   * Told which project the task went into, so the header can remember it, and
   * the new task's id. A pasted list makes several, so it has none.
   */
  onCreated?: (projectId: string, taskId: string | null) => void
}) {
  const router = useRouter()
  const me = authenticatedRoute.useLoaderData().user
  const [projectId, setProjectId] = React.useState(initialProjectId)
  const project = projects.find((p) => p.id === projectId) ?? projects[0]
  const startingAssignee = (target: NewTaskProject | undefined) =>
    target?.members.some((m) => m.userId === me.id) ? me.id : NOBODY

  const [title, setTitle] = React.useState("")
  const [pasted, setPasted] = React.useState<string[] | null>(null)
  const [notes, setNotes] = React.useState<WrittenPageNode>(emptyWrittenPageBody)
  const [assignee, setAssignee] = React.useState(() => startingAssignee(project))
  const [handoverNote, setHandoverNote] = React.useState("")
  const room = usePeopleRoom(open)
  const [due, setDue] = React.useState<string | null>(null)
  const [steps, setSteps] = React.useState<string[]>([])
  const [stepText, setStepText] = React.useState("")
  const [invalid, setInvalid] = React.useState(false)
  const offered = (target: NewTaskProject | undefined) =>
    types.filter((type) => target?.typeIds.includes(type.id))
  const startingType = (target: NewTaskProject | undefined) =>
    target?.defaultTypeId && target.typeIds.includes(target.defaultTypeId) ? target.defaultTypeId : NO_TYPE
  const [typeId, setTypeId] = React.useState(() => startingType(project))
  const type = types.find((t) => t.id === typeId)
  // What the type put in, so changing the type swaps it out and keeps what was typed.
  const [template, setTemplate] = React.useState(() => templateOf(undefined))
  const [notesKey, setNotesKey] = React.useState(0)
  const [drafts, setDrafts] = React.useState<Record<string, FieldDraft>>({})
  const [invalidField, setInvalidField] = React.useState<string | null>(null)
  const [run, saving] = useAsyncAction(getProjectErrorMessage)
  // What the type filled in isn't anyone's typing, so it doesn't ask before closing.
  const notesTyped =
    !writtenPageBodyIsEmpty(notes) && JSON.stringify(notes) !== JSON.stringify(template.notes)
  const stepsTyped = steps.join("\n") !== template.steps.join("\n")
  const dirty = Boolean(
    title.trim() ||
      pasted ||
      notesTyped ||
      stepsTyped ||
      stepText.trim() ||
      due ||
      handoverNote.trim() ||
      Object.values(drafts).some((draft) => draft !== "" && draft !== false)
  )

  /** Swaps the old type's steps and notes for the new one's, keeping anything typed. */
  function applyType(nextId: string, current = { steps, notes }) {
    const next = templateOf(types.find((t) => t.id === nextId))
    const untouchedNotes =
      writtenPageBodyIsEmpty(current.notes) || JSON.stringify(current.notes) === JSON.stringify(template.notes)
    setTypeId(nextId)
    setSteps([
      ...next.steps,
      ...current.steps.filter((step) => !template.steps.includes(step) && !next.steps.includes(step)),
    ].slice(0, LIMITS.stepsPerTask))
    if (untouchedNotes) {
      setNotes(next.notes)
      setNotesKey((key) => key + 1)
    }
    setTemplate(next)
    setInvalidField(null)
  }

  // Opening again starts on the project the caller chose. False at first, so
  // a window that mounts open still fills in its type's steps and notes.
  const [wasOpen, setWasOpen] = React.useState(false)
  if (wasOpen !== open) {
    setWasOpen(open)
    const target = projects.find((p) => p.id === initialProjectId) ?? projects[0]
    if (open && initialProjectId !== projectId) {
      setProjectId(initialProjectId)
      setAssignee(startingAssignee(target))
    }
    // Each opening starts on the project's default type, with its steps and notes.
    if (open) {
      applyType(startingType(target), { steps: [], notes: emptyWrittenPageBody() })
      setTitle(initialTitle.slice(0, LIMITS.taskTitle))
    }
  }

  function pickProject(id: string) {
    setProjectId(id)
    const next = projects.find((p) => p.id === id)
    // Someone who isn't on the new project can't be handed the task there.
    if (assignee !== NOBODY && !next?.members.some((m) => m.userId === assignee)) {
      setAssignee(startingAssignee(next))
    }
    // A type the new project doesn't offer gives way to that project's default.
    if (typeId !== NO_TYPE && !next?.typeIds.includes(typeId)) applyType(startingType(next))
  }

  function reset() {
    setTitle("")
    setPasted(null)
    setNotes(emptyWrittenPageBody())
    setAssignee(startingAssignee(project))
    setHandoverNote("")
    setDue(null)
    setSteps([])
    setStepText("")
    setInvalid(false)
    setTypeId(startingType(project))
    setTemplate(templateOf(undefined))
    setDrafts({})
    setInvalidField(null)
  }

  function close() {
    reset()
    onClose()
  }

  function addStep() {
    const next = stepText.trim()
    if (!next) return
    if (steps.length >= LIMITS.stepsPerTask) {
      showErrorToast(`A task can have at most ${LIMITS.stepsPerTask} steps.`)
      return
    }
    setSteps((current) => [...current, next])
    setStepText("")
  }

  function onPasteTitle(event: React.ClipboardEvent<HTMLInputElement>) {
    const titles = linesToTitles(event.clipboardData.getData("text"))
    if (titles.length < 2) return
    event.preventDefault()
    if (titles.length > LIMITS.tasksPerPaste) {
      showErrorToast(
        `That's ${titles.length} lines. Paste at most ${LIMITS.tasksPerPaste} at once, one task per line.`
      )
      return
    }
    setPasted(titles)
  }

  /** Marks the field, says why, and takes the cursor there, since it may sit below the fold. */
  function showFieldProblem(fieldId: string, message: string) {
    setInvalidField(fieldId)
    showErrorToast(message)
    document.getElementById(`new-task-field-${fieldId}`)?.focus()
  }

  async function create() {
    if (!project) return
    const assigneeUserId = assignee === NOBODY ? null : assignee
    const someoneElse = assigneeUserId && assigneeUserId !== me.id
    const name = project.members.find((m) => m.userId === assigneeUserId)?.name
    // The note only goes with a task handed to someone else.
    const note = someoneElse ? handoverNote.trim() || null : null
    let madeId: string | null = null
    if (pasted) {
      const ok = await run(
        () =>
          createTasksFromLines({
            projectId: project.id,
            titles: pasted,
            assigneeUserId,
            dueDate: due,
            handoverNote: note,
          }),
        `${pasted.length} tasks made${someoneElse && name ? ` and handed to ${name}` : ""}.`
      )
      if (!ok) return
    } else {
      if (!title.trim()) {
        setInvalid(true)
        showErrorToast("Give the task a title.")
        return
      }
      // The type's fields needed when made, checked here to spare a round trip.
      const asked = fieldsAskedFor(type)
      const fieldValues: FieldValues = {}
      for (const field of asked) {
        const result = valueFromDraft(field.kind, drafts[field.id] ?? (field.kind === "checkbox" ? false : ""))
        if ("error" in result) {
          showFieldProblem(field.id, result.error)
          return
        }
        if (result.value !== null) fieldValues[field.id] = result.value
      }
      const missing = type ? firstMissingField(type.fields, fieldValues, "made") : null
      if (missing) {
        showFieldProblem(missing.id, fillInFirst(missing))
        return
      }
      // A step still in the "Add a step" box goes with the task, as if added.
      const typedStep = stepText.trim()
      if (typedStep && steps.length >= LIMITS.stepsPerTask) {
        showErrorToast(`A task can have at most ${LIMITS.stepsPerTask} steps.`)
        return
      }
      const ok = await run(
        async () => {
          const made = await createProjectTask({
            projectId: project.id,
            title,
            notes,
            assigneeUserId,
            dueDate: due,
            steps: typedStep ? [...steps, typedStep] : steps,
            handoverNote: note,
            typeId: type ? type.id : null,
            fieldValues,
          })
          madeId = made.id
        },
        someoneElse && name ? `Task handed to ${name}.` : "Task created."
      )
      if (!ok) return
    }
    onCreated?.(project.id, madeId)
    close()
    await router.invalidate()
  }

  return (
    <FormDialog open={open} dirty={dirty} busy={saving} onClose={close}>
      {(requestClose) => (
        <DialogContent variant="admin" className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New task</DialogTitle>
            <DialogDescription>
              {projects.length > 1
                ? "A task handed to someone else waits for them to accept it."
                : `In ${project?.name ?? "this project"}. A task handed to someone else waits for them to accept it.`}
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(event) => {
              event.preventDefault()
              void create()
            }}
          >
            <DialogBody>
              <Card size="sm">
                <CardHeader>
                  <CardTitle>Task</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4">
                  {projects.length > 1 ? (
                    <div className="grid gap-2">
                      <Label htmlFor="new-task-project">Project</Label>
                      <Select value={project?.id} onValueChange={pickProject}>
                        <SelectTrigger id="new-task-project" className="w-full sm:w-fit">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {projects.map((option) => (
                            <SelectItem key={option.id} value={option.id}>
                              <ProjectDot color={option.color} />
                              {option.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : null}
                  {pasted ? (
                    <PastedLines
                      titles={pasted}
                      onKeepOne={() => {
                        setTitle(pasted.join(" ").slice(0, LIMITS.taskTitle))
                        setPasted(null)
                      }}
                    />
                  ) : (
                    <div className="grid gap-2">
                      <Label htmlFor="new-task-title">Title</Label>
                      <Input
                        id="new-task-title"
                        value={title}
                        maxLength={LIMITS.taskTitle}
                        aria-invalid={invalid || undefined}
                        onPaste={onPasteTitle}
                        onChange={(event) => {
                          setTitle(event.target.value)
                          setInvalid(false)
                        }}
                      />
                    </div>
                  )}
                  {offered(project).length ? (
                    pasted ? (
                      <p className="text-sm text-muted-foreground">
                        Pasted tasks are made without a type. Pick their type one by one.
                      </p>
                    ) : (
                      <div className="grid gap-2">
                        <Label htmlFor="new-task-type">Type</Label>
                        <Select value={typeId} onValueChange={(value) => applyType(value)}>
                          <SelectTrigger id="new-task-type" className="w-full sm:w-fit">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={NO_TYPE}>Plain task</SelectItem>
                            {offered(project).map((option) => (
                              <SelectItem key={option.id} value={option.id}>
                                <TypeIconGlyph icon={option.icon} color={option.color} />
                                {option.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )
                  ) : null}
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="grid gap-2">
                      <Label htmlFor="new-task-assignee">Assigned to</Label>
                      <Select value={assignee} onValueChange={setAssignee}>
                        <SelectTrigger id="new-task-assignee" className="w-full sm:w-fit">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NOBODY}>Nobody</SelectItem>
                          {(project?.members ?? []).map((member) => (
                            <SelectItem key={member.userId} value={member.userId}>
                              <PersonAvatar name={member.name} avatarUrl={member.avatarUrl} />
                              {member.userId === me.id ? `${member.name} (you)` : member.name}
                              <RoomNote room={room[member.userId]} />
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="new-task-due">Due date</Label>
                      <DueDayPicker id="new-task-due" value={due} onChange={setDue} placeholder="No due date" />
                    </div>
                  </div>
                  {assignee !== NOBODY && assignee !== me.id ? (
                    <div className="grid gap-2">
                      <Label htmlFor="new-task-handover-note">
                        Note for {project?.members.find((m) => m.userId === assignee)?.name ?? "them"} (optional)
                      </Label>
                      <Input
                        id="new-task-handover-note"
                        value={handoverNote}
                        maxLength={LIMITS.handoverNote}
                        placeholder={
                          pasted
                            ? `Goes with all ${pasted.length} tasks`
                            : "Client wants it by Thursday"
                        }
                        onChange={(event) => setHandoverNote(event.target.value)}
                      />
                    </div>
                  ) : null}
                  {pasted ? null : (
                    <div className="grid gap-2" role="group" aria-labelledby="new-task-notes-label">
                      <Label id="new-task-notes-label" asChild>
                        <span>Notes</span>
                      </Label>
                      <div className="[&_.page-rte_.tiptap]:min-h-20 [&_.page-rte_.tiptap]:px-3 [&_.page-rte_.tiptap]:py-2 [&_.page-rte_.tiptap]:text-sm">
                        <DocumentEditor
                          key={notesKey}
                          value={notes}
                          onChange={setNotes}
                          placeholder="Anything the person doing it should know. Select words to make them bold, a list or a link."
                        />
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
              {pasted || !type ? null : (
                <NewTaskFields
                  type={type}
                  drafts={drafts}
                  invalidField={invalidField}
                  people={(project?.members ?? []).map((m) => ({ id: m.userId, name: m.name, avatarUrl: m.avatarUrl }))}
                  onDraft={(fieldId, draft) => {
                    setDrafts((current) => ({ ...current, [fieldId]: draft }))
                    setInvalidField(null)
                  }}
                />
              )}
              {pasted ? null : (
                <Card size="sm">
                  <CardHeader>
                    <CardTitle>Steps</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-4">
                    {steps.length ? (
                      <ol className="grid gap-2">
                        {steps.map((step, index) => (
                          <li key={`${index}-${step}`} className="flex items-center gap-2 text-sm">
                            <span className="min-w-0 flex-1 break-words">{step}</span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              aria-label={`Remove the step "${step}"`}
                              onClick={() =>
                                setSteps((current) => current.filter((_, i) => i !== index))
                              }
                            >
                              <Trash2Icon className="size-4" />
                            </Button>
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Optional. Steps show progress as "3 of 5 steps done".
                      </p>
                    )}
                    <div className="flex gap-2">
                      <Input
                        aria-label="New step"
                        placeholder="Add a step"
                        value={stepText}
                        maxLength={LIMITS.stepText}
                        onChange={(event) => setStepText(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault()
                            addStep()
                          }
                        }}
                      />
                      <Button type="button" variant="outline" onClick={addStep}>
                        <PlusIcon className="size-4" />
                        Add
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={requestClose} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? <Loader2Icon className="size-4 animate-spin" /> : null}
                {pasted ? `Make ${pasted.length} tasks` : "Create task"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      )}
    </FormDialog>
  )
}

/** The pasted lines, one task each, with a way back to a single title. */
function PastedLines({ titles, onKeepOne }: { titles: string[]; onKeepOne: () => void }) {
  return (
    <div className="grid gap-2">
      <p className="text-sm font-medium">Make {titles.length} tasks, one per line?</p>
      <ol className="grid max-h-48 list-decimal gap-1 overflow-hidden pl-5 text-sm">
        {titles.slice(0, 8).map((title, index) => (
          <li key={`${index}-${title}`} className="break-words">
            {title}
          </li>
        ))}
      </ol>
      {titles.length > 8 ? (
        <p className="text-sm text-muted-foreground">and {titles.length - 8} more.</p>
      ) : null}
      <p className="text-sm text-muted-foreground">
        Each gets the person and due date picked below. Blank lines and bullet marks were left out.
      </p>
      <div>
        <Button type="button" variant="outline" size="sm" onClick={onKeepOne}>
          No, make one task
        </Button>
      </div>
    </div>
  )
}

/** The picked type's fields that must be filled before the task is made. */
function NewTaskFields({
  type,
  drafts,
  invalidField,
  people,
  onDraft,
}: {
  type: TaskType
  drafts: Record<string, FieldDraft>
  invalidField: string | null
  people: { id: string; name: string; avatarUrl: string }[]
  onDraft: (fieldId: string, draft: FieldDraft) => void
}) {
  const asked = fieldsAskedFor(type)
  if (asked.length === 0) return null
  // Which show right now, worked out from what has been filled in so far.
  const values: FieldValues = {}
  for (const field of asked) {
    const result = valueFromDraft(field.kind, drafts[field.id] ?? "")
    if ("value" in result && result.value !== null) values[field.id] = result.value
  }
  const visible = visibleFieldIds(type.fields, values)
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TypeIconGlyph icon={type.icon} color={type.color} />
          {type.name}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <p className="text-sm text-muted-foreground">Fill these in now. The rest can wait for the task.</p>
        {asked
          .filter((field) => visible.has(field.id))
          .map((field) => {
            const id = `new-task-field-${field.id}`
            return (
              <div key={field.id} className="grid gap-2">
                <Label htmlFor={id}>
                  {field.name}
                  {field.neededWhenMade ? null : <span className="font-normal text-muted-foreground"> (optional)</span>}
                </Label>
                <FieldControl
                  id={id}
                  field={field}
                  draft={drafts[field.id] ?? (field.kind === "checkbox" ? false : "")}
                  people={people}
                  invalid={invalidField === field.id}
                  onDraft={(draft) => onDraft(field.id, draft)}
                />
              </div>
            )
          })}
      </CardContent>
    </Card>
  )
}
