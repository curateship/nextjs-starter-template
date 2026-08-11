import { createFileRoute } from "@tanstack/react-router"

import { MyListings } from "@/components/directory/my-listings"
import { routeErrorComponent } from "@/components/shell/route-error"
import {
  getClaimErrorMessage,
  loadMyListings,
} from "@/lib/api/directory/claims"

/**
 * The listings a signed-in account looks after.
 *
 * A member route, not an admin one, and it answers on **every** host — which
 * matters more than it looks. The session cookie belongs to one host, and an
 * owner signs in from the claim button on the site's own address, so their
 * session is that site's. Somebody sent to the deployment's address instead
 * would arrive signed out.
 *
 * The list itself is by account rather than by site, so an owner who looks
 * after a café on one site and a shop on another sees both here, each with its
 * site named — wherever they happen to open it.
 *
 * It is reached from the member sidebar, which is Settings data rather than
 * code: nothing here has to be registered anywhere for the link to exist.
 */
type MyListingsSearch = {
  featured_session?: string
  featured_checkout?: "cancelled"
}

export const Route = createFileRoute("/_authenticated/my-listings")({
  validateSearch: (search: Record<string, unknown>): MyListingsSearch => ({
    featured_session:
      typeof search.featured_session === "string" &&
      /^cs_(?:test_|live_)?[A-Za-z0-9]+$/.test(search.featured_session)
        ? search.featured_session
        : undefined,
    featured_checkout: search.featured_checkout === "cancelled" ? "cancelled" : undefined,
  }),
  loader: () => loadMyListings(),
  component: MyListingsRoute,
  errorComponent: routeErrorComponent(getClaimErrorMessage),
})

function MyListingsRoute() {
  const listings = Route.useLoaderData()
  return <MyListings listings={listings} checkout={Route.useSearch()} />
}
