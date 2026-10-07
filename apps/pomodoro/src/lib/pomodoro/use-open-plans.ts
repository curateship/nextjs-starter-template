import { useNavigate } from "@tanstack/react-router"

import { useProductAuth } from "@/lib/pomodoro/auth-state"

/**
 * Where a press on a locked Pro thing goes: the plans page for a member, and
 * sign-in first for a guest, who lands on the plans page afterwards. A locked
 * card is the moment somebody wants the thing, so the press always leads to
 * the page that says what Pro costs.
 */
export function useOpenPlans() {
  const navigate = useNavigate()
  const auth = useProductAuth()
  const signedIn = auth.known && auth.authenticated
  return {
    signedIn,
    openPlans: () =>
      void (signedIn
        ? navigate({ to: "/plans" })
        : navigate({ to: "/login", search: { redirect: "/plans" } })),
  }
}
