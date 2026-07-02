import { redirect } from "@tanstack/react-router"

import { loadCurrentUser, type AuthUser } from "@/lib/api/auth"

export function canAccessAdminRoutes(
  user: Pick<AuthUser, "role"> | null | undefined
) {
  return user?.role === "admin"
}

export async function requireAdminRoute() {
  const user = await loadCurrentUser()
  if (!canAccessAdminRoutes(user)) {
    throw redirect({ to: "/" })
  }
  return user
}
