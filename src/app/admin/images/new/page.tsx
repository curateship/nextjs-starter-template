"use client"

import { useState } from "react"
import { AdminLayout, AdminPageHeader } from "@/components/admin/layout/admin-layout"
import { ImageBlock } from "@/components/admin/modules/images/ImageBlock"

export default function NewImagePage() {
  const [title, setTitle] = useState("")
  const [image, setImage] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    // Handle form submission
    console.log({ title, image })
  }

  const handleSaveClick = () => {
    // Handle save button click
    console.log({ title, image })
  }

  return (
    <AdminLayout>
      <div className="w-full max-w-6xl mx-auto">
        <AdminPageHeader
          title="Add Image"
          subtitle="Upload a new image to the library"
          primaryAction={{
            label: "Save Image",
            onClick: handleSaveClick
          }}
          secondaryAction={{
            label: "Cancel",
            href: "/admin/images"
          }}
        />

        <form onSubmit={handleSubmit}>
          <ImageBlock
            title={title}
            image={image}
            imagePreview={imagePreview}
            onTitleChange={setTitle}
            onImageChange={setImage}
            onImagePreviewChange={setImagePreview}
          />
        </form>
      </div>
    </AdminLayout>
  )
}