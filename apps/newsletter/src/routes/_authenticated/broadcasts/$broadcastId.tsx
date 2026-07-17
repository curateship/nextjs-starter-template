import { createFileRoute } from "@tanstack/react-router"

import {
  BroadcastRouteContent,
  BroadcastRouteError,
} from "@/components/broadcasts/broadcast-route-content"
import { getBroadcast } from "@/lib/api/broadcasts"

export const Route = createFileRoute("/_authenticated/broadcasts/$broadcastId")(
  {
    loader: ({ params }) => getBroadcast(params.broadcastId),
    errorComponent: BroadcastRouteError,
    component: BroadcastRouteContent,
  }
)
