"use client"

import { useState } from "react"
import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { DashboardSubheader } from "@/components/admin/layout/dashboard/DashboardSubheader"
import { Button } from "@/components/ui/button"
import { NewsletterBlock } from "@/components/ui/newsletter-block"
import { StickyHeader } from "@/components/admin/layout/dashboard/StickyHeader"

export default function NewNewsletterPage() {
  const [title, setTitle] = useState("")
  const [body, setBody] = useState("")
  const [status, setStatus] = useState("draft")
  const [image, setImage] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)

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
        <DashboardSubheader
          items={[
            { label: "Newsletters", href: "/admin/newsletters" },
            { label: "New" },
          ]}
          actions={
            <div className="flex items-center gap-2">
              <Button variant="outline" asChild>
                <a href="/admin/newsletters">Cancel</a>
              </Button>
              <Button onClick={handleSaveClick}>
                Create Newsletter
              </Button>
            </div>
          }
        />

        <form onSubmit={handleSubmit}>
          <NewsletterBlock
            title={title}
            body={body}
            status={status}
            image={image}
            imagePreview={imagePreview}
            onTitleChange={setTitle}
            onBodyChange={setBody}
            onStatusChange={setStatus}
            onImageChange={setImage}
            onImagePreviewChange={setImagePreview}
          />
        </form>
      </div>
    </AdminLayout>
    </>
  )
}