import { createFileRoute, redirect } from "@tanstack/react-router"

/**
 * The development outbox is the Outbox pill under the CRM's Inbox (Tyler,
 * 7 Nov 2026: "an 'Outbox' pill under Inbox, local only, read like
 * conversations"). This address stays so old links land.
 */
export const Route = createFileRoute("/_authenticated/admin/dev-outbox")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/crm", search: { tab: "inbox", view: "outbox" }, replace: true })
  },
})
