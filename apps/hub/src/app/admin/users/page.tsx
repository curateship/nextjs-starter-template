"use client"

import { useState, useEffect } from "react"
import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { StickyHeader } from "@/components/admin/layout/dashboard/StickyHeader"
import { DashboardSubheader } from "@/components/admin/layout/dashboard/DashboardSubheader"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

import { listUsers, type UserListItem } from "@/lib/actions/users/user-management-actions"
import { Plus, List, Shield, Pencil, User, UserX } from "lucide-react"
import Link from "next/link"

export default function UsersPage() {
  const [users, setUsers] = useState<UserListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchUsers() {
      setLoading(true)
      const result = await listUsers(1, 50)

      if (result.error) {
        setError(result.error)
      } else if (result.success) {
        setUsers(result.users)
      }

      setLoading(false)
    }

    fetchUsers()
  }, [])

  const getInitials = (email: string, displayName: string | null) => {
    if (displayName) {
      return displayName
        .split(' ')
        .map(n => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    }
    return email.slice(0, 2).toUpperCase()
  }

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'super_admin':
        return 'bg-blue-100 text-blue-800'
      case 'end_user':
        return 'bg-green-100 text-green-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'super_admin':
        return 'Super Admin'
      case 'end_user':
        return 'User'
      default:
        return role
    }
  }

  const formatLastActive = (lastSignIn: string | null) => {
    if (!lastSignIn) return 'Never'

    const date = new Date(lastSignIn)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    const diffDays = Math.floor(diffHours / 24)

    if (diffHours < 1) return 'Just now'
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} week${diffDays >= 14 ? 's' : ''} ago`
    return `${Math.floor(diffDays / 30)} month${diffDays >= 60 ? 's' : ''} ago`
  }
  
  return (
    <>
    <StickyHeader />
    <AdminLayout>
      <div className="w-full">
        {/* Breadcrumb navigation + action buttons */}
        <DashboardSubheader
          items={[{ label: "Users" }]}
          tabs={{
            value: "all",
            onValueChange: () => {},
            items: [
              { value: "all", label: "All", icon: List },
              { value: "admin", label: "Admin", icon: Shield },
              { value: "editor", label: "Editor", icon: Pencil },
              { value: "user", label: "User", icon: User },
              { value: "guest", label: "Guest", icon: UserX },
            ],
          }}
          actions={
            <Button asChild>
              <Link href="/admin/users/new">
                <Plus className="h-4 w-4" /><span className="hidden sm:inline">Add User</span>
              </Link>
            </Button>
          }
        />

        <Card className="shadow-sm">
          <div className="divide-y">
            {loading ? (
              <div className="p-6 text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
                <p className="text-muted-foreground">Loading users...</p>
              </div>
            ) : error ? (
              <div className="p-6 text-center text-red-500">
                <p>Error loading users: {error}</p>
              </div>
            ) : users.length === 0 ? (
              <div className="p-6 text-center text-muted-foreground">
                <p>No users found</p>
              </div>
            ) : (
              users.map((user) => (
                <div key={user.id} className="p-6 flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center">
                      <span className="text-muted-foreground text-sm font-medium">
                        {getInitials(user.email, user.display_name)}
                      </span>
                    </div>
                    <div>
                      <h4 className="font-medium">
                        {user.display_name || user.email.split('@')[0]}
                      </h4>
                      <p className="text-sm text-muted-foreground">{user.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-4">
                    <span className="text-sm text-muted-foreground">
                      Last active: {formatLastActive(user.last_sign_in_at)}
                    </span>
                    <span className={`px-2 py-1 text-xs rounded-full ${getRoleBadgeColor(user.role)}`}>
                      {getRoleLabel(user.role)}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </AdminLayout>
    </>
  )
}