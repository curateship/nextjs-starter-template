"use client"

import { useState } from "react"
import { AdminLayout, AdminPageHeader, AdminCard } from "@/components/admin/layout/admin-layout"
import { Button } from "@/components/ui/button"

export default function ThemesPage() {
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  
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
              <h3 className="text-lg font-semibold">Themes List</h3>
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
                        All Themes
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
                        Beta
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
                        Deprecated
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
          
          <div className="divide-y">
            {/* Theme 1 */}
            <div className="p-6 flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                  <span className="text-white text-sm font-medium">🎨</span>
                </div>
                <div>
                  <h4 className="font-medium">Modern Business</h4>
                  <p className="text-sm text-muted-foreground">Clean and professional design for corporate websites</p>
                </div>
              </div>
              <div className="flex items-center space-x-4">
                <span className="text-sm text-muted-foreground">Used by 12 sites</span>
                <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded-full">Active</span>
              </div>
            </div>

            {/* Theme 2 */}
            <div className="p-6 flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 bg-gradient-to-br from-pink-500 to-orange-500 rounded-lg flex items-center justify-center">
                  <span className="text-white text-sm font-medium">✨</span>
                </div>
                <div>
                  <h4 className="font-medium">Creative Portfolio</h4>
                  <p className="text-sm text-muted-foreground">Vibrant design perfect for artists and designers</p>
                </div>
              </div>
              <div className="flex items-center space-x-4">
                <span className="text-sm text-muted-foreground">Used by 8 sites</span>
                <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded-full">Active</span>
              </div>
            </div>

            {/* Theme 3 */}
            <div className="p-6 flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-teal-600 rounded-lg flex items-center justify-center">
                  <span className="text-white text-sm font-medium">🛍️</span>
                </div>
                <div>
                  <h4 className="font-medium">E-commerce Pro</h4>
                  <p className="text-sm text-muted-foreground">Optimized theme for online stores and product catalogs</p>
                </div>
              </div>
              <div className="flex items-center space-x-4">
                <span className="text-sm text-muted-foreground">Used by 5 sites</span>
                <span className="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded-full">Beta</span>
              </div>
            </div>

            {/* Theme 4 */}
            <div className="p-6 flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 bg-gradient-to-br from-gray-600 to-gray-800 rounded-lg flex items-center justify-center">
                  <span className="text-white text-sm font-medium">📰</span>
                </div>
                <div>
                  <h4 className="font-medium">News & Blog</h4>
                  <p className="text-sm text-muted-foreground">Perfect for content-heavy sites and news portals</p>
                </div>
              </div>
              <div className="flex items-center space-x-4">
                <span className="text-sm text-muted-foreground">Used by 15 sites</span>
                <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded-full">Active</span>
              </div>
            </div>

            {/* Theme 5 */}
            <div className="p-6 flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 bg-gradient-to-br from-red-500 to-pink-600 rounded-lg flex items-center justify-center">
                  <span className="text-white text-sm font-medium">🍕</span>
                </div>
                <div>
                  <h4 className="font-medium">Restaurant Deluxe</h4>
                  <p className="text-sm text-muted-foreground">Food-focused design with menu and reservation features</p>
                </div>
              </div>
              <div className="flex items-center space-x-4">
                <span className="text-sm text-muted-foreground">Used by 3 sites</span>
                <span className="px-2 py-1 text-xs bg-yellow-100 text-yellow-800 rounded-full">Inactive</span>
              </div>
            </div>

            {/* Theme 6 */}
            <div className="p-6 flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-lg flex items-center justify-center">
                  <span className="text-white text-sm font-medium">⚖️</span>
                </div>
                <div>
                  <h4 className="font-medium">Legal Firm</h4>
                  <p className="text-sm text-muted-foreground">Professional theme designed for law firms and legal services</p>
                </div>
              </div>
              <div className="flex items-center space-x-4">
                <span className="text-sm text-muted-foreground">Used by 0 sites</span>
                <span className="px-2 py-1 text-xs bg-red-100 text-red-800 rounded-full">Deprecated</span>
              </div>
            </div>
          </div>
        </AdminCard>
      </div>
    </AdminLayout>
  )
}