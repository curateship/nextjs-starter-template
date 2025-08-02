"use client"

import { useState } from "react"
import { AdminLayout, AdminPageHeader, AdminCard } from "@/components/admin/layout/admin-layout"
import { Button } from "@/components/ui/button"
import { Eye, Settings, Wrench } from "lucide-react"

export default function AdminDashboard() {
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  
  // Mock data for sites available for building
  const builderSites = [
    {
      id: "1",
      name: "mystore.domain.com",
      description: "E-commerce Site",
      theme: "Modern Store",
      user: "John Doe",
      status: "published",
      lastEdited: "2 days ago",
      thumbnail: "/api/placeholder/300/200",
    },
    {
      id: "2", 
      name: "blog.domain.com",
      description: "Personal Blog",
      theme: "Minimal Blog",
      user: "Alice Smith", 
      status: "draft",
      lastEdited: "1 week ago",
      thumbnail: "/api/placeholder/300/200",
    },
    {
      id: "3",
      name: "portfolio.domain.com", 
      description: "Portfolio Site",
      theme: "Creative Portfolio",
      user: "Robert Johnson",
      status: "in-progress",
      lastEdited: "3 days ago",
      thumbnail: "/api/placeholder/300/200",
    },
  ]
  
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
              <h3 className="text-lg font-semibold">Sites Available for Building</h3>
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
                        All Sites
                      </button>
                      <button 
                        onClick={() => setIsFilterOpen(false)}
                        className="block w-full text-left px-4 py-2 text-sm hover:bg-muted"
                      >
                        Published
                      </button>
                      <button 
                        onClick={() => setIsFilterOpen(false)}
                        className="block w-full text-left px-4 py-2 text-sm hover:bg-muted"
                      >
                        Draft
                      </button>
                      <button 
                        onClick={() => setIsFilterOpen(false)}
                        className="block w-full text-left px-4 py-2 text-sm hover:bg-muted"
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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {builderSites.map((site) => (
                <div key={site.id} className="border rounded-lg overflow-hidden hover:shadow-md transition-shadow">
                  {/* Site Thumbnail */}
                  <div className="aspect-video bg-muted flex items-center justify-center">
                    <div className="text-muted-foreground text-sm">Site Preview</div>
                  </div>
                  
                  {/* Site Info */}
                  <div className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <h4 className="font-medium">{site.name}</h4>
                        <p className="text-sm text-muted-foreground">{site.description}</p>
                      </div>
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        site.status === 'published' ? 'bg-green-100 text-green-800' :
                        site.status === 'draft' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-blue-100 text-blue-800'
                      }`}>
                        {site.status === 'in-progress' ? 'In Progress' : site.status}
                      </span>
                    </div>
                    
                    <div className="text-xs text-muted-foreground mb-3">
                      <div>Theme: {site.theme}</div>
                      <div>Owner: {site.user}</div>
                      <div>Last edited: {site.lastEdited}</div>
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
                      <Button variant="outline" size="sm">
                        <Eye className="w-4 h-4" />
                      </Button>
                      <Button variant="outline" size="sm">
                        <Settings className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </AdminCard>
      </div>
    </AdminLayout>
  )
}
