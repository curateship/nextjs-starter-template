'use client'

import React, { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { getAllSitesAction, type SiteWithTheme } from '@/lib/actions/sites/site-actions'
import { getAdminSidebarSiteIdFromPathname } from '@/lib/utils/admin-sidebar'

interface SiteSwitcherState {
  currentSite: SiteWithTheme | null
  sites: SiteWithTheme[]
  loading: boolean
  error: string | null
  pageSize: number
  setPageSize: (pageSize: number) => void
  setCurrentSite: (site: SiteWithTheme | null) => void
  refreshSites: () => Promise<void>
}

const SiteSwitcherContext = createContext<SiteSwitcherState | undefined>(undefined)
const SITE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function resolveRouteSite(availableSites: SiteWithTheme[], preferredSiteId?: string | null) {
  if (preferredSiteId) {
    const preferredSite = availableSites.find((site) => site.id === preferredSiteId)
    if (preferredSite) {
      return preferredSite
    }
  }

  return null
}

function resolveCurrentSite(availableSites: SiteWithTheme[], preferredSiteId?: string | null) {
  if (!availableSites.length) {
    return null
  }

  const routeSite = resolveRouteSite(availableSites, preferredSiteId)
  if (routeSite) return routeSite

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
  if (typeof window === 'undefined') return

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
  const searchParams = useSearchParams()
  const routeSiteId = getAdminSidebarSiteIdFromPathname(pathname)
  const querySiteId = searchParams.get('site')
  const preferredSiteId = routeSiteId || (querySiteId && SITE_ID_PATTERN.test(querySiteId) ? querySiteId : null)
  const [sites, setSites] = useState<SiteWithTheme[]>(initialSites ?? [])
  const [currentSite, setCurrentSite] = useState<SiteWithTheme | null>(() =>
    resolveRouteSite(initialSites ?? [], preferredSiteId)
  )
  const [loading, setLoading] = useState(initialSites === undefined)
  const [error, setError] = useState<string | null>(null)
  const [pageSize, setPageSize] = useState(initialPageSize ?? 50)

  const syncResolvedSite = useCallback((availableSites: SiteWithTheme[]) => {
    const nextSite = resolveCurrentSite(availableSites, preferredSiteId)
    setCurrentSite(nextSite)
    persistResolvedSite(nextSite)
  }, [preferredSiteId])

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
    if (site) {
      setSites((currentSites) =>
        currentSites.some((current) => current.id === site.id)
          ? currentSites.map((current) => (current.id === site.id ? site : current))
          : [site, ...currentSites]
      )
    }
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
        setPageSize,
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
