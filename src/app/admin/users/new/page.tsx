"use client"

import { useState } from "react"
import { AdminLayout, AdminPageHeader } from "@/components/admin/layout/admin-layout"
import { UserBlock } from "@/components/ui/user-block"

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
    <AdminLayout>
      <div className="w-full max-w-6xl mx-auto">
        <AdminPageHeader
          title="Add User"
          subtitle="Create a new user account"
          primaryAction={{
            label: "Create User",
            onClick: handleSaveClick
          }}
          secondaryAction={{
            label: "Cancel",
            href: "/admin/users"
          }}
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
  )
}