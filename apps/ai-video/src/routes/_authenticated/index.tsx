import * as React from "react"
import { createFileRoute, useNavigate } from "@tanstack/react-router"

import { HomeDashboard } from "@/components/home-dashboard"
import { useShellRuntime } from "@/components/shell-runtime"
import { DEFAULT_ADMIN_ROUTE } from "@/lib/ai-video"

export const Route = createFileRoute("/_authenticated/")({
  component: HomeRoute,
})

// Redirected once per full app load, so opening the app honors the configured
// landing page while an in-app click on a "/" link (or a target that bounces
// back to the root) still shows the home dashboard instead of looping.
let didRedirectToDefault = false

function HomeRoute() {
  const { config } = useShellRuntime()
  const navigate = useNavigate()
  const target = config.defaultRoute
  const [redirecting] = React.useState(
    () =>
      !didRedirectToDefault &&
      Boolean(target.trim()) &&
      target !== DEFAULT_ADMIN_ROUTE
  )

  React.useEffect(() => {
    if (redirecting) {
      didRedirectToDefault = true
      void navigate({ href: target })
    }
  }, [navigate, redirecting, target])

  if (redirecting) {
    return null
  }

  return <HomeDashboard />
}
