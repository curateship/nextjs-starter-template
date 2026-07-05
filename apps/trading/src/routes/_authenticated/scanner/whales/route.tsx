import { createFileRoute, Outlet } from "@tanstack/react-router"

// Passthrough layout so both the whale directory (index) and the wallet
// tracker ($address) live under /scanner/whales — which keeps the "Whales"
// nav item active on the wallet tracker page too.
export const Route = createFileRoute("/_authenticated/scanner/whales")({
  component: () => <Outlet />,
})
