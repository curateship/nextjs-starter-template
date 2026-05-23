"use client"

import { useState, useEffect } from "react"
import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { StickyHeader } from "@/components/admin/layout/stickybar/StickyHeader"
import { DashboardSubheader } from "@/components/admin/layout/dashboard/DashboardSubheader"
import {
  AdminConfirmDialog,
  AdminListSkeleton,
  AdminTableShell,
  AdminTableSummaryFooter
} from "@/components/admin/layout/list"
import {
  TableRightActions,
  TableRightActionsButton,
  TableRightActionsSearch,
  TableRightActionsSelectTrigger
} from "@/components/admin/layout/content/table-right-actions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectValue } from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table"
import { deleteUser, listUsers, type UserListItem } from "@/lib/actions/users/user-management-actions"
import { Plus, Trash2, User } from "lucide-react"
import Link from "next/link"

export default function UsersPage() {
  const [users, setUsers] = useState<UserListItem[]>([])
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null)
  const [pendingDeleteUser, setPendingDeleteUser] = useState<UserListItem | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [roleFilter, setRoleFilter] = useState("all")

  async function loadUsers() {
    setLoading(true)
    const result = await listUsers(1, 50)

    if (result.error) {
      setError(result.error)
    } else if (result.success) {
      setUsers(result.users)
      setCurrentUserId(result.currentUserId)
      setError(null)
    }

    setLoading(false)
  }

  useEffect(() => {
    loadUsers()
  }, [])

  const getInitials = (email: string, displayName: string | null) => {
    if (displayName) {
      return displayName
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    }
    return email.slice(0, 2).toUpperCase()
  }

  const getRoleBadge = (role: string) => {
    switch (role) {
      case "super_admin":
        return <Badge className="bg-blue-100 text-blue-800">Super Admin</Badge>
      case "end_user":
        return <Badge className="bg-green-100 text-green-800">User</Badge>
      default:
        return <Badge variant="secondary">{role}</Badge>
    }
  }

  const getRoleLabel = (role: string) => {
    switch (role) {
      case "super_admin":
        return "Super Admin"
      case "end_user":
        return "User"
      default:
        return role
    }
  }

  const formatLastActive = (lastSignIn: string | null) => {
    if (!lastSignIn) return "Never"

    const date = new Date(lastSignIn)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    const diffDays = Math.floor(diffHours / 24)

    if (diffHours < 1) return "Just now"
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} week${diffDays >= 14 ? "s" : ""} ago`
    return `${Math.floor(diffDays / 30)} month${diffDays >= 60 ? "s" : ""} ago`
  }

  const handleDeleteUser = async () => {
    if (!pendingDeleteUser) {
      return
    }

    setDeletingUserId(pendingDeleteUser.id)
    const result = await deleteUser(pendingDeleteUser.id)

    if (!result.success) {
      setError(result.error || "Failed to delete user")
      setDeletingUserId(null)
      return
    }

    setPendingDeleteUser(null)
    setDeletingUserId(null)
    await loadUsers()
  }

  const normalizedSearchQuery = searchQuery.trim().toLowerCase()
  const roleCounts = users.reduce<Record<string, number>>(
    (counts, user) => {
      counts.all += 1
      counts[user.role] = (counts[user.role] || 0) + 1
      return counts
    },
    { all: 0 }
  )
  const roleOptions = Array.from(new Set(users.map((user) => user.role)))
  const filteredUsers = users.filter((user) => {
    const roleMatch = roleFilter === "all" || user.role === roleFilter
    const searchMatch = !normalizedSearchQuery || `${user.display_name ?? ""} ${user.email} ${getRoleLabel(user.role)}`
      .toLowerCase()
      .includes(normalizedSearchQuery)

    return roleMatch && searchMatch
  })

  return (
    <>
      <StickyHeader />
      <AdminLayout>
        <div className="w-full">
          <DashboardSubheader
            items={[{ label: "Users" }]}
          />

          <AdminTableShell
            title="Users"
            icon={<User className="size-4 text-muted-foreground sm:size-[18px]" />}
            count={filteredUsers.length}
            controls={
              <TableRightActions>
                <TableRightActionsSearch
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search users"
                />
                <Select value={roleFilter} onValueChange={(value) => setRoleFilter(value)}>
                  <TableRightActionsSelectTrigger aria-label="User role filter">
                    <SelectValue />
                  </TableRightActionsSelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All ({roleCounts.all})</SelectItem>
                    {roleOptions.map((role) => (
                      <SelectItem key={role} value={role}>
                        {getRoleLabel(role)} ({roleCounts[role] || 0})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <TableRightActionsButton asChild>
                  <Link href="/admin/users/new">
                    <Plus className="h-4 w-4" />
                    <span className="hidden sm:inline">Add User</span>
                  </Link>
                </TableRightActionsButton>
              </TableRightActions>
            }
            footer={!loading ? <AdminTableSummaryFooter count={filteredUsers.length} label="users" /> : null}
          >

            <ScrollArea className="w-full">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead column="main">User</TableHead>
                    <TableHead column="meta">Role</TableHead>
                    <TableHead column="meta">Last Active</TableHead>
                    <TableHead column="meta">Account</TableHead>
                    <TableHead column="meta">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <AdminListSkeleton columns={5} showCheckbox={false} actionCount={1} />
                  ) : error ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-32 text-center">
                        <p className="text-red-500">Error loading users: {error}</p>
                      </TableCell>
                    </TableRow>
                  ) : filteredUsers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-32 text-center">
                        <User className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
                        <p className="text-muted-foreground">No users found</p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredUsers.map((user) => (
                      <TableRow key={user.id} className="group">
                        <TableCell column="main">
                          <div className="flex min-w-0 items-center space-x-4">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted">
                              <span className="text-sm font-medium text-muted-foreground">
                                {getInitials(user.email, user.display_name)}
                              </span>
                            </div>
                            <div className="min-w-0">
                              <h4 className="truncate text-sm font-medium sm:text-base">
                                {user.display_name || user.email.split("@")[0]}
                              </h4>
                              <p className="truncate text-xs text-muted-foreground sm:text-sm">{user.email}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell column="meta">{getRoleBadge(user.role)}</TableCell>
                        <TableCell column="mutedMeta">{formatLastActive(user.last_sign_in_at)}</TableCell>
                        <TableCell column="mutedMeta">
                          {user.id === currentUserId ? "Current account" : "-"}
                        </TableCell>
                        <TableCell column="meta">
                          {user.id !== currentUserId && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                              disabled={deletingUserId === user.id}
                              onClick={() => setPendingDeleteUser(user)}
                              aria-label={`Delete ${user.display_name || user.email}`}
                              title={`Delete ${user.display_name || user.email}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          </AdminTableShell>

          <AdminConfirmDialog
            open={Boolean(pendingDeleteUser)}
            onCancel={() => setPendingDeleteUser(null)}
            onConfirm={() => void handleDeleteUser()}
            disabled={Boolean(pendingDeleteUser && deletingUserId === pendingDeleteUser.id)}
            title="Delete user?"
            description={
              pendingDeleteUser
                ? `Delete ${pendingDeleteUser.display_name || pendingDeleteUser.email}. This also removes their auth records and any sites or media they own through cascading deletes. This cannot be undone.`
                : ""
            }
            confirmLabel={pendingDeleteUser && deletingUserId === pendingDeleteUser.id ? "Deleting..." : "Delete"}
          />
        </div>
      </AdminLayout>
    </>
  )
}
