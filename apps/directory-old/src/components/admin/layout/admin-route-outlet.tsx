'use client'

import { Outlet } from "@tanstack/react-router"

// The admin shell is rendered on the server as an RSC payload, but the page that
// sits inside it belongs to a child route. This client boundary is what lets the
// server-rendered shell hand its slot back to the router, so navigating between
// admin pages swaps only the content and leaves the sidebar mounted.
export function AdminRouteOutlet() {
  return <Outlet />
}
