"use client"

import { createContext, useContext, useMemo, type ReactNode } from "react"
import { authClient } from "@/lib/actions/auth/client"

export interface SiteAuthUser {
  email?: string | null
  name?: string | null
  image?: string | null
  role?: string | null
}

type SiteAuthState = {
  user: SiteAuthUser | null
  /**
   * False until we actually know whether the visitor is signed in. The session
   * lookup runs in the browser, so on the server and on the first client render
   * "no user" only means "not answered yet". Surfaces that would otherwise show
   * the signed-out state (the nav's Login/Register buttons) wait on this instead
   * of flashing the wrong state on every page load.
   */
  isResolved: boolean
}

const SiteAuthContext = createContext<SiteAuthState>({ user: null, isResolved: false })

type AuthSessionUser = SiteAuthUser & {
  displayName?: string | null
}

function toSiteAuthUser(user?: AuthSessionUser | null): SiteAuthUser | null {
  if (!user) return null

  return {
    email: user.email ?? null,
    name: user.displayName || user.name || null,
    image: user.image ?? null,
    role: typeof user.role === "string" ? user.role : null,
  }
}

export function SiteAuthProvider({
  children,
  user = null,
}: {
  children: ReactNode
  user?: SiteAuthUser | null
}) {
  const session = authClient.useSession()
  // Derived during render, never through an effect. The session store outlives
  // any one page, so a provider mounted by a client-side navigation can start
  // with the answer already in hand — and an effect would publish "resolved"
  // one painted frame before it published the user, which is exactly the
  // Login/Register flash this is meant to prevent.
  const sessionUser = session.isPending
    ? null
    : ((session.data?.user as AuthSessionUser | null) ?? null)

  const value = useMemo<SiteAuthState>(
    () => ({
      // A signed-in session wins; a server-supplied user is the fallback.
      user: toSiteAuthUser(sessionUser) ?? user,
      // A server-supplied user is already the answer; otherwise wait for the
      // browser session lookup to stop pending.
      isResolved: Boolean(user) || !session.isPending,
    }),
    [sessionUser, session.isPending, user]
  )

  return <SiteAuthContext.Provider value={value}>{children}</SiteAuthContext.Provider>
}

export function useSiteAuthUser() {
  return useContext(SiteAuthContext).user
}

/** False until the signed-in / signed-out answer is known. See SiteAuthState. */
export function useSiteAuthResolved() {
  return useContext(SiteAuthContext).isResolved
}
