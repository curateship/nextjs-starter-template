import * as React from "react"

import { SettingsWindow } from "@/components/pomodoro/settings-window"
import {
  TaskStepList,
  TaskStepsToggle,
} from "@/components/pomodoro/task-steps"
import {
  NewTaskForm,
  RemoveTaskButton,
  TaskEditForm,
  TaskMarks,
  TaskRowFrame,
} from "@/components/pomodoro/today-task-list"
import { ErrorRow } from "@/components/ui/error-row"
import { LoadingRow } from "@/components/ui/loading-row"
import { sameTags } from "@/lib/pomodoro/task-tags"
import type { TaskItem } from "@/lib/pomodoro/tasks"
import { usePlannedDay } from "@/lib/pomodoro/use-planned-day"
import type { usePomodoro } from "@/lib/pomodoro/use-pomodoro"

type PomodoroApi = ReturnType<typeof usePomodoro>

/**
 * One of the next six days on the Tasks screen. A task here can be added,
 * edited, given steps and tags, and removed. It cannot be ticked, picked as
 * the focus or dragged: those belong to the day itself, when the task turns
 * up on today's list.
 *
 * Drawn the way Today is: rows without a frame of their own, and the add box
 * under its own full-width divider, so switching days only changes the rows.
 */
export function PlannedDayList({
  plannedDate,
  dayName,
  pomodoro,
  tagFilter,
}: {
  plannedDate: string
  /** "Thursday", for the empty line and the add box's name. */
  dayName: string
  pomodoro: PomodoroApi
  tagFilter: string | null
}) {
  const day = usePlannedDay(plannedDate, pomodoro.projects)
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const shown = day.tasks.filter(
    (task) => !tagFilter || task.tags.includes(tagFilter)
  )

  return (
    <>
      <div className="flex flex-col gap-2 px-3 pb-2">
        {day.loading ? (
          <LoadingRow label={`Loading ${dayName}…`} className="py-4" />
        ) : null}
        {day.failed ? (
          <ErrorRow
            message={`${dayName}'s tasks could not be loaded.`}
            onRetry={day.retry}
          />
        ) : null}
        {!day.loading && !day.failed && !shown.length ? (
          <p className="px-3 py-2 text-sm text-muted-foreground">
            {tagFilter
              ? `Nothing on ${dayName} is tagged ${tagFilter}.`
              : `Nothing planned for ${dayName} yet. Add a task below and it will be on your list that morning.`}
          </p>
        ) : null}
        {shown.map((task) => (
          <PlannedTaskRow
            key={task.id}
            task={task}
            day={day}
            pomodoro={pomodoro}
            editing={editingId === task.id}
            onEditingChange={(editing) => setEditingId(editing ? task.id : null)}
          />
        ))}
      </div>
      {day.failed ? null : (
        <div className="border-t px-3 py-3">
          <NewTaskForm
            onAdd={day.addTask}
            label={`New task for ${dayName}`}
            bare
          />
        </div>
      )}
    </>
  )
}

function PlannedTaskRow({
  task,
  day,
  pomodoro,
  editing,
  onEditingChange,
}: {
  task: TaskItem
  day: ReturnType<typeof usePlannedDay>
  pomodoro: PomodoroApi
  editing: boolean
  onEditingChange: (editing: boolean) => void
}) {
  const [stepsOpen, setStepsOpen] = React.useState(false)
  return (
    <TaskRowFrame
      className="border-transparent bg-transparent"
      steps={
        stepsOpen ? (
          <TaskStepList
            taskId={task.id}
            taskTitle={task.title}
            steps={task.steps}
            readOnly={false}
            onStepsChange={(update) => day.setTaskSteps(task.id, update)}
            onClose={() => setStepsOpen(false)}
          />
        ) : null
      }
    >
      <span className="flex min-w-0 flex-1 items-center gap-2 py-2 pl-1">
        <span className="truncate text-sm">{task.title}</span>
        <TaskMarks task={task} />
      </span>
      <TaskStepsToggle
        taskTitle={task.title}
        steps={task.steps}
        expanded={stepsOpen}
        onToggle={() => setStepsOpen((open) => !open)}
      />
      <SettingsWindow
        label={`Edit ${task.title}`}
        open={editing}
        onOpenChange={onEditingChange}
      >
        <TaskEditForm
          task={task}
          projects={pomodoro.liveProjects}
          tagNames={pomodoro.tagNames}
          allowRepeat={false}
          onAddSteps={
            task.steps.length
              ? undefined
              : () => {
                  onEditingChange(false)
                  setStepsOpen(true)
                }
          }
          onCancel={() => onEditingChange(false)}
          onSave={async ({ tags, repeatWeekdays: _repeat, ...changes }) => {
            if (!(await day.updateTaskDetails(task.id, changes))) return
            if (
              !sameTags(tags, task.tags) &&
              !(await day.setTaskTags(task.id, tags))
            )
              return
            onEditingChange(false)
          }}
        />
      </SettingsWindow>
      <RemoveTaskButton task={task} onRemove={() => day.removeTask(task.id)} />
    </TaskRowFrame>
  )
}
