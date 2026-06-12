import { createFileRoute } from "@tanstack/react-router"

import { ProfilesDashboard } from "@/components/profiles-dashboard"
import { loadProfiles } from "@/lib/api/profiles"

export const Route = createFileRoute("/_authenticated/profiles")({
  loader: () => loadProfiles(),
  component: ProfilesRoute,
})

function ProfilesRoute() {
  const { profiles, proxies } = Route.useLoaderData()
  return (
    <ProfilesDashboard initialProfiles={profiles} initialProxies={proxies} />
  )
}
