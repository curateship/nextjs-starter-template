"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { AdminLayout, AdminPageHeader, AdminCard } from "@/components/admin/layout/admin-layout"
import { Button } from "@/components/ui/button"
import { Trash2, MoreHorizontal, ExternalLink, Power, PowerOff } from "lucide-react"
import type { Theme } from "@/lib/supabase/themes"
import { getAllThemesAction, updateThemeStatusAction, deleteThemeAction } from "@/lib/actions/themes/theme-actions"

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
  const [deleting, setDeleting] = useState<string | null>(null)
  const [openDropdown, setOpenDropdown] = useState<string | null>(null)

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

  const handleDelete = async (themeId: string) => {
    if (!confirm('Are you sure you want to delete this theme? This action cannot be undone.')) {
      return
    }

    try {
      setDeleting(themeId)
      const { success, error } = await deleteThemeAction(themeId)
      
      if (error) {
        console.error('Error deleting theme:', error)
        alert(`Failed to delete theme: ${error}`)
        return
      }
      
      if (success) {
        // Remove from local state
        setThemes(prev => prev.filter(theme => theme.id !== themeId))
      }
    } catch (err) {
      console.error('Error deleting theme:', err)
      alert('Failed to delete theme')
    } finally {
      setDeleting(null)
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

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element
      const dropdownContainer = target.closest('.dropdown-container')
      
      if (openDropdown && !dropdownContainer) {
        setOpenDropdown(null)
      }
    }

    if (openDropdown) {
      document.addEventListener('click', handleClickOutside)
    }
    
    return () => document.removeEventListener('click', handleClickOutside)
  }, [openDropdown])
  
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
                    <Link 
                      href={`/admin/themes/${theme.id}/edit`}
                      className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-blue-600 rounded-lg flex items-center justify-center hover:opacity-80 transition-opacity"
                    >
                      <span className="text-white text-sm font-medium">
                        {theme.name.split(' ').map(word => word[0]).join('').toUpperCase().slice(0, 2)}
                      </span>
                    </Link>
                    <div>
                      <Link 
                        href={`/admin/themes/${theme.id}/edit`}
                        className="hover:underline"
                      >
                        <h4 className="font-medium">{theme.name}</h4>
                      </Link>
                      <p className="text-sm text-muted-foreground">
                        {theme.description || 'No description available'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-4">
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
                    <span className={`px-2 py-1 text-xs rounded-full ${
                      getStatusColor(theme.status)
                    }`}>
                      {theme.status.charAt(0).toUpperCase() + theme.status.slice(1)}
                    </span>
                    <div className="relative dropdown-container">
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-8 w-8 p-0"
                        onClick={() => setOpenDropdown(openDropdown === theme.id ? null : theme.id)}
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                      {openDropdown === theme.id && (
                        <div className="absolute right-0 mt-1 w-48 bg-card border rounded-md shadow-lg z-10">
                          <div className="py-1">
                            {theme.status !== 'inactive' && (
                              <button 
                                onClick={() => {
                                  setOpenDropdown(null)
                                  handleStatusChange(theme.id, 'inactive')
                                }}
                                disabled={updating === theme.id}
                                className="flex items-center w-full px-4 py-2 text-sm hover:bg-muted disabled:opacity-50"
                              >
                                {updating === theme.id ? (
                                  <>
                                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-600 mr-2"></div>
                                    Deactivating...
                                  </>
                                ) : (
                                  <>
                                    <PowerOff className="h-4 w-4 mr-2" />
                                    Deactivate
                                  </>
                                )}
                              </button>
                            )}
                            <button 
                              onClick={() => {
                                setOpenDropdown(null)
                                handleDelete(theme.id)
                              }}
                              disabled={deleting === theme.id}
                              className="flex items-center w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
                            >
                              {deleting === theme.id ? (
                                <>
                                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-red-600 mr-2"></div>
                                  Deleting...
                                </>
                              ) : (
                                <>
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Delete Theme
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
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