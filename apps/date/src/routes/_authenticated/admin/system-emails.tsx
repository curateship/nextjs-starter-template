import { createFileRoute, redirect } from "@tanstack/react-router"

/**
 * The app's own emails are the CRM's System emails section (Tyler, 9 Nov
 * 2026: "Bring the systems email to its own dashboard"). This address stays
 * so old links land there.
 */
export const Route = createFileRoute("/_authenticated/admin/system-emails")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/crm", search: { tab: "system" }, replace: true })
  },
})
