"use client"

import { useState } from "react"
import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { Button } from "@/components/ui/button"
import { BasicBlock } from "@/components/admin/content-type/product/BasicBlock"
import { ArrowLeft } from "lucide-react"

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
    console.log({ title, description, status, featured, image })
  }

  return (
    <AdminLayout>
      <div className="w-full max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-4">
            <Button variant="ghost" size="sm" className="p-2">
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold">Create Product</h1>
              <p className="text-muted-foreground mt-1">
                Add a new product to your catalog
              </p>
            </div>
          </div>
          <div className="flex space-x-2">
            <Button variant="outline">Cancel</Button>
            <Button onClick={handleSubmit}>Save Product</Button>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
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
        </form>
      </div>
    </AdminLayout>
  )
} 