import { createFileRoute } from "@tanstack/react-router"

import { AccountSecurityPage } from "@/components/account-security-page"

export const Route = createFileRoute("/_authenticated/account/security")({
  component: AccountSecurityPage,
})
