import { createFileRoute, redirect } from "@tanstack/react-router"

/**
 * The Reddit accounts dashboard's old address, which the bell's suspended
 * account notice still leads to. Every platform's accounts are on the Accounts
 * dashboard since 15 Oct 2026, so this opens it filtered to Reddit.
 */
export const Route = createFileRoute("/_authenticated/admin/reddit-accounts")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/accounts", search: { platform: "reddit" }, replace: true })
  },
})
