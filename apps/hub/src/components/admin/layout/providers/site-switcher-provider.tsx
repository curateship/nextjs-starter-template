'use client'

import React, { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { getAllSitesAction, type SiteWithTheme } from '@/lib/actions/sites/site-actions'
import { getAdminSidebarSiteIdFromPathname } from '@/lib/utils/admin-sidebar'

interface SiteSwitcherState {
  currentSite: SiteWithTheme | null
  sites: SiteWithTheme[]
  loading: boolean
  error: string | null
  pageSize: number
  setCurrentSite: (site: SiteWithTheme | null) => void
  refreshSites: () => Promise<void>
}

const SiteSwitcherContext = createContext<SiteSwitcherState | undefined>(undefined)
const SITE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function resolveCurrentSite(availableSites: SiteWithTheme[], preferredSiteId?: string | null) {
  if (!availableSites.length) {
    return null
  }

  if (preferredSiteId) {
    const preferredSite = availableSites.find((site) => site.id === preferredSiteId)
    if (preferredSite) {
      return preferredSite
    }
  }

  if (typeof window === 'undefined') {
    return availableSites[0]
  }

  const savedId = localStorage.getItem('selectedSiteId')
  if (savedId && SITE_ID_PATTERN.test(savedId)) {
    const savedSite = availableSites.find((site) => site.id === savedId)
    if (savedSite) {
      return savedSite
    }
  }

  return availableSites[0]
}

function persistResolvedSite(site: SiteWithTheme | null) {
  if (site) {
    localStorage.setItem('selectedSiteId', site.id)
  } else {
    localStorage.removeItem('selectedSiteId')
  }
}

interface SiteSwitcherProviderProps {
  children: ReactNode
  initialSites?: SiteWithTheme[]
  pageSize?: number
}

export function SiteSwitcherProvider({
  children,
  initialSites,
  pageSize: initialPageSize,
}: SiteSwitcherProviderProps) {
  const pathname = usePathname()
  const routeSiteId = getAdminSidebarSiteIdFromPathname(pathname)
  const [currentSite, setCurrentSite] = useState<SiteWithTheme | null>(null)
  const [sites, setSites] = useState<SiteWithTheme[]>(initialSites ?? [])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pageSize] = useState(initialPageSize ?? 50)

  const syncResolvedSite = useCallback((availableSites: SiteWithTheme[]) => {
    const nextSite = resolveCurrentSite(availableSites, routeSiteId)
    setCurrentSite(nextSite)
    persistResolvedSite(nextSite)
  }, [routeSiteId])

  useEffect(() => {
    if (initialSites === undefined) return

    setSites(initialSites)
    syncResolvedSite(initialSites)
    setLoading(false)
  }, [initialSites, syncResolvedSite])

  const refreshSites = async () => {
    try {
      setLoading(true)
      setError(null)

      const { data, error } = await getAllSitesAction()

      if (error) {
        setError(error)
        return
      }

      if (data && data.length > 0) {
        setSites(data)
        syncResolvedSite(data)
      } else {
        setSites([])
        syncResolvedSite([])
      }
    } catch {
      setError('Failed to load sites')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!initialSites) {
      refreshSites()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSetCurrentSite = (site: SiteWithTheme | null) => {
    setCurrentSite(site)
    persistResolvedSite(site)
  }

  return (
    <SiteSwitcherContext.Provider
      value={{
        currentSite,
        sites,
        loading,
        error,
        pageSize,
        setCurrentSite: handleSetCurrentSite,
        refreshSites,
      }}
    >
      {children}
    </SiteSwitcherContext.Provider>
  )
}

export function useSiteSwitcher() {
  const context = useContext(SiteSwitcherContext)
  if (context === undefined) {
    throw new Error('useSiteSwitcher must be used within a SiteSwitcherProvider')
  }
  return context
}
