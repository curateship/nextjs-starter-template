"use client"

import { useState, useEffect } from "react"
import { AdminLayout, AdminPageHeader, AdminCard } from "@/components/admin/layout/admin-layout"
import { Button } from "@/components/ui/button"
import { Eye, Settings, Wrench } from "lucide-react"
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
          <div className="p-6">
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
          
          {/* Site Builder Cards Grid */}
          <div className="p-6">
            {loading ? (
              <div className="text-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
                <p className="text-muted-foreground">Loading sites...</p>
              </div>
            ) : error ? (
              <div className="text-center py-12">
                <p className="text-red-600 mb-4">{error}</p>
                <Button onClick={loadSites} variant="outline" size="sm">
                  Try Again
                </Button>
              </div>
            ) : filteredSites.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground mb-4">
                  {filter === 'all' ? 'No sites available for building' : `No ${filter} sites found`}
                </p>
                <Button asChild variant="outline">
                  <a href="/admin/sites/new">Create Your First Site</a>
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredSites.map((site) => {
                  const builderStatus = getBuilderStatus(site.status)
                  
                  return (
                    <div key={site.id} className="border rounded-lg overflow-hidden hover:shadow-md transition-shadow">
                      {/* Site Thumbnail */}
                      <div className="aspect-video bg-muted flex items-center justify-center relative">
                        {site.preview_image ? (
                          <img 
                            src={site.preview_image} 
                            alt={`${site.name} preview`}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="text-center">
                            <div className="text-muted-foreground text-sm mb-2">Site Preview</div>
                            <div className="text-xs text-muted-foreground">{site.theme_name}</div>
                          </div>
                        )}
                        {builderStatus === 'published' && (
                          <div className="absolute top-2 right-2 w-3 h-3 bg-green-500 rounded-full"></div>
                        )}
                      </div>
                      
                      {/* Site Info */}
                      <div className="p-4">
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <h4 className="font-medium">{site.subdomain}.domain.com</h4>
                            <p className="text-sm text-muted-foreground">
                              {site.description || site.name}
                            </p>
                          </div>
                          <span className={`px-2 py-1 text-xs rounded-full ${getStatusColor(site.status)}`}>
                            {builderStatus === 'in-progress' ? 'In Progress' : builderStatus}
                          </span>
                        </div>
                        
                        <div className="text-xs text-muted-foreground mb-3">
                          <div>Theme: {site.theme_name}</div>
                          <div>Owner: You</div>
                          <div>Created: {formatDate(site.created_at)}</div>
                          <div>Last updated: {formatDate(site.updated_at)}</div>
                        </div>
                        
                        {/* Action Buttons */}
                        <div className="flex items-center space-x-2">
                          <Button 
                            size="sm" 
                            className="flex-1"
                            asChild
                          >
                            <a href={`/admin/builder/${site.id}`}>
                              <Wrench className="w-4 h-4 mr-1" />
                              Edit Site
                            </a>
                          </Button>
                          <Button 
                            variant="outline" 
                            size="sm"
                            asChild
                          >
                            <a 
                              href={`https://${site.subdomain}.domain.com`} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              title="Preview site"
                            >
                              <Eye className="w-4 h-4" />
                            </a>
                          </Button>
                          <Button 
                            variant="outline" 
                            size="sm"
                            asChild
                          >
                            <a href={`/admin/sites/${site.id}/settings`} title="Site settings">
                              <Settings className="w-4 h-4" />
                            </a>
                          </Button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </AdminCard>
      </div>
    </AdminLayout>
  )
}

// claude.md followed