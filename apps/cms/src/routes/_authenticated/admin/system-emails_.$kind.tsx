import { createFileRoute } from "@tanstack/react-router"

import { routeErrorComponent } from "@/components/shell/route-error"
import { SystemEmailEditor } from "@/components/system-emails/system-email-editor"
import { loadBroadcastBlockDefaults } from "@/lib/api/email/broadcasts"
import {
  getSystemEmail,
  getSystemEmailLoadErrorMessage,
} from "@/lib/api/email/system-emails"
import { isSystemEmailKind } from "@/lib/system-emails/kinds"

export const Route = createFileRoute(
  "/_authenticated/admin/system-emails_/$kind"
)({
  // Both at once, for the same reason the newsletter editor does it: fetched
  // one after the other, the editor would open with the built-in block setup
  // and then quietly change under whoever was already typing. Only the email
  // is worth failing over — the saved block setups are a convenience.
  // The editor copies the email into its own state once and never re-reads it,
  // so a cached copy painted on re-entry is a lie that silently corrects
  // underneath it. Forget the cache on leave; always open with a fresh fetch.
  gcTime: 0,
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
