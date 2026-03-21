"use client"

import { useState } from "react"
import { AdminLayout } from "@/components/admin/layout/admin-layout"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from "@/components/admin/layout/dashboard/breadcrumb"
import { Button } from "@/components/ui/button"
import { UserBlock } from "@/components/ui/user-block"
import { HomeIcon } from "lucide-react"
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
    <AdminLayout>
      <div className="w-full">
        {/* Breadcrumb navigation + action buttons */}
        <div className="flex items-center justify-between mb-6 mx-4 mt-2">
          <Breadcrumb>
            <BreadcrumbList className="h-8 gap-2 rounded-md border px-3 text-sm">
              <BreadcrumbItem>
                <BreadcrumbLink href="/admin">
                  <HomeIcon className="size-4" />
                  <span className="sr-only">Home</span>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink href="/admin/users">Users</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>New</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          <div className="flex items-center gap-1.5 sm:gap-3">
            <Button variant="outline" asChild>
              <Link href="/admin/users">Cancel</Link>
            </Button>
            <Button onClick={handleSaveClick}>Create User</Button>
          </div>
        </div>

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