"use client"

import { useState } from "react"
import { AdminLayout, AdminPageHeader, AdminCard } from "@/components/admin/layout/admin-layout"
import { Button } from "@/components/ui/button"

export default function UsersPage() {
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  
  return (
    <AdminLayout>
      <div className="w-full max-w-6xl mx-auto">
        <AdminPageHeader
          title="Users"
          subtitle="Manage your user accounts"
          primaryAction={{
            label: "Add User",
            href: "/admin/users/new"
          }}
        />
        
        <AdminCard>
          <div className="p-6 border-b">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold">Users List</h3>
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
                        All Users
                      </button>
                      <button 
                        onClick={() => setIsFilterOpen(false)}
                        className="block w-full text-left px-4 py-2 text-sm hover:bg-muted"
                      >
                        Admin
                      </button>
                      <button 
                        onClick={() => setIsFilterOpen(false)}
                        className="block w-full text-left px-4 py-2 text-sm hover:bg-muted"
                      >
                        Editor
                      </button>
                      <button 
                        onClick={() => setIsFilterOpen(false)}
                        className="block w-full text-left px-4 py-2 text-sm hover:bg-muted"
                      >
                        User
                      </button>
                      <button 
                        onClick={() => setIsFilterOpen(false)}
                        className="block w-full text-left px-4 py-2 text-sm hover:bg-muted"
                      >
                        Guest
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
          
          <div className="divide-y">
            {/* User 1 */}
            <div className="p-6 flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center">
                  <span className="text-muted-foreground text-sm font-medium">JD</span>
                </div>
                <div>
                  <h4 className="font-medium">John Doe</h4>
                  <p className="text-sm text-muted-foreground">john.doe@example.com</p>
                </div>
              </div>
              <div className="flex items-center space-x-4">
                <span className="text-sm text-muted-foreground">Last active: 2 hours ago</span>
                <span className="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded-full">Admin</span>
              </div>
            </div>

            {/* User 2 */}
            <div className="p-6 flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center">
                  <span className="text-muted-foreground text-sm font-medium">JS</span>
                </div>
                <div>
                  <h4 className="font-medium">Jane Smith</h4>
                  <p className="text-sm text-muted-foreground">jane.smith@example.com</p>
                </div>
              </div>
              <div className="flex items-center space-x-4">
                <span className="text-sm text-muted-foreground">Last active: 1 day ago</span>
                <span className="px-2 py-1 text-xs bg-purple-100 text-purple-800 rounded-full">Editor</span>
              </div>
            </div>

            {/* User 3 */}
            <div className="p-6 flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center">
                  <span className="text-muted-foreground text-sm font-medium">MB</span>
                </div>
                <div>
                  <h4 className="font-medium">Mike Brown</h4>
                  <p className="text-sm text-muted-foreground">mike.brown@example.com</p>
                </div>
              </div>
              <div className="flex items-center space-x-4">
                <span className="text-sm text-muted-foreground">Last active: 3 days ago</span>
                <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded-full">User</span>
              </div>
            </div>

            {/* User 4 */}
            <div className="p-6 flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center">
                  <span className="text-muted-foreground text-sm font-medium">SW</span>
                </div>
                <div>
                  <h4 className="font-medium">Sarah Wilson</h4>
                  <p className="text-sm text-muted-foreground">sarah.wilson@example.com</p>
                </div>
              </div>
              <div className="flex items-center space-x-4">
                <span className="text-sm text-muted-foreground">Last active: 1 week ago</span>
                <span className="px-2 py-1 text-xs bg-purple-100 text-purple-800 rounded-full">Editor</span>
              </div>
            </div>

            {/* User 5 */}
            <div className="p-6 flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center">
                  <span className="text-muted-foreground text-sm font-medium">TJ</span>
                </div>
                <div>
                  <h4 className="font-medium">Tom Johnson</h4>
                  <p className="text-sm text-muted-foreground">tom.johnson@example.com</p>
                </div>
              </div>
              <div className="flex items-center space-x-4">
                <span className="text-sm text-muted-foreground">Last active: 2 weeks ago</span>
                <span className="px-2 py-1 text-xs bg-gray-100 text-gray-800 rounded-full">Guest</span>
              </div>
            </div>
          </div>
        </AdminCard>
      </div>
    </AdminLayout>
  )
}