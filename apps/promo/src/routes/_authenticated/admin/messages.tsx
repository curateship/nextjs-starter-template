import { createFileRoute } from "@tanstack/react-router"

import { MessagesDashboard } from "@/components/social/phone-apps/messages-dashboard"
import { routeErrorComponent } from "@/components/shell/route-error"
import { getPhoneAppErrorMessage, loadMessages } from "@/lib/api/social/phone-apps"
import { isNetwork, type Network } from "@/lib/social/networks"

type Search = { platform?: Network; open?: string }

/**
 * Every phone account's direct messages on Reddit, Instagram and TikTok, in
 * one list. Under Projects in the left menu, after Accounts. `?platform=` is
 * the Platform filter and `?open=<id>` the conversation open in its window.
 */
export const Route = createFileRoute("/_authenticated/admin/messages")({
  validateSearch: (search: Record<string, unknown>): Search => ({
    platform: isNetwork(search.platform) ? search.platform : undefined,
    open: typeof search.open === "string" && /^[A-Za-z0-9-]{1,40}$/.test(search.open) ? search.open : undefined,
  }),
  loader: () => loadMessages(),
  component: MessagesRoute,
  errorComponent: routeErrorComponent(getPhoneAppErrorMessage),
})

function MessagesRoute() {
  const { platform, open } = Route.useSearch()
  const navigate = Route.useNavigate()
  return (
    <MessagesDashboard
      initial={Route.useLoaderData()}
      platform={platform ?? null}
      openId={open ?? null}
      onPlatformChange={(next) =>
        void navigate({ search: (previous) => ({ ...previous, platform: next ?? undefined }), replace: true })
      }
      onOpenChange={(id) => void navigate({ search: (previous) => ({ ...previous, open: id ?? undefined }) })}
    />
  )
}
