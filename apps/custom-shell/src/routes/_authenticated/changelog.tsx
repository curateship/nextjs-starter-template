import { createFileRoute, Outlet } from "@tanstack/react-router"

/**
 * The changelog area. Its own index is where updates are written; What's new,
 * the page everyone reads and the one a notification opens, is the child route
 * underneath it.
 */
export const Route = createFileRoute("/_authenticated/changelog")({
  component: Outlet,
})
