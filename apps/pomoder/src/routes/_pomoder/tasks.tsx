import { createFileRoute } from "@tanstack/react-router"

import { TasksPage } from "@/components/pomoder/pomoder-pages"

export const Route = createFileRoute("/_pomoder/tasks")({
  component: TasksPage,
})
