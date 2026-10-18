import { createFileRoute } from "@tanstack/react-router"

import { PhoneScreen } from "@/components/dating/phone-screen"
import { routeErrorComponent } from "@/components/shell/route-error"
import { loadPhoneScreen } from "@/lib/api/dating/phone"
import { datingErrorMessage } from "@/lib/dating/errors"

/**
 * The Phone screen, under Dating in the left menu: pairing the Android phone,
 * switching Date's control of it, Resume, the live screen, what it did, and
 * the sample data.
 */
export const Route = createFileRoute("/_authenticated/admin/dating_/phone")({
  loader: () => loadPhoneScreen(),
  errorComponent: routeErrorComponent(datingErrorMessage),
  component: PhoneRoute,
})

function PhoneRoute() {
  return <PhoneScreen initial={Route.useLoaderData()} />
}
