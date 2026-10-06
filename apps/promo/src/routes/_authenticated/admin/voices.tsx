import { createFileRoute } from "@tanstack/react-router"

import { VoicesDashboard } from "@/components/social/voices/voices-dashboard"
import { routeErrorComponent } from "@/components/shell/route-error"
import { getVoiceErrorMessage, loadVoices } from "@/lib/api/social/voices"
import { readOpenSearch } from "@/lib/hooks/use-open-from-link"

/**
 * Every voice the AI can write in. `?open=<id>` opens one, which is where the
 * Reddit account tab's link leads.
 */
export const Route = createFileRoute("/_authenticated/admin/voices")({
  validateSearch: readOpenSearch,
  loader: () => loadVoices(),
  component: VoicesRoute,
  errorComponent: routeErrorComponent(getVoiceErrorMessage),
})

function VoicesRoute() {
  const { open } = Route.useSearch()
  return <VoicesDashboard initial={Route.useLoaderData()} openId={open} />
}
