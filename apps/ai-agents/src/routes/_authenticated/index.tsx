import { createFileRoute, redirect } from "@tanstack/react-router"

// Agents is the home screen of the app.
export const Route = createFileRoute("/_authenticated/")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/agents" })
  },
})
