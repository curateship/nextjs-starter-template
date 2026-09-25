import { createFileRoute } from "@tanstack/react-router"

import { TasksPage } from "@/components/pomodoro/tasks-page"

/** Today's task plan; every finished focus with a task picked counts on it. */
export const Route = createFileRoute("/_pomodoro/tasks")({
  component: TasksPage,
})
