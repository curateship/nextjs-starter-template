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
  // Hands the shell the parent already loaded straight down, so `/admin`'s
  // redirect can read the configured route without a second round trip. A
  // loader can only reach its own parent's data, and the shell is two up.
  loader: ({ parentMatchPromise }) =>
    parentMatchPromise.then((match) => match.loaderData),
  component: AdminLayout,
})

function AdminLayout() {
  const { user } = authenticatedRoute.useLoaderData()

  if (user.role !== "admin") {
    return <Navigate to="/home" replace />
  }

  return <Outlet />
}
