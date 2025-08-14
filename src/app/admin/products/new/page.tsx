"use client"

import { useState } from "react"
import { AdminLayout, AdminPageHeader, BasicBlock } from "@/components/admin/layout/admin-layout"
import { Button } from "@/components/ui/button"

export default function NewProductPage() {
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [status, setStatus] = useState("draft")
  const [featured, setFeatured] = useState(false)
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
    <AdminLayout>
      <div className="w-full max-w-6xl mx-auto">
        <AdminPageHeader
          title="Create Product"
          subtitle="Add a new product to your catalog"
          primaryAction={{
            label: "Save Product",
            onClick: handleSaveClick
          }}
          secondaryAction={{
            label: "Cancel",
            href: "/admin/products"
          }}
        />

        <form onSubmit={handleSubmit}>
          <div className="space-y-6">
            <BasicBlock
              title={title}
              description={description}
              status={status}
              featured={featured}
              image={image}
              imagePreview={imagePreview}
              onTitleChange={setTitle}
              onDescriptionChange={setDescription}
              onStatusChange={setStatus}
              onFeaturedChange={setFeatured}
              onImageChange={setImage}
              onImagePreviewChange={setImagePreview}
            />
          </div>
        </form>
      </div>
    </AdminLayout>
  )
} 