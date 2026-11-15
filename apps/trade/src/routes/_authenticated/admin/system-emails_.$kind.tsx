import { createFileRoute, redirect } from "@tanstack/react-router"

import { isSystemEmailKind } from "@/lib/system-emails/kinds"

/**
 * One of the app's own emails opens in the CRM's System emails section (Tyler,
 * 9 Nov 2026). This address stays so a link to one still opens it.
 */
export const Route = createFileRoute("/_authenticated/admin/system-emails_/$kind")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/admin/crm",
      search: isSystemEmailKind(params.kind) ? { tab: "system", open: params.kind } : { tab: "system" },
      replace: true,
    })
  },
})
