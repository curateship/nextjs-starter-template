"use client"

import { useState } from "react"
import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { StickyHeader } from "@/components/admin/layout/stickybar/StickyHeader"
import { DashboardSubheader } from "@/components/admin/layout/dashboard/DashboardSubheader"
import { Button } from "@/components/ui/button"
import { UserBlock } from "@/components/ui/user-block"
import Link from "next/link"

export default function NewUserPage() {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [role, setRole] = useState("user")
  const [avatar, setAvatar] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    // Handle form submission
    
  }

  const handleSaveClick = () => {
    // Handle save button click
    
  }

  return (
    <>
    <StickyHeader />
    <AdminLayout>
      <div className="w-full">
        {/* Breadcrumb navigation + action buttons */}
        <DashboardSubheader
          items={[
            { label: "Users", href: "/admin/users" },
            { label: "New" },
          ]}
          actions={
            <div className="flex items-center gap-1.5 sm:gap-3">
              <Button variant="outline" asChild>
                <Link href="/admin/users">Cancel</Link>
              </Button>
              <Button onClick={handleSaveClick}>Create User</Button>
            </div>
          }
        />

        <form onSubmit={handleSubmit}>
          <UserBlock
            name={name}
            email={email}
            role={role}
            avatar={avatar}
            avatarPreview={avatarPreview}
            onNameChange={setName}
            onEmailChange={setEmail}
            onRoleChange={setRole}
            onAvatarChange={setAvatar}
            onAvatarPreviewChange={setAvatarPreview}
          />
        </form>
      </div>
    </AdminLayout>
    </>
  )
}