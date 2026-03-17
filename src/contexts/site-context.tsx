'use client'

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { getAllSitesAction, getSiteByIdAction, type SiteWithTheme } from '@/lib/actions/sites/site-actions'


interface SiteContextType {
  currentSite: SiteWithTheme | null
  sites: SiteWithTheme[]
  loading: boolean
  error: string | null
  pageSize: number
  setCurrentSite: (site: SiteWithTheme | null) => void
  refreshSites: () => Promise<void>
}

const SiteContext = createContext<SiteContextType | undefined>(undefined)

interface SiteProviderProps {
  children: ReactNode
  initialSites?: SiteWithTheme[]
  pageSize?: number
}

export function SiteProvider({ children, initialSites, pageSize: initialPageSize }: SiteProviderProps) {
  const [currentSite, setCurrentSite] = useState<SiteWithTheme | null>(
    initialSites && initialSites.length > 0 ? initialSites[0] : null
  )
  const [sites, setSites] = useState<SiteWithTheme[]>(initialSites ?? [])
  const [loading, setLoading] = useState(!initialSites)
  const [error, setError] = useState<string | null>(null)
  const [pageSize] = useState(initialPageSize ?? 50)

  // Restore saved site from localStorage on mount (client-only, after hydration)
  useEffect(() => {
    if (initialSites && initialSites.length > 0) {
      const savedId = localStorage.getItem('selectedSiteId')
      if (savedId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(savedId)) {
        const found = initialSites.find(s => s.id === savedId)
        if (found) {
          setCurrentSite(found)
          return
        }
      }
      localStorage.setItem('selectedSiteId', initialSites[0].id)
    } else if (initialSites && initialSites.length === 0) {
      localStorage.removeItem('selectedSiteId')
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps


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

        const savedSiteId = localStorage.getItem('selectedSiteId')
        if (savedSiteId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(savedSiteId)) {
          const savedSite = data.find(s => s.id === savedSiteId)
          if (savedSite) {
            setCurrentSite(savedSite)
          } else {
            // Saved site no longer exists, select first
            setCurrentSite(data[0])
            localStorage.setItem('selectedSiteId', data[0].id)
          }
        } else {
          // No saved site, select first
          setCurrentSite(data[0])
          localStorage.setItem('selectedSiteId', data[0].id)
        }
      } else {
        setSites([])
        setCurrentSite(null)
        localStorage.removeItem('selectedSiteId')
      }
    } catch (err) {
      setError('Failed to load sites')
    } finally {
      setLoading(false)
    }
  }

  // Only fetch on mount if no initialSites were provided
  useEffect(() => {
    if (!initialSites) {
      refreshSites()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSetCurrentSite = (site: SiteWithTheme | null) => {
    setCurrentSite(site)
    if (site) {
      localStorage.setItem('selectedSiteId', site.id)
    } else {
      localStorage.removeItem('selectedSiteId')
    }
  }

  return (
    <SiteContext.Provider
      value={{
        currentSite,
        sites,
        loading,
        error,
        pageSize,
        setCurrentSite: handleSetCurrentSite,
        refreshSites
      }}
    >
      {children}
    </SiteContext.Provider>
  )
}

export function useSiteContext() {
  const context = useContext(SiteContext)
  if (context === undefined) {
    throw new Error('useSiteContext must be used within a SiteProvider')
  }
  return context
}
