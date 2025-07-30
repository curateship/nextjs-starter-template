"use client"

import { useState } from "react"
import { AdminLayout, AdminPageHeader, AdminCard } from "@/components/admin/layout/admin-layout"
import { Button } from "@/components/ui/button"
import { Grid, List, Image as ImageIcon } from "lucide-react"

export default function ImagesPage() {
  const [viewMode, setViewMode] = useState<'list' | 'gallery'>('gallery')
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  
  return (
    <AdminLayout>
      <div className="w-full max-w-6xl mx-auto">
        <AdminPageHeader
          title="Image Library"
          subtitle="Manage images for all your sites"
          primaryAction={{
            label: "Add Image",
            href: "/admin/images/new"
          }}
        />
        
        <AdminCard>
          <div className="p-6 border-b">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold">Images Library</h3>
              <div className="flex items-center space-x-4">
                {/* View Mode Toggle */}
                <div className="flex items-center border rounded-md">
                  <Button
                    variant={viewMode === 'list' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setViewMode('list')}
                    className="rounded-r-none"
                  >
                    <List className="w-4 h-4" />
                  </Button>
                  <Button
                    variant={viewMode === 'gallery' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setViewMode('gallery')}
                    className="rounded-l-none"
                  >
                    <Grid className="w-4 h-4" />
                  </Button>
                </div>
                
                {/* Filter Toggle */}
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
                          onClick={() => setIsFilterOpen(false)}
                          className="block w-full text-left px-4 py-2 text-sm hover:bg-muted"
                        >
                          All Images
                        </button>
                        <button 
                          onClick={() => setIsFilterOpen(false)}
                          className="block w-full text-left px-4 py-2 text-sm hover:bg-muted"
                        >
                          Used Images
                        </button>
                        <button 
                          onClick={() => setIsFilterOpen(false)}
                          className="block w-full text-left px-4 py-2 text-sm hover:bg-muted"
                        >
                          Unused Images
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
          
          {viewMode === 'gallery' ? (
            // Gallery View
            <div className="p-6">
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {/* Image 1 */}
                <div className="group relative bg-muted rounded-lg overflow-hidden aspect-square">
                  <img
                    src="https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=300&h=300&fit=crop&crop=entropy&auto=format"
                    alt="Hero Banner"
                    className="w-full h-full object-cover transition-transform group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <div className="text-white text-center text-sm">
                      <p className="font-medium">Hero Banner</p>
                      <p className="text-xs">Used in 3 sites</p>
                    </div>
                  </div>
                  <div className="absolute top-2 right-2">
                    <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded-full">Used</span>
                  </div>
                </div>

                {/* Image 2 */}
                <div className="group relative bg-muted rounded-lg overflow-hidden aspect-square">
                  <img
                    src="https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=300&h=300&fit=crop&crop=entropy&auto=format"
                    alt="Business Meeting"
                    className="w-full h-full object-cover transition-transform group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <div className="text-white text-center text-sm">
                      <p className="font-medium">Business Meeting</p>
                      <p className="text-xs">Used in 1 site</p>
                    </div>
                  </div>
                  <div className="absolute top-2 right-2">
                    <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded-full">Used</span>
                  </div>
                </div>

                {/* Image 3 */}
                <div className="group relative bg-muted rounded-lg overflow-hidden aspect-square">
                  <img
                    src="https://images.unsplash.com/photo-1551434678-e076c223a692?w=300&h=300&fit=crop&crop=entropy&auto=format"
                    alt="Team Collaboration"
                    className="w-full h-full object-cover transition-transform group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <div className="text-white text-center text-sm">
                      <p className="font-medium">Team Collaboration</p>
                      <p className="text-xs">Unused</p>
                    </div>
                  </div>
                  <div className="absolute top-2 right-2">
                    <span className="px-2 py-1 text-xs bg-red-100 text-red-800 rounded-full">Unused</span>
                  </div>
                </div>

                {/* Image 4 */}
                <div className="group relative bg-muted rounded-lg overflow-hidden aspect-square">
                  <img
                    src="https://images.unsplash.com/photo-1504384308090-c894fdcc538d?w=300&h=300&fit=crop&crop=entropy&auto=format"
                    alt="Modern Office"
                    className="w-full h-full object-cover transition-transform group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <div className="text-white text-center text-sm">
                      <p className="font-medium">Modern Office</p>
                      <p className="text-xs">Used in 2 sites</p>
                    </div>
                  </div>
                  <div className="absolute top-2 right-2">
                    <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded-full">Used</span>
                  </div>
                </div>

                {/* Image 5 */}
                <div className="group relative bg-muted rounded-lg overflow-hidden aspect-square">
                  <img
                    src="https://images.unsplash.com/photo-1515378791036-0648a814c963?w=300&h=300&fit=crop&crop=entropy&auto=format"
                    alt="Creative Workspace"
                    className="w-full h-full object-cover transition-transform group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <div className="text-white text-center text-sm">
                      <p className="font-medium">Creative Workspace</p>
                      <p className="text-xs">Unused</p>
                    </div>
                  </div>
                  <div className="absolute top-2 right-2">
                    <span className="px-2 py-1 text-xs bg-red-100 text-red-800 rounded-full">Unused</span>
                  </div>
                </div>

                {/* Image 6 */}
                <div className="group relative bg-muted rounded-lg overflow-hidden aspect-square">
                  <img
                    src="https://images.unsplash.com/photo-1486312338219-ce68e2c6b7bb?w=300&h=300&fit=crop&crop=entropy&auto=format"
                    alt="Technology"
                    className="w-full h-full object-cover transition-transform group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <div className="text-white text-center text-sm">
                      <p className="font-medium">Technology</p>
                      <p className="text-xs">Used in 5 sites</p>
                    </div>
                  </div>
                  <div className="absolute top-2 right-2">
                    <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded-full">Used</span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            // List View
            <div className="divide-y">
              {/* Image 1 */}
              <div className="p-6 flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <div className="w-16 h-16 bg-muted rounded-lg overflow-hidden">
                    <img
                      src="https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=100&h=100&fit=crop&crop=entropy&auto=format"
                      alt="Hero Banner"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div>
                    <h4 className="font-medium">Hero Banner</h4>
                    <p className="text-sm text-muted-foreground">hero-banner.jpg • 2.4 MB</p>
                  </div>
                </div>
                <div className="flex items-center space-x-4">
                  <span className="text-sm text-muted-foreground">Used in 3 sites</span>
                  <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded-full">Used</span>
                </div>
              </div>

              {/* Image 2 */}
              <div className="p-6 flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <div className="w-16 h-16 bg-muted rounded-lg overflow-hidden">
                    <img
                      src="https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=100&h=100&fit=crop&crop=entropy&auto=format"
                      alt="Business Meeting"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div>
                    <h4 className="font-medium">Business Meeting</h4>
                    <p className="text-sm text-muted-foreground">business-meeting.jpg • 1.8 MB</p>
                  </div>
                </div>
                <div className="flex items-center space-x-4">
                  <span className="text-sm text-muted-foreground">Used in 1 site</span>
                  <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded-full">Used</span>
                </div>
              </div>

              {/* Image 3 */}
              <div className="p-6 flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <div className="w-16 h-16 bg-muted rounded-lg overflow-hidden">
                    <img
                      src="https://images.unsplash.com/photo-1551434678-e076c223a692?w=100&h=100&fit=crop&crop=entropy&auto=format"
                      alt="Team Collaboration"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div>
                    <h4 className="font-medium">Team Collaboration</h4>
                    <p className="text-sm text-muted-foreground">team-collaboration.jpg • 3.1 MB</p>
                  </div>
                </div>
                <div className="flex items-center space-x-4">
                  <span className="text-sm text-muted-foreground">Not used</span>
                  <span className="px-2 py-1 text-xs bg-red-100 text-red-800 rounded-full">Unused</span>
                </div>
              </div>

              {/* Image 4 */}
              <div className="p-6 flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <div className="w-16 h-16 bg-muted rounded-lg overflow-hidden">
                    <img
                      src="https://images.unsplash.com/photo-1504384308090-c894fdcc538d?w=100&h=100&fit=crop&crop=entropy&auto=format"
                      alt="Modern Office"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div>
                    <h4 className="font-medium">Modern Office</h4>
                    <p className="text-sm text-muted-foreground">modern-office.jpg • 2.7 MB</p>
                  </div>
                </div>
                <div className="flex items-center space-x-4">
                  <span className="text-sm text-muted-foreground">Used in 2 sites</span>
                  <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded-full">Used</span>
                </div>
              </div>

              {/* Image 5 */}
              <div className="p-6 flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <div className="w-16 h-16 bg-muted rounded-lg overflow-hidden">
                    <img
                      src="https://images.unsplash.com/photo-1486312338219-ce68e2c6b7bb?w=100&h=100&fit=crop&crop=entropy&auto=format"
                      alt="Technology"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div>
                    <h4 className="font-medium">Technology</h4>
                    <p className="text-sm text-muted-foreground">technology.jpg • 1.9 MB</p>
                  </div>
                </div>
                <div className="flex items-center space-x-4">
                  <span className="text-sm text-muted-foreground">Used in 5 sites</span>
                  <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded-full">Used</span>
                </div>
              </div>
            </div>
          )}
        </AdminCard>
      </div>
    </AdminLayout>
  )
}