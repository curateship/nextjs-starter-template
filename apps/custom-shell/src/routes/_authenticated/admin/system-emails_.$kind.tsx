import { createFileRoute } from "@tanstack/react-router"

import { routeErrorComponent } from "@/components/shell/route-error"
import { SystemEmailEditor } from "@/components/system-emails/system-email-editor"
import { loadBroadcastBlockDefaults } from "@/lib/api/broadcasts"
import {
  getSystemEmail,
  getSystemEmailLoadErrorMessage,
} from "@/lib/api/system-emails"
import { isSystemEmailKind } from "@/lib/system-emails/kinds"

export const Route = createFileRoute(
  "/_authenticated/admin/system-emails_/$kind"
)({
  // Both at once, for the same reason the newsletter editor does it: fetched
  // one after the other, the editor would open with the built-in block setup
  // and then quietly change under whoever was already typing. Only the email
  // is worth failing over — the saved block setups are a convenience.
  loader: async ({ params }) => {
    if (!isSystemEmailKind(params.kind)) throw new Error("NOT_FOUND")
    const [email, blockDefaults] = await Promise.all([
      getSystemEmail(params.kind),
      loadBroadcastBlockDefaults().catch(() => ({ defaults: {} })),
    ])
    return { email, blockDefaults: blockDefaults.defaults }
  },
  component: AdminSystemEmailEditorRoute,
  errorComponent: routeErrorComponent(getSystemEmailLoadErrorMessage),
})

function AdminSystemEmailEditorRoute() {
  const { email, blockDefaults } = Route.useLoaderData()

  // Remount when switching emails so one editor's state can never leak into
  // the next.
  return (
    <SystemEmailEditor
      key={email.kind}
      initial={email}
      initialBlockDefaults={blockDefaults}
    />
  )
}
