"use client"

import { useState } from "react"
import { AdminLayout, AdminPageHeader } from "@/components/admin/layout/admin-layout"
import { ImageBlock } from "@/components/admin/modules/images/ImageBlock"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

export default function NewImagePage() {
  const router = useRouter()
  const [altText, setAltText] = useState("")
  const [image, setImage] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!image) {
      toast.error("Please select an image to upload")
      return
    }
    await handleUpload()
  }

  const handleUpload = async () => {
    if (!image) {
      toast.error("Please select an image to upload")
      return
    }

    setIsUploading(true)
    
    try {
      const formData = new FormData()
      formData.append('file', image)
      if (altText.trim()) {
        formData.append('altText', altText.trim())
      }

      const response = await fetch('/api/images/upload', {
        method: 'POST',
        body: formData
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Upload failed')
      }

      toast.success("Image uploaded successfully!")
      router.push('/admin/images')

    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Upload failed')
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <AdminLayout>
      <div className="w-full max-w-6xl mx-auto">
        <AdminPageHeader
          title="Add Image"
          subtitle="Upload a new image to the library"
          primaryAction={{
            label: isUploading ? "Uploading..." : "Save Image",
            onClick: handleUpload,
            disabled: !image || isUploading
          }}
          secondaryAction={{
            label: "Cancel",
            href: "/admin/images"
          }}
        />

        <form onSubmit={handleSubmit}>
          <ImageBlock
            altText={altText}
            image={image}
            imagePreview={imagePreview}
            onAltTextChange={setAltText}
            onImageChange={setImage}
            onImagePreviewChange={setImagePreview}
          />
        </form>
      </div>
    </AdminLayout>
  )
}