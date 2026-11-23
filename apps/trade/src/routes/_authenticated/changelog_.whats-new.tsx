import { createFileRoute, redirect } from "@tanstack/react-router"

/**
 * The Changelog was removed from the shell (Tyler, 8 Nov 2026: "I would
 * remove the changelog feature"). This address stays so notices and emails
 * sent before then land on the home page instead of a missing page.
 */
export const Route = createFileRoute("/_authenticated/changelog_/whats-new")({
  beforeLoad: () => {
    throw redirect({ to: "/home", replace: true })
  },
})
