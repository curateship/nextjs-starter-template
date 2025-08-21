"use client"

import { createContext, useContext, ReactNode } from 'react'
import type { SiteWithBlocks } from '@/lib/actions/frontend-actions'

interface SiteContextType {
  site: SiteWithBlocks | null
  loading: boolean
}

const SiteContext = createContext<SiteContextType>({
  site: null,
  loading: true
})

interface SiteProviderProps {
  children: ReactNode
  site: SiteWithBlocks | null
}

export function SiteProvider({ children, site }: SiteProviderProps) {
  return (
    <SiteContext.Provider value={{ site, loading: false }}>
      {children}
    </SiteContext.Provider>
  )
}

export function useSite() {
  const context = useContext(SiteContext)
  if (!context) {
    throw new Error('useSite must be used within a SiteProvider')
  }
  return context
}

export function useSiteData() {
  const { site, loading } = useSite()
  return { site, loading }
}