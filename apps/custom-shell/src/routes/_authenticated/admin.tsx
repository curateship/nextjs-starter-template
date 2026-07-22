import {
  createFileRoute,
  getRouteApi,
  Navigate,
  Outlet,
} from "@tanstack/react-router"

const authenticatedRoute = getRouteApi("/_authenticated")

/**
 * The single client-side gate for everything under /admin. It reads the role
 * the shell already loaded rather than asking the server again, so moving
 * between admin pages stays instant. Every admin server function enforces the
 * same rule on its own, which is what actually protects the data.
 */
export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminLayout,
})

function AdminLayout() {
  const { user } = authenticatedRoute.useLoaderData()

  if (user.role !== "admin") {
    return <Navigate to="/" replace />
  }

  return <Outlet />
}
