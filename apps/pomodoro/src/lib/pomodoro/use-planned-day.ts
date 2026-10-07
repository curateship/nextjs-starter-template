import * as React from "react"

import {
  abandonTask,
  createTask,
  loadPlannedDay,
  saveTaskTags,
  updateTask,
} from "@/lib/api/pomodoro/productivity"
import { showErrorToast } from "@/lib/toast/error-toast"
import type { TaskStepItem } from "@/lib/pomodoro/task-steps"
import {
  taskItemFromServer,
  type TaskItem,
  type TaskPriority,
} from "@/lib/pomodoro/tasks"
import { browserTimezone } from "@/lib/pomodoro/timer"
import {
  addTagNames,
  adjustPlannedDayCount,
  type ProjectRow,
} from "@/lib/pomodoro/use-pomodoro"

type Loaded = { date: string; tasks: TaskItem[]; failed: boolean }

/**
 * One future day's tasks, for the Tasks screen's day strip. Kept out of the
 * timer's store on purpose: the timer only ever works on today, and a day
 * planned ahead has no focus to pick, no tick and no order to drag.
 *
 * Adding and removing move the day's count on the strip, which lives in the
 * store, so the two never disagree.
 */
export function usePlannedDay(plannedDate: string, projects: ProjectRow[]) {
  const [loaded, setLoaded] = React.useState<Loaded | null>(null)
  const [reloadKey, setReloadKey] = React.useState(0)

  React.useEffect(() => {
    let current = true
    loadPlannedDay(plannedDate, browserTimezone()).then(
      (rows) => {
        if (current)
          setLoaded({
            date: plannedDate,
            tasks: rows.map(taskItemFromServer),
            failed: false,
          })
      },
      () => {
        if (current) setLoaded({ date: plannedDate, tasks: [], failed: true })
      }
    )
    return () => {
      current = false
    }
  }, [plannedDate, reloadKey])

  // A day whose answer has not arrived yet is loading, which is worked out
  // here rather than set in the effect.
  const ready = loaded?.date === plannedDate ? loaded : null
  const tasks = ready?.tasks ?? []

  const writeTasks = (update: (tasks: TaskItem[]) => TaskItem[]) =>
    setLoaded((previous) =>
      previous && previous.date === plannedDate
        ? { ...previous, tasks: update(previous.tasks) }
        : previous
    )
  const changeTask = (taskId: string, changes: Partial<TaskItem>) =>
    writeTasks((rows) =>
      rows.map((task) => (task.id === taskId ? { ...task, ...changes } : task))
    )

  /** Adds a task to this day. False, sending nothing, for a blank title. */
  const addTask = (title: string) => {
    const cleanTitle = title.trim().slice(0, 160)
    if (!cleanTitle) return false
    const temporaryId = crypto.randomUUID()
    writeTasks((rows) => [
      ...rows,
      {
        id: temporaryId,
        title: cleanTitle,
        completed: false,
        pomodoros: 0,
        priority: "normal",
        estimatedPomodoros: null,
        repeatWeekdays: null,
        projectId: null,
        projectName: null,
        steps: [],
        tags: [],
      },
    ])
    adjustPlannedDayCount(plannedDate, 1)
    void createTask(cleanTitle, browserTimezone(), plannedDate).then(
      (created) =>
        writeTasks((rows) =>
          rows.map((task) =>
            task.id === temporaryId ? { ...task, id: created.id } : task
          )
        ),
      () => {
        writeTasks((rows) => rows.filter((task) => task.id !== temporaryId))
        adjustPlannedDayCount(plannedDate, -1)
        showErrorToast("The task could not be added to that day.")
      }
    )
    return true
  }

  const removeTask = (taskId: string) => {
    const index = tasks.findIndex((task) => task.id === taskId)
    if (index < 0) return
    const removed = tasks[index]
    writeTasks((rows) => rows.filter((task) => task.id !== taskId))
    adjustPlannedDayCount(plannedDate, -1)
    void abandonTask(taskId).catch(() => {
      writeTasks((rows) => [
        ...rows.slice(0, index),
        removed,
        ...rows.slice(index),
      ])
      adjustPlannedDayCount(plannedDate, 1)
      showErrorToast("The task could not be removed.")
    })
  }

  const updateTaskDetails = (
    taskId: string,
    changes: {
      title: string
      priority: TaskPriority
      estimatedPomodoros: number | null
      projectId: string | null
    }
  ) => {
    const previous = tasks.find((task) => task.id === taskId)
    if (!previous) return Promise.resolve(false)
    changeTask(taskId, {
      ...changes,
      projectName:
        projects.find((project) => project.id === changes.projectId)?.name ??
        null,
    })
    return updateTask({ taskId, timezone: browserTimezone(), ...changes }).then(
      () => true,
      () => {
        changeTask(taskId, previous)
        showErrorToast("Your changes to the task could not be saved.")
        return false
      }
    )
  }

  const setTaskTags = (taskId: string, tagNames: string[]) => {
    const previous = tasks.find((task) => task.id === taskId)?.tags ?? []
    changeTask(taskId, { tags: tagNames })
    return saveTaskTags(taskId, tagNames).then(
      (saved) => {
        changeTask(taskId, { tags: saved })
        addTagNames(saved)
        return true
      },
      () => {
        changeTask(taskId, { tags: previous })
        showErrorToast("The task was saved, but its tags could not be.")
        return false
      }
    )
  }

  const setTaskSteps = (
    taskId: string,
    update: (steps: TaskStepItem[]) => TaskStepItem[]
  ) =>
    writeTasks((rows) =>
      rows.map((task) =>
        task.id === taskId ? { ...task, steps: update(task.steps) } : task
      )
    )

  return {
    tasks,
    loading: !ready,
    failed: ready?.failed ?? false,
    retry: () => setReloadKey((key) => key + 1),
    addTask,
    removeTask,
    updateTaskDetails,
    setTaskTags,
    setTaskSteps,
  }
}
