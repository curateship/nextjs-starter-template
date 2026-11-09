import { createFileRoute, redirect } from "@tanstack/react-router"

import { isSystemEmailKind } from "@/lib/system-emails/kinds"

/**
 * One of the app's own emails opens on the CRM's right panel now (Tyler,
 * 7 Nov 2026). This address stays so a link to one still opens it.
 */
export const Route = createFileRoute("/_authenticated/admin/system-emails_/$kind")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/admin/crm",
      search: isSystemEmailKind(params.kind)
        ? { tab: "broadcasts", system: params.kind }
        : { tab: "broadcasts" },
      replace: true,
    })
  },
})
