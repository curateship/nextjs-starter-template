"use client"

import { useState, useEffect } from "react"
import { AdminLayout, AdminPageHeader, AdminCard } from "@/components/admin/layout/admin-layout"
import { Button } from "@/components/ui/button"
import type { Theme } from "@/lib/supabase/themes"
import { getAllThemesAction, updateThemeStatusAction } from "@/lib/actions/theme-actions"

type FilterStatus = 'all' | 'active' | 'inactive' | 'development'

// Helper functions for theme status
function getStatusColor(status: string): string {
  switch (status) {
    case 'active':
      return 'bg-green-100 text-green-800'
    case 'inactive':
      return 'bg-red-100 text-red-800'
    case 'development':
      return 'bg-yellow-100 text-yellow-800'
    default:
      return 'bg-gray-100 text-gray-800'
  }
}

function getStatusIcon(status: string): string {
  switch (status) {
    case 'active':
      return '✓'
    case 'inactive':
      return '×'
    case 'development':
      return '⚠'
    default:
      return '?'
  }
}

export default function ThemesPage() {
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [themes, setThemes] = useState<Theme[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<FilterStatus>('all')
  const [updating, setUpdating] = useState<string | null>(null)

  const loadThemes = async () => {
    try {
      setLoading(true)
      setError(null)
      const { data, error } = await getAllThemesAction()
      
      if (error) {
        console.error('Error loading themes:', error)
        setError(error)
        return
      }
      
      if (data) {
        setThemes(data)
        console.log('Loaded themes:', data)
      }
    } catch (err) {
      console.error('Error loading themes:', err)
      setError('Failed to load themes')
    } finally {
      setLoading(false)
    }
  }

  const handleStatusChange = async (themeId: string, newStatus: 'active' | 'inactive' | 'development') => {
    try {
      setUpdating(themeId)
      const { data, error } = await updateThemeStatusAction(themeId, newStatus)
      
      if (error) {
        console.error('Error updating theme status:', error)
        setError(error)
        return
      }
      
      // Update local state
      setThemes(prev => prev.map(theme => 
        theme.id === themeId ? { ...theme, status: newStatus, updated_at: data?.updated_at || theme.updated_at } : theme
      ))
    } catch (err) {
      console.error('Error updating theme status:', err)
      setError('Failed to update theme status')
    } finally {
      setUpdating(null)
    }
  }

  const handleFilterChange = (newFilter: FilterStatus) => {
    setFilter(newFilter)
    setIsFilterOpen(false)
  }

  const filteredThemes = themes.filter(theme => {
    if (filter === 'all') return true
    return theme.status === filter
  })

  useEffect(() => {
    loadThemes()
  }, [])
  
  return (
    <AdminLayout>
      <div className="w-full max-w-6xl mx-auto">
        <AdminPageHeader
          title="Themes"
          subtitle="Manage themes for multi-site deployments"
          primaryAction={{
            label: "Add Theme",
            href: "/admin/themes/new"
          }}
        />
        
        <AdminCard>
          <div className="p-6 border-b">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-lg font-semibold">Themes List</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {loading ? 'Loading...' : `${filteredThemes.length} theme${filteredThemes.length !== 1 ? 's' : ''} found`}
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
                        All Themes
                      </button>
                      <button 
                        onClick={() => handleFilterChange('active')}
                        className={`block w-full text-left px-4 py-2 text-sm hover:bg-muted ${
                          filter === 'active' ? 'bg-muted font-medium' : ''
                        }`}
                      >
                        Active
                      </button>
                      <button 
                        onClick={() => handleFilterChange('development')}
                        className={`block w-full text-left px-4 py-2 text-sm hover:bg-muted ${
                          filter === 'development' ? 'bg-muted font-medium' : ''
                        }`}
                      >
                        Development
                      </button>
                      <button 
                        onClick={() => handleFilterChange('inactive')}
                        className={`block w-full text-left px-4 py-2 text-sm hover:bg-muted ${
                          filter === 'inactive' ? 'bg-muted font-medium' : ''
                        }`}
                      >
                        Inactive
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
          
          <div className="divide-y">
            {loading ? (
              <div className="p-8 text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
                <p className="text-muted-foreground">Loading themes...</p>
              </div>
            ) : error ? (
              <div className="p-8 text-center">
                <p className="text-red-600 mb-4">{error}</p>
                <Button onClick={loadThemes} variant="outline" size="sm">
                  Try Again
                </Button>
              </div>
            ) : filteredThemes.length === 0 ? (
              <div className="p-8 text-center">
                <p className="text-muted-foreground">
                  {filter === 'all' ? 'No themes found' : `No ${filter} themes found`}
                </p>
              </div>
            ) : (
              filteredThemes.map((theme) => (
                <div key={theme.id} className="p-6 flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-blue-600 rounded-lg flex items-center justify-center overflow-hidden">
                      {theme.preview_image ? (
                        <img 
                          src={theme.preview_image} 
                          alt={`${theme.name} preview`}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="text-white text-lg">
                          {getStatusIcon(theme.status)}
                        </span>
                      )}
                    </div>
                    <div>
                      <h4 className="font-medium">{theme.name}</h4>
                      <p className="text-sm text-muted-foreground">
                        {theme.description || 'No description available'}
                      </p>
                      {theme.metadata?.features && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {theme.metadata.features.slice(0, 3).map((feature: string, index: number) => (
                            <span key={index} className="text-xs px-2 py-1 bg-muted rounded">
                              {feature}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center space-x-4">
                    <div className="flex gap-2">
                      {theme.status !== 'active' && (
                        <Button 
                          onClick={() => handleStatusChange(theme.id, 'active')}
                          disabled={updating === theme.id}
                          variant="outline" 
                          size="sm"
                        >
                          {updating === theme.id ? 'Activating...' : 'Activate'}
                        </Button>
                      )}
                      {theme.status !== 'inactive' && (
                        <Button 
                          onClick={() => handleStatusChange(theme.id, 'inactive')}
                          disabled={updating === theme.id}
                          variant="outline" 
                          size="sm"
                        >
                          {updating === theme.id ? 'Deactivating...' : 'Deactivate'}
                        </Button>
                      )}
                      <Button asChild variant="outline" size="sm">
                        <a href={theme.template_path} target="_blank" rel="noopener noreferrer">
                          Preview
                        </a>
                      </Button>
                    </div>
                    <span className={`px-2 py-1 text-xs rounded-full ${
                      getStatusColor(theme.status)
                    }`}>
                      {theme.status.charAt(0).toUpperCase() + theme.status.slice(1)}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </AdminCard>
      </div>
    </AdminLayout>
  )
}

// claude.md followed