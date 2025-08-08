"use client"

import { useState } from "react"
import { AdminLayout, AdminPageHeader } from "@/components/admin/layout/admin-layout"
import { PostBlock } from "@/components/admin/modules/posts/PostBlock"

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
      <div className="w-full max-w-6xl mx-auto">
        <AdminPageHeader
          title="Add New Post"
          subtitle="Create a new blog post or article"
          primaryAction={{
            label: "Save Post",
            onClick: handleSaveClick
          }}
          secondaryAction={{
            label: "Cancel",
            href: "/admin/posts",
            variant: "outline"
          }}
        />

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