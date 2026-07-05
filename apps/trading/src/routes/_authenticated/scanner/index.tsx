import { createFileRoute, redirect } from "@tanstack/react-router"

export const Route = createFileRoute("/_authenticated/scanner/")({
  beforeLoad: () => {
    throw redirect({ to: "/scanner/whales" })
  },
})
