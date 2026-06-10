"use client"

import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import { authClient } from "@/lib/actions/auth/client"

export interface SiteAuthUser {
  email?: string | null
  name?: string | null
  image?: string | null
  role?: string | null
}

const SiteAuthContext = createContext<SiteAuthUser | null>(null)

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
  user,
}: {
  children: ReactNode
  user: SiteAuthUser | null
}) {
  const session = authClient.useSession()
  const [currentUser, setCurrentUser] = useState(user)

  useEffect(() => {
    setCurrentUser(user)
  }, [user])

  useEffect(() => {
    if (session.isPending) return

    const sessionUser = toSiteAuthUser(session.data?.user as AuthSessionUser | null)
    if (!sessionUser && user) return

    setCurrentUser(sessionUser)
  }, [session.data?.user, session.isPending, user])

  return <SiteAuthContext.Provider value={currentUser}>{children}</SiteAuthContext.Provider>
}

export function useSiteAuthUser() {
  return useContext(SiteAuthContext)
}
