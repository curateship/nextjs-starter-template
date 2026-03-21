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
import { PostBlock } from "@/components/ui/post-block"
import { Button } from "@/components/ui/button"
import { HomeIcon } from "lucide-react"
import Link from "next/link"

export default function NewPostPage() {
  const [title, setTitle] = useState("")
  const [summary, setSummary] = useState("")
  const [content, setContent] = useState("")
  const [slug, setSlug] = useState("")
  const [metaDescription, setMetaDescription] = useState("")
  const [tags, setTags] = useState("")
  const [publishDate, setPublishDate] = useState("")
  const [status, setStatus] = useState("draft")
  const [featuredImage, setFeaturedImage] = useState<File | null>(null)
  const [featuredImagePreview, setFeaturedImagePreview] = useState<string | null>(null)

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
                <BreadcrumbLink href="/admin/posts">Posts</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>New</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          <div className="flex items-center gap-1.5 sm:gap-3">
            <Button variant="outline" asChild>
              <Link href="/admin/posts">Cancel</Link>
            </Button>
            <Button onClick={handleSaveClick}>Save Post</Button>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <PostBlock
            title={title}
            summary={summary}
            content={content}
            slug={slug}
            metaDescription={metaDescription}
            tags={tags}
            publishDate={publishDate}
            status={status}
            featuredImage={featuredImage}
            featuredImagePreview={featuredImagePreview}
            onTitleChange={setTitle}
            onSummaryChange={setSummary}
            onContentChange={setContent}
            onSlugChange={setSlug}
            onMetaDescriptionChange={setMetaDescription}
            onTagsChange={setTags}
            onPublishDateChange={setPublishDate}
            onStatusChange={setStatus}
            onFeaturedImageChange={setFeaturedImage}
            onFeaturedImagePreviewChange={setFeaturedImagePreview}
          />
        </form>
      </div>
    </AdminLayout>
  )
}