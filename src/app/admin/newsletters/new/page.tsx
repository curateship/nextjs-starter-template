"use client"

import { useState } from "react"
import { AdminLayout, AdminPageHeader } from "@/components/admin/layout/admin-layout"
import { NewsletterBlock } from "@/components/admin/content-type/newsletters/NewsletterBlock"

export default function NewNewsletterPage() {
  const [title, setTitle] = useState("")
  const [body, setBody] = useState("")
  const [status, setStatus] = useState("draft")
  const [image, setImage] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    // Handle form submission
    console.log({ title, body, status, image })
  }

  const handleSaveClick = () => {
    // Handle save button click
    console.log({ title, body, status, image })
  }

  return (
    <AdminLayout>
      <div className="w-full max-w-6xl mx-auto">
        <AdminPageHeader
          title="Create Newsletter"
          subtitle="Create new AI-powered newsletter content"
          primaryAction={{
            label: "Create Newsletter",
            onClick: handleSaveClick
          }}
          secondaryAction={{
            label: "Cancel",
            href: "/admin/newsletters"
          }}
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
  )
}