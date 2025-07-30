"use client"

import { useState } from "react"
import { AdminLayout, AdminPageHeader } from "@/components/admin/layout/admin-layout"
import { ThemeBlock } from "@/components/admin/content-type/themes/ThemeBlock"

export default function NewThemePage() {
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [status, setStatus] = useState("active")
  const [logo, setLogo] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    // Handle form submission
    console.log({ title, description, status, logo })
  }

  const handleSaveClick = () => {
    // Handle save button click
    console.log({ title, description, status, logo })
  }

  return (
    <AdminLayout>
      <div className="w-full max-w-6xl mx-auto">
        <AdminPageHeader
          title="Add Theme"
          subtitle="Create a new theme for multi-site deployments"
          primaryAction={{
            label: "Create Theme",
            onClick: handleSaveClick
          }}
          secondaryAction={{
            label: "Cancel",
            href: "/admin/themes"
          }}
        />

        <form onSubmit={handleSubmit}>
          <ThemeBlock
            title={title}
            description={description}
            status={status}
            logo={logo}
            logoPreview={logoPreview}
            onTitleChange={setTitle}
            onDescriptionChange={setDescription}
            onStatusChange={setStatus}
            onLogoChange={setLogo}
            onLogoPreviewChange={setLogoPreview}
          />
        </form>
      </div>
    </AdminLayout>
  )
}