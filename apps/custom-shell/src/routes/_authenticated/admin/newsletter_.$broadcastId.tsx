import { createFileRoute } from "@tanstack/react-router"

import { BroadcastEditor } from "@/components/broadcasts/broadcast-editor"
import { routeErrorComponent } from "@/components/shell/route-error"
import {
  getBroadcast,
  getBroadcastLoadErrorMessage,
  loadBroadcastBlockDefaults,
} from "@/lib/api/email/broadcasts"
import { loadSegmentChoices } from "@/lib/api/people/contact-segments"

export const Route = createFileRoute(
  "/_authenticated/admin/newsletter_/$broadcastId"
)({
  // All at once: the email, how new blocks in it start out, and the saved
  // segments it can be aimed at. Fetched one after the other, the editor would
  // open with the built-in setup and then quietly change under whoever was
  // already typing.
  //
  // The saved block setups are a convenience, so a failure there falls back to
  // the built-in ones rather than putting an error page in front of an email
  // somebody came to write. The segments are not: a broadcast aimed at one is
  // stored as an id, so without the names the page cannot say who it is going
  // to, and guessing there is the mistake that cannot be taken back.
  loader: async ({ params }) => {
    const [broadcast, segments, blockDefaults] = await Promise.all([
      getBroadcast(params.broadcastId),
      loadSegmentChoices(),
      loadBroadcastBlockDefaults().catch(() => ({ defaults: {} })),
    ])
    return { broadcast, segments, blockDefaults: blockDefaults.defaults }
  },
  component: AdminBroadcastEditorRoute,
  errorComponent: routeErrorComponent(getBroadcastLoadErrorMessage),
})

function AdminBroadcastEditorRoute() {
  const { broadcast, segments, blockDefaults } = Route.useLoaderData()

  // Remount when switching newsletters so one email's editor state can never
  // leak into the next.
  return (
    <BroadcastEditor
      key={broadcast.id}
      initial={broadcast}
      segments={segments}
      initialBlockDefaults={blockDefaults}
    />
  )
}
