"use client"

import { useState } from "react"
import { AdminLayout, AdminPageHeader, AdminCard } from "@/components/admin/layout/admin-layout"
import { Button } from "@/components/ui/button"

export default function PostsPage() {
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  return (
    <AdminLayout>
      <div className="w-full max-w-6xl mx-auto">
        <AdminPageHeader
          title="Posts"
          subtitle="Manage your blog posts and articles"
          primaryAction={{
            label: "Add Post",
            href: "/admin/posts/new"
          }}
        />
        
        <AdminCard>
          <div className="p-6 border-b">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold">Post List</h3>
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
                        All Posts
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
                        Scheduled
                      </button>
                      <div className="border-t my-1"></div>
                      <button 
                        onClick={() => setIsFilterOpen(false)}
                        className="block w-full text-left px-4 py-2 text-sm hover:bg-muted"
                      >
                        Tutorial
                      </button>
                      <button 
                        onClick={() => setIsFilterOpen(false)}
                        className="block w-full text-left px-4 py-2 text-sm hover:bg-muted"
                      >
                        Accessibility
                      </button>
                      <button 
                        onClick={() => setIsFilterOpen(false)}
                        className="block w-full text-left px-4 py-2 text-sm hover:bg-muted"
                      >
                        Design Systems
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
          
          <div className="divide-y">
            {/* Post 1 */}
            <div className="p-6 flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center">
                  <span className="text-muted-foreground text-sm font-medium">SC</span>
                </div>
                <div>
                  <h4 className="font-medium">Getting Started with shadcn/ui Components</h4>
                  <p className="text-sm text-muted-foreground">Tutorial • Sarah Chen</p>
                </div>
              </div>
              <div className="flex items-center space-x-4">
                <span className="text-sm text-muted-foreground">Jan 1, 2024</span>
                <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded-full">Published</span>
              </div>
            </div>

            {/* Post 2 */}
            <div className="p-6 flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center">
                  <span className="text-muted-foreground text-sm font-medium">BW</span>
                </div>
                <div>
                  <h4 className="font-medium">Building Accessible Web Applications</h4>
                  <p className="text-sm text-muted-foreground">Accessibility • Marcus Rodriguez</p>
                </div>
              </div>
              <div className="flex items-center space-x-4">
                <span className="text-sm text-muted-foreground">Jan 1, 2024</span>
                <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded-full">Published</span>
              </div>
            </div>

            {/* Post 3 */}
            <div className="p-6 flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center">
                  <span className="text-muted-foreground text-sm font-medium">MD</span>
                </div>
                <div>
                  <h4 className="font-medium">Modern Design Systems with Tailwind CSS</h4>
                  <p className="text-sm text-muted-foreground">Design Systems • Emma Thompson</p>
                </div>
              </div>
              <div className="flex items-center space-x-4">
                <span className="text-sm text-muted-foreground">Jan 1, 2024</span>
                <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded-full">Published</span>
              </div>
            </div>

            {/* Post 4 */}
            <div className="p-6 flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center">
                  <span className="text-muted-foreground text-sm font-medium">RT</span>
                </div>
                <div>
                  <h4 className="font-medium">React Testing Best Practices</h4>
                  <p className="text-sm text-muted-foreground">Tutorial • Alex Johnson</p>
                </div>
              </div>
              <div className="flex items-center space-x-4">
                <span className="text-sm text-muted-foreground">Dec 28, 2023</span>
                <span className="px-2 py-1 text-xs bg-yellow-100 text-yellow-800 rounded-full">Draft</span>
              </div>
            </div>

            {/* Post 5 */}
            <div className="p-6 flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center">
                  <span className="text-muted-foreground text-sm font-medium">UI</span>
                </div>
                <div>
                  <h4 className="font-medium">UI Performance Optimization</h4>
                  <p className="text-sm text-muted-foreground">Performance • Lisa Park</p>
                </div>
              </div>
              <div className="flex items-center space-x-4">
                <span className="text-sm text-muted-foreground">Dec 25, 2023</span>
                <span className="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded-full">Scheduled</span>
              </div>
            </div>

            {/* Post 6 */}
            <div className="p-6 flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center">
                  <span className="text-muted-foreground text-sm font-medium">CS</span>
                </div>
                <div>
                  <h4 className="font-medium">Component State Management</h4>
                  <p className="text-sm text-muted-foreground">Tutorial • David Kim</p>
                </div>
              </div>
              <div className="flex items-center space-x-4">
                <span className="text-sm text-muted-foreground">Dec 22, 2023</span>
                <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded-full">Published</span>
              </div>
            </div>

            {/* Post 7 */}
            <div className="p-6 flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center">
                  <span className="text-muted-foreground text-sm font-medium">AS</span>
                </div>
                <div>
                  <h4 className="font-medium">Advanced Styling Techniques</h4>
                  <p className="text-sm text-muted-foreground">Design Systems • Rachel Smith</p>
                </div>
              </div>
              <div className="flex items-center space-x-4">
                <span className="text-sm text-muted-foreground">Dec 20, 2023</span>
                <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded-full">Published</span>
              </div>
            </div>

            {/* Post 8 */}
            <div className="p-6 flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center">
                  <span className="text-muted-foreground text-sm font-medium">WO</span>
                </div>
                <div>
                  <h4 className="font-medium">Web Optimization Strategies</h4>
                  <p className="text-sm text-muted-foreground">Performance • Mike Chen</p>
                </div>
              </div>
              <div className="flex items-center space-x-4">
                <span className="text-sm text-muted-foreground">Dec 18, 2023</span>
                <span className="px-2 py-1 text-xs bg-yellow-100 text-yellow-800 rounded-full">Draft</span>
              </div>
            </div>
          </div>
        </AdminCard>
      </div>
    </AdminLayout>
  )
}