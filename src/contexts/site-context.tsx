'use client'

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { getAllSitesAction, getSiteByIdAction, type SiteWithTheme } from '@/lib/actions/sites/site-actions'

interface SiteSettings {
  urlPrefixes: {
    posts?: string
    products?: string
  }
}

interface SiteContextType {
  currentSite: SiteWithTheme | null
  sites: SiteWithTheme[]
  siteSettings: SiteSettings | null
  loading: boolean
  error: string | null
  setCurrentSite: (site: SiteWithTheme | null) => void
  refreshSites: () => Promise<void>
  refreshSiteSettings: () => Promise<void>
}

const SiteContext = createContext<SiteContextType | undefined>(undefined)

export function SiteProvider({ children }: { children: ReactNode }) {
  const [currentSite, setCurrentSite] = useState<SiteWithTheme | null>(null)
  const [sites, setSites] = useState<SiteWithTheme[]>([])
  const [siteSettings, setSiteSettings] = useState<SiteSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refreshSiteSettings = async () => {
    if (!currentSite?.id) {
      setSiteSettings(null)
      return
    }

    try {
      const { data: site } = await getSiteByIdAction(currentSite.id)
      
      if (site?.settings?.url_prefixes) {
        setSiteSettings({
          urlPrefixes: {
            posts: site.settings.url_prefixes.posts || '',
            products: site.settings.url_prefixes.products || ''
          }
        })
      } else {
        setSiteSettings({
          urlPrefixes: {
            posts: '',
            products: ''
          }
        })
      }
    } catch (error) {
      // Silently fail and use empty prefixes
      setSiteSettings({
        urlPrefixes: {
          posts: '',
          products: ''
        }
      })
    }
  }

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
        setSiteSettings(null)
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

  // Fetch site settings when currentSite changes
  useEffect(() => {
    refreshSiteSettings()
  }, [currentSite?.id])

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
        siteSettings,
        loading,
        error,
        setCurrentSite: handleSetCurrentSite,
        refreshSites,
        refreshSiteSettings
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