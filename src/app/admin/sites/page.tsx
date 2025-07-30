"use client"

import { useState } from "react"
import { AdminLayout, AdminPageHeader, AdminCard } from "@/components/admin/layout/admin-layout"
import { Button } from "@/components/ui/button"

export default function SitesPage() {
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  
  return (
    <AdminLayout>
      <div className="w-full max-w-6xl mx-auto">
        <AdminPageHeader
          title="Multi-Sites"
          subtitle="Manage your site collection"
          primaryAction={{
            label: "Create Site",
            href: "/admin/sites/new"
          }}
        />
        
        <AdminCard>
          <div className="p-6 border-b">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold">Sites List</h3>
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
                        Active
                      </button>
                      <button 
                        onClick={() => setIsFilterOpen(false)}
                        className="block w-full text-left px-4 py-2 text-sm hover:bg-muted"
                      >
                        Inactive
                      </button>
                      <button 
                        onClick={() => setIsFilterOpen(false)}
                        className="block w-full text-left px-4 py-2 text-sm hover:bg-muted"
                      >
                        Draft
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
          
          <div className="divide-y">
            {/* Site 1 */}
            <div className="p-6 flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center">
                  <span className="text-muted-foreground text-sm font-medium">MS</span>
                </div>
                <div>
                  <h4 className="font-medium">mystore.domain.com</h4>
                  <p className="text-sm text-muted-foreground">E-commerce Site</p>
                </div>
              </div>
              <div className="flex items-center space-x-4">
                <span className="text-sm text-muted-foreground">Created: 2 days ago</span>
                <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded-full">Active</span>
              </div>
            </div>

            {/* Site 2 */}
            <div className="p-6 flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center">
                  <span className="text-muted-foreground text-sm font-medium">BL</span>
                </div>
                <div>
                  <h4 className="font-medium">blog.domain.com</h4>
                  <p className="text-sm text-muted-foreground">Personal Blog</p>
                </div>
              </div>
              <div className="flex items-center space-x-4">
                <span className="text-sm text-muted-foreground">Created: 1 week ago</span>
                <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded-full">Active</span>
              </div>
            </div>

            {/* Site 3 */}
            <div className="p-6 flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center">
                  <span className="text-muted-foreground text-sm font-medium">PF</span>
                </div>
                <div>
                  <h4 className="font-medium">portfolio.domain.com</h4>
                  <p className="text-sm text-muted-foreground">Portfolio Site</p>
                </div>
              </div>
              <div className="flex items-center space-x-4">
                <span className="text-sm text-muted-foreground">Created: 3 weeks ago</span>
                <span className="px-2 py-1 text-xs bg-yellow-100 text-yellow-800 rounded-full">Draft</span>
              </div>
            </div>

            {/* Site 4 */}
            <div className="p-6 flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center">
                  <span className="text-muted-foreground text-sm font-medium">DM</span>
                </div>
                <div>
                  <h4 className="font-medium">demo.domain.com</h4>
                  <p className="text-sm text-muted-foreground">Demo Site</p>
                </div>
              </div>
              <div className="flex items-center space-x-4">
                <span className="text-sm text-muted-foreground">Created: 1 month ago</span>
                <span className="px-2 py-1 text-xs bg-red-100 text-red-800 rounded-full">Inactive</span>
              </div>
            </div>

            {/* Site 5 */}
            <div className="p-6 flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center">
                  <span className="text-muted-foreground text-sm font-medium">AP</span>
                </div>
                <div>
                  <h4 className="font-medium">app.domain.com</h4>
                  <p className="text-sm text-muted-foreground">Web Application</p>
                </div>
              </div>
              <div className="flex items-center space-x-4">
                <span className="text-sm text-muted-foreground">Created: 2 months ago</span>
                <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded-full">Active</span>
              </div>
            </div>
          </div>
        </AdminCard>
      </div>
    </AdminLayout>
  )
}