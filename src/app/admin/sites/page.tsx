"use client"

import { useState } from "react"
import { AdminLayout, AdminPageHeader, AdminCard } from "@/components/admin/layout/admin-layout"
import { Button } from "@/components/ui/button"
import { Eye, Settings } from "lucide-react"

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
          
          {/* Table Header */}
          <div className="px-6 py-4 border-b bg-muted/30">
            <div className="grid grid-cols-7 gap-4 text-sm font-medium text-muted-foreground">
              <div className="col-span-2">Site</div>
              <div>User</div>
              <div>Theme</div>
              <div>Created</div>
              <div>Status</div>
              <div>Actions</div>
            </div>
          </div>
          
          <div className="divide-y">
            {/* Site 1 */}
            <div className="p-6">
              <div className="grid grid-cols-7 gap-4 items-center">
                <div className="col-span-2 flex items-center space-x-4">
                  <div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center">
                    <span className="text-muted-foreground text-sm font-medium">MS</span>
                  </div>
                  <div>
                    <h4 className="font-medium">mystore.domain.com</h4>
                    <p className="text-sm text-muted-foreground">E-commerce Site</p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                    <span className="text-blue-600 text-xs font-medium">JD</span>
                  </div>
                  <span className="text-sm">John Doe</span>
                </div>
                <div>
                  <span className="text-sm">Modern Store</span>
                </div>
                <div>
                  <span className="text-sm text-muted-foreground">2 days ago</span>
                </div>
                <div>
                  <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded-full">Active</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                    <Settings className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Site 2 */}
            <div className="p-6">
              <div className="grid grid-cols-7 gap-4 items-center">
                <div className="col-span-2 flex items-center space-x-4">
                  <div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center">
                    <span className="text-muted-foreground text-sm font-medium">BL</span>
                  </div>
                  <div>
                    <h4 className="font-medium">blog.domain.com</h4>
                    <p className="text-sm text-muted-foreground">Personal Blog</p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                    <span className="text-green-600 text-xs font-medium">AS</span>
                  </div>
                  <span className="text-sm">Alice Smith</span>
                </div>
                <div>
                  <span className="text-sm">Minimal Blog</span>
                </div>
                <div>
                  <span className="text-sm text-muted-foreground">1 week ago</span>
                </div>
                <div>
                  <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded-full">Active</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                    <Settings className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Site 3 */}
            <div className="p-6">
              <div className="grid grid-cols-7 gap-4 items-center">
                <div className="col-span-2 flex items-center space-x-4">
                  <div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center">
                    <span className="text-muted-foreground text-sm font-medium">PF</span>
                  </div>
                  <div>
                    <h4 className="font-medium">portfolio.domain.com</h4>
                    <p className="text-sm text-muted-foreground">Portfolio Site</p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center">
                    <span className="text-purple-600 text-xs font-medium">RJ</span>
                  </div>
                  <span className="text-sm">Robert Johnson</span>
                </div>
                <div>
                  <span className="text-sm">Creative Portfolio</span>
                </div>
                <div>
                  <span className="text-sm text-muted-foreground">3 weeks ago</span>
                </div>
                <div>
                  <span className="px-2 py-1 text-xs bg-yellow-100 text-yellow-800 rounded-full">Draft</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                    <Settings className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Site 4 */}
            <div className="p-6">
              <div className="grid grid-cols-7 gap-4 items-center">
                <div className="col-span-2 flex items-center space-x-4">
                  <div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center">
                    <span className="text-muted-foreground text-sm font-medium">DM</span>
                  </div>
                  <div>
                    <h4 className="font-medium">demo.domain.com</h4>
                    <p className="text-sm text-muted-foreground">Demo Site</p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-8 h-8 bg-orange-100 rounded-full flex items-center justify-center">
                    <span className="text-orange-600 text-xs font-medium">MW</span>
                  </div>
                  <span className="text-sm">Maria Wilson</span>
                </div>
                <div>
                  <span className="text-sm">Default Theme</span>
                </div>
                <div>
                  <span className="text-sm text-muted-foreground">1 month ago</span>
                </div>
                <div>
                  <span className="px-2 py-1 text-xs bg-red-100 text-red-800 rounded-full">Inactive</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                    <Settings className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Site 5 */}
            <div className="p-6">
              <div className="grid grid-cols-7 gap-4 items-center">
                <div className="col-span-2 flex items-center space-x-4">
                  <div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center">
                    <span className="text-muted-foreground text-sm font-medium">AP</span>
                  </div>
                  <div>
                    <h4 className="font-medium">app.domain.com</h4>
                    <p className="text-sm text-muted-foreground">Web Application</p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center">
                    <span className="text-indigo-600 text-xs font-medium">DB</span>
                  </div>
                  <span className="text-sm">David Brown</span>
                </div>
                <div>
                  <span className="text-sm">App Template</span>
                </div>
                <div>
                  <span className="text-sm text-muted-foreground">2 months ago</span>
                </div>
                <div>
                  <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded-full">Active</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                    <Settings className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </AdminCard>
      </div>
    </AdminLayout>
  )
}