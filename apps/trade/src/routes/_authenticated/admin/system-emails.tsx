import { createFileRoute, redirect } from "@tanstack/react-router"

/**
 * The app's own emails are a tab in the CRM settings ⋮ now, and each opens on
 * the CRM's right panel (Tyler, 7 Nov 2026). This address stays so old links
 * land on the first of them.
 */
export const Route = createFileRoute("/_authenticated/admin/system-emails")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/crm", search: { tab: "broadcasts", system: "verify-email" }, replace: true })
  },
})
