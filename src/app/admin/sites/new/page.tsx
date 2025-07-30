"use client"

import { useState } from "react"
import { AdminLayout, AdminPageHeader } from "@/components/admin/layout/admin-layout"
import { SiteBlock } from "@/components/admin/content-type/sites/SiteBlock"

export default function NewSitePage() {
  const [siteName, setSiteName] = useState("")
  const [status, setStatus] = useState("draft")
  const [logo, setLogo] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    // Handle form submission
    console.log({ siteName, status, logo })
  }

  const handleSaveClick = () => {
    // Handle save button click
    console.log({ siteName, status, logo })
  }

  return (
    <AdminLayout>
      <div className="w-full max-w-6xl mx-auto">
        <AdminPageHeader
          title="Create Site"
          subtitle="Add a new site to your multi-site collection"
          primaryAction={{
            label: "Create Site",
            onClick: handleSaveClick
          }}
          secondaryAction={{
            label: "Cancel",
            href: "/admin/sites"
          }}
        />

        <form onSubmit={handleSubmit}>
          <SiteBlock
            siteName={siteName}
            status={status}
            logo={logo}
            logoPreview={logoPreview}
            onSiteNameChange={setSiteName}
            onStatusChange={setStatus}
            onLogoChange={setLogo}
            onLogoPreviewChange={setLogoPreview}
          />
        </form>
      </div>
    </AdminLayout>
  )
}