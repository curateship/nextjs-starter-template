"use client"

import { createContext, useContext, type ReactNode } from "react"

export interface SiteAuthUser {
  email?: string | null
  name?: string | null
  role?: string | null
}

const SiteAuthContext = createContext<SiteAuthUser | null>(null)

export function SiteAuthProvider({
  children,
  user,
}: {
  children: ReactNode
  user: SiteAuthUser | null
}) {
  return <SiteAuthContext.Provider value={user}>{children}</SiteAuthContext.Provider>
}

export function useSiteAuthUser() {
  return useContext(SiteAuthContext)
}
