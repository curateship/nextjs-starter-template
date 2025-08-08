"use client"

import { useState } from "react"
import { AdminLayout, AdminPageHeader } from "@/components/admin/layout/admin-layout"
import { ThemeDashboard } from "@/components/admin/layout/dashboard/ThemeDashboard"

export default function NewThemePage() {
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [status, setStatus] = useState("active")
  const [primaryFont, setPrimaryFont] = useState("inter")
  const [secondaryFont, setSecondaryFont] = useState("roboto")
  const [logo, setLogo] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)

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
          <ThemeDashboard
            title={title}
            description={description}
            status={status}
            primaryFont={primaryFont}
            secondaryFont={secondaryFont}
            logo={logo}
            logoPreview={logoPreview}
            onTitleChange={setTitle}
            onDescriptionChange={setDescription}
            onStatusChange={setStatus}
            onPrimaryFontChange={setPrimaryFont}
            onSecondaryFontChange={setSecondaryFont}
            onLogoChange={setLogo}
            onLogoPreviewChange={setLogoPreview}
          />
        </form>
      </div>
    </AdminLayout>
  )
}