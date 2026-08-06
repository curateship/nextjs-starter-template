import { createFileRoute } from "@tanstack/react-router"

import { BroadcastEditor } from "@/components/broadcasts/broadcast-editor"
import { routeErrorComponent } from "@/components/shell/route-error"
import {
  getBroadcast,
  getBroadcastLoadErrorMessage,
  loadBroadcastBlockDefaults,
} from "@/lib/api/email/broadcasts"

export const Route = createFileRoute(
  "/_authenticated/admin/newsletter_/$broadcastId"
)({
  // Both at once: the email and how new blocks in it start out. Fetched one
  // after the other, the editor would open with the built-in setup and then
  // quietly change under whoever was already typing.
  //
  // Only the email is worth failing over. The saved block setups are a
  // convenience, so a failure there falls back to the built-in ones rather
  // than putting an error page in front of an email somebody came to write.
  loader: async ({ params }) => {
    const [broadcast, blockDefaults] = await Promise.all([
      getBroadcast(params.broadcastId),
      loadBroadcastBlockDefaults().catch(() => ({ defaults: {} })),
    ])
    return { broadcast, blockDefaults: blockDefaults.defaults }
  },
  component: AdminBroadcastEditorRoute,
  errorComponent: routeErrorComponent(getBroadcastLoadErrorMessage),
})

function AdminBroadcastEditorRoute() {
  const { broadcast, blockDefaults } = Route.useLoaderData()

  // Remount when switching newsletters so one email's editor state can never
  // leak into the next.
  return (
    <BroadcastEditor
      key={broadcast.id}
      initial={broadcast}
      initialBlockDefaults={blockDefaults}
    />
  )
}
