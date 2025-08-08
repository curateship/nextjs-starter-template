"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { AdminLayout, AdminPageHeader, AdminCard } from "@/components/admin/layout/admin-layout"
import { Button } from "@/components/ui/button"
import { Eye, Settings, Wrench, ExternalLink } from "lucide-react"
import { getAllSitesAction } from "@/lib/actions/site-actions"
import type { SiteWithTheme } from "@/lib/actions/site-actions"

type FilterStatus = 'all' | 'published' | 'draft' | 'in-progress'

export default function SiteBuilderPage() {
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [sites, setSites] = useState<SiteWithTheme[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<FilterStatus>('all')

  useEffect(() => {
    loadSites()
  }, [])

  const loadSites = async () => {
    try {
      setLoading(true)
      setError(null)
      
      const { data, error } = await getAllSitesAction()
      
      if (error) {
        console.error('Error loading sites:', error)
        setError(error)
        return
      }
      
      if (data) {
        // Only show sites that are not suspended for building
        const buildableSites = data.filter(site => site.status !== 'suspended')
        setSites(buildableSites)
        console.log('Loaded buildable sites:', buildableSites)
      }
    } catch (err) {
      console.error('Error loading sites:', err)
      setError('Failed to load sites')
    } finally {
      setLoading(false)
    }
  }

  const handleFilterChange = (newFilter: FilterStatus) => {
    setFilter(newFilter)
    setIsFilterOpen(false)
  }

  const filteredSites = sites.filter(site => {
    if (filter === 'all') return true
    
    // Map database status to builder status
    switch (filter) {
      case 'published': return site.status === 'active'
      case 'draft': return site.status === 'draft'
      case 'in-progress': return site.status === 'inactive' // Sites being worked on
      default: return true
    }
  })

  const getBuilderStatus = (status: string) => {
    switch (status) {
      case 'active': return 'published'
      case 'draft': return 'draft'
      case 'inactive': return 'in-progress'
      default: return status
    }
  }

  const getStatusColor = (status: string) => {
    const builderStatus = getBuilderStatus(status)
    switch (builderStatus) {
      case 'published': return 'bg-green-100 text-green-800'
      case 'draft': return 'bg-yellow-100 text-yellow-800'
      case 'in-progress': return 'bg-blue-100 text-blue-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffTime = Math.abs(now.getTime() - date.getTime())
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    
    if (diffDays === 1) return '1 day ago'
    if (diffDays < 7) return `${diffDays} days ago`
    if (diffDays < 30) return `${Math.ceil(diffDays / 7)} weeks ago`
    return `${Math.ceil(diffDays / 30)} months ago`
  }
  
  return (
    <AdminLayout>
      <div className="w-full max-w-6xl mx-auto">
        <AdminPageHeader
          title="Site Builder"
          subtitle="Build and customize your sites with visual blocks"
          primaryAction={{
            label: "Create New Site",
            href: "/admin/sites/new"
          }}
        />
        
        <AdminCard>
          <div className="p-6 border-b">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-lg font-semibold">Sites Available for Building</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {loading ? 'Loading...' : `${filteredSites.length} site${filteredSites.length !== 1 ? 's' : ''} available`}
                </p>
              </div>
              <div className="relative">
                <Button 
                  variant="outline"
                  onClick={() => setIsFilterOpen(!isFilterOpen)}
                  className="flex items-center space-x-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                  </svg>
                  <span>Filter</span>
                  <svg className={`w-4 h-4 transition-transform ${isFilterOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </Button>
                {isFilterOpen && (
                  <div className="absolute right-0 mt-2 w-48 bg-card border rounded-md shadow-lg z-10">
                    <div className="py-1">
                      <button 
                        onClick={() => handleFilterChange('all')}
                        className={`block w-full text-left px-4 py-2 text-sm hover:bg-muted ${
                          filter === 'all' ? 'bg-muted font-medium' : ''
                        }`}
                      >
                        All Sites
                      </button>
                      <button 
                        onClick={() => handleFilterChange('published')}
                        className={`block w-full text-left px-4 py-2 text-sm hover:bg-muted ${
                          filter === 'published' ? 'bg-muted font-medium' : ''
                        }`}
                      >
                        Published
                      </button>
                      <button 
                        onClick={() => handleFilterChange('draft')}
                        className={`block w-full text-left px-4 py-2 text-sm hover:bg-muted ${
                          filter === 'draft' ? 'bg-muted font-medium' : ''
                        }`}
                      >
                        Draft
                      </button>
                      <button 
                        onClick={() => handleFilterChange('in-progress')}
                        className={`block w-full text-left px-4 py-2 text-sm hover:bg-muted ${
                          filter === 'in-progress' ? 'bg-muted font-medium' : ''
                        }`}
                      >
                        In Progress
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
          
          {/* Table Header */}
          <div className="px-6 py-4 border-b bg-muted/30">
            <div className="grid grid-cols-7 gap-4 text-sm font-medium text-muted-foreground">
              <div className="col-span-2">Site</div>
              <div>Theme</div>
              <div>Status</div>
              <div>Last Updated</div>
              <div>Created</div>
              <div>Actions</div>
            </div>
          </div>
          
          <div className="divide-y">
            {loading ? (
              <div className="p-8 text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
                <p className="text-muted-foreground">Loading sites...</p>
              </div>
            ) : error ? (
              <div className="p-8 text-center">
                <p className="text-red-600 mb-4">{error}</p>
                <Button onClick={loadSites} variant="outline" size="sm">
                  Try Again
                </Button>
              </div>
            ) : filteredSites.length === 0 ? (
              <div className="p-8 text-center">
                <p className="text-muted-foreground mb-4">
                  {filter === 'all' ? 'No sites available for building' : `No ${filter} sites found`}
                </p>
                <Button asChild variant="outline">
                  <a href="/admin/sites/new">Create Your First Site</a>
                </Button>
              </div>
            ) : (
              filteredSites.map((site) => {
                const builderStatus = getBuilderStatus(site.status)
                const initials = site.name.split(' ').map(word => word[0]).join('').toUpperCase().slice(0, 2)
                
                return (
                  <div key={site.id} className="p-6">
                    <div className="grid grid-cols-7 gap-4 items-center">
                      <div className="col-span-2">
                        <Link 
                          href={`/admin/builder/${site.id}`}
                          className="flex items-center space-x-4 hover:opacity-80 transition-opacity"
                        >
                          <div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center">
                            <span className="text-muted-foreground text-sm font-medium">
                              {initials}
                            </span>
                          </div>
                          <div>
                            <h4 className="font-medium hover:underline">{site.subdomain}.domain.com</h4>
                            <p className="text-sm text-muted-foreground">
                              {site.description || site.name}
                            </p>
                          </div>
                        </Link>
                      </div>
                      <div>
                        <span className="text-sm">{site.theme_name}</span>
                      </div>
                      <div>
                        <span className={`px-2 py-1 text-xs rounded-full ${getStatusColor(site.status)}`}>
                          {builderStatus === 'in-progress' ? 'In Progress' : 
                           builderStatus.charAt(0).toUpperCase() + builderStatus.slice(1)}
                        </span>
                      </div>
                      <div>
                        <span className="text-sm text-muted-foreground">
                          {formatDate(site.updated_at)}
                        </span>
                      </div>
                      <div>
                        <span className="text-sm text-muted-foreground">
                          {formatDate(site.created_at)}
                        </span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Button 
                          variant="default" 
                          size="sm"
                          asChild
                        >
                          <a href={`/admin/builder/${site.id}`} title="Edit in builder">
                            <Wrench className="h-4 w-4 mr-1" />
                            Build
                          </a>
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-8 w-8 p-0"
                          asChild
                        >
                          <a 
                            href={`https://${site.subdomain}.domain.com`} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            title="Preview site"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-8 w-8 p-0"
                          asChild
                        >
                          <a href={`/admin/sites/${site.id}/settings`} title="Site settings">
                            <Settings className="h-4 w-4" />
                          </a>
                        </Button>
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </AdminCard>
      </div>
    </AdminLayout>
  )
}

// claude.md followed