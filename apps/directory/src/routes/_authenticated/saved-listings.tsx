import { createFileRoute } from "@tanstack/react-router"

import { SavedListings } from "@/components/directory/saved-listings"
import { routeErrorComponent } from "@/components/shell/route-error"
import { getSaveErrorMessage, loadMySaved } from "@/lib/api/directory/saves"

export const Route = createFileRoute("/_authenticated/saved-listings")({
  loader: loadMySaved,
  component: SavedListingsRoute,
  errorComponent: routeErrorComponent(getSaveErrorMessage),
})

function SavedListingsRoute() {
  return <SavedListings initial={Route.useLoaderData()} />
}
