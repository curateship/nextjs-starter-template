import { createFileRoute, getRouteApi, useRouter } from "@tanstack/react-router"

import { AccountProfilePage } from "@/components/account-profile-page"

const authenticatedRoute = getRouteApi("/_authenticated")

// No loader: the shell already has the person and their plan, so this renders
// immediately instead of waiting on another round trip.
export const Route = createFileRoute("/_authenticated/account/")({
  component: AccountRoute,
})

function AccountRoute() {
  const { user, plan } = authenticatedRoute.useLoaderData()
  const router = useRouter()

  return (
    <AccountProfilePage
      user={user}
      planName={plan.planName}
      isPaid={plan.isPaid}
      onSaved={() => router.invalidate()}
    />
  )
}
