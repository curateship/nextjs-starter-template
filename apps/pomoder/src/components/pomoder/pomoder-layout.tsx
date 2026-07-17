import { Outlet, useLocation } from "@tanstack/react-router"

import {
  PomoderShell,
  type PomoderPage,
} from "@/components/pomoder/pomoder-shell"

const pageDetails: Record<string, { page: PomoderPage; title: string }> = {
  "/": { page: "dashboard", title: "Ready to focus?" },
  "/leaderboard": { page: "leaderboard", title: "Leaderboard" },
  "/pricing": { page: "pricing", title: "Pricing" },
  "/rooms": { page: "rooms", title: "Focus rooms" },
  "/settings": { page: "settings", title: "Settings" },
  "/sounds": { page: "sounds", title: "Sounds" },
  "/tasks": { page: "tasks", title: "Tasks" },
  "/themes": { page: "themes", title: "Themes" },
  "/billing/success": { page: "pricing", title: "You’re all set" },
}

export function PomoderLayout() {
  const pathname = useLocation({ select: (location) => location.pathname })
  const details =
    pageDetails[pathname] ??
    (pathname.startsWith("/rooms/")
      ? { page: "rooms" as const, title: "Join this focus room" }
      : undefined)
  if (!details) throw new Error(`Unknown Pomoder route: ${pathname}`)

  return (
    <PomoderShell page={details.page} title={details.title}>
      <Outlet />
    </PomoderShell>
  )
}
