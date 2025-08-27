'use client'

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { getAllSitesAction, getSiteByIdAction, type SiteWithTheme } from '@/lib/actions/sites/site-actions'


interface SiteContextType {
  currentSite: SiteWithTheme | null
  sites: SiteWithTheme[]
  loading: boolean
  error: string | null
  setCurrentSite: (site: SiteWithTheme | null) => void
  refreshSites: () => Promise<void>
}

const SiteContext = createContext<SiteContextType | undefined>(undefined)

export function SiteProvider({ children }: { children: ReactNode }) {
  const [currentSite, setCurrentSite] = useState<SiteWithTheme | null>(null)
  const [sites, setSites] = useState<SiteWithTheme[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)


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

  useEffect(() => {
    refreshSites()
  }, [])

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