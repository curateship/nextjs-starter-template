import { createFileRoute } from "@tanstack/react-router"

import { AccountBillingPage } from "@/components/account-billing-page"
import { loadBillingPage } from "@/lib/api/billing"

export const Route = createFileRoute("/_authenticated/account/billing")({
  loader: () => loadBillingPage(),
  component: AccountBillingRoute,
})

function AccountBillingRoute() {
  const { overview, invoices } = Route.useLoaderData()
  return <AccountBillingPage overview={overview} invoices={invoices} />
}
