import { createFileRoute, Outlet } from "@tanstack/react-router"

/** Every signed-in person has an account area, member or admin. */
export const Route = createFileRoute("/_authenticated/account")({
  component: () => <Outlet />,
})
