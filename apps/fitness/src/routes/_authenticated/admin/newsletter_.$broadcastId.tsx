import { createFileRoute, redirect } from "@tanstack/react-router"

/**
 * A newsletter is written on the CRM's right panel now (Tyler, 7 Nov 2026:
 * "consolidate this into the CRM dashboard too and not linked it outside").
 * This address stays so a link to one still opens it. The Broadcasts tab
 * opens on Drafts; a sent one is still opened, on the right, from the link.
 */
export const Route = createFileRoute("/_authenticated/admin/newsletter_/$broadcastId")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/admin/crm",
      search: { tab: "broadcasts", open: params.broadcastId },
      replace: true,
    })
  },
})
