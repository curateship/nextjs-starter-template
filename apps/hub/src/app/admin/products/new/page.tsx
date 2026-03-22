"use client"

import { useState } from "react"
import { AdminLayout } from "@/components/admin/layout/admin-layout"
import { DashboardSubheader } from "@/components/admin/layout/dashboard/DashboardSubheader"
import { BasicBlock } from "@/components/admin/product-builder/blocks/basic/ProductBasicBlock"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { StickyHeader } from "@/components/admin/layout/dashboard/StickyHeader"

export default function NewProductPage() {
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [richText, setRichText] = useState("")
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
    <>
    <StickyHeader />
    <AdminLayout>
      <div className="w-full">
        {/* Breadcrumb navigation + action buttons */}
        <DashboardSubheader
          items={[
            { label: "Products", href: "/admin/products" },
            { label: "New" },
          ]}
          actions={
            <div className="flex items-center gap-1.5 sm:gap-3">
              <Button variant="outline" asChild>
                <Link href="/admin/products">Cancel</Link>
              </Button>
              <Button onClick={handleSaveClick}>Save Product</Button>
            </div>
          }
        />

        <form onSubmit={handleSubmit}>
          <div className="space-y-6">
            <BasicBlock
              title={title}
              description={description}
              richText={richText}
              status={status}
              featured={featured}
              image={image}
              imagePreview={imagePreview}
              onTitleChange={setTitle}
              onDescriptionChange={setDescription}
              onRichTextChange={setRichText}
              onStatusChange={setStatus}
              onFeaturedChange={setFeatured}
              onImageChange={setImage}
              onImagePreviewChange={setImagePreview}
            />
          </div>
        </form>
      </div>
    </AdminLayout>
    </>
  )
}