"use client"

import { useState } from "react"
import { AdminLayout } from "@/components/admin/layout/admin-layout"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from "@/components/admin/layout/dashboard/breadcrumb"
import { BasicBlock } from "@/components/admin/product-builder/blocks/basic/ProductBasicBlock"
import { Button } from "@/components/ui/button"
import { HomeIcon } from "lucide-react"
import Link from "next/link"

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
    <AdminLayout>
      <div className="w-full">
        {/* Breadcrumb navigation + action buttons */}
        <div className="flex items-center justify-between mb-6 mx-4 mt-2">
          <Breadcrumb>
            <BreadcrumbList className="h-8 gap-2 rounded-md border px-3 text-sm">
              <BreadcrumbItem>
                <BreadcrumbLink href="/admin">
                  <HomeIcon className="size-4" />
                  <span className="sr-only">Home</span>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink href="/admin/products">Products</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>New</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          <div className="flex items-center gap-1.5 sm:gap-3">
            <Button variant="outline" asChild>
              <Link href="/admin/products">Cancel</Link>
            </Button>
            <Button onClick={handleSaveClick}>Save Product</Button>
          </div>
        </div>

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
  )
} 