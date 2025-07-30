"use client"

import { AdminLayout, AdminPageHeader, AdminCard } from "@/components/admin/layout/admin-layout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import Link from "next/link"

export default function NewPostPage() {
  return (
    <AdminLayout>
      <div className="w-full max-w-6xl mx-auto">
        <AdminPageHeader
          title="Add New Post"
          subtitle="Create a new blog post or article"
          primaryAction={{
            label: "Save Post",
            onClick: () => console.log("Save post")
          }}
          secondaryAction={{
            label: "Cancel",
            href: "/admin/posts",
            variant: "outline"
          }}
        />
        
        <AdminCard>
          <div className="p-6">
            <form className="space-y-6">
              {/* Title */}
              <div className="space-y-2">
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  placeholder="Enter post title..."
                  className="text-lg"
                />
              </div>

              {/* Summary */}
              <div className="space-y-2">
                <Label htmlFor="summary">Summary</Label>
                <textarea
                  id="summary"
                  placeholder="Brief description of the post..."
                  className="w-full min-h-[80px] px-3 py-2 text-sm border border-input bg-background rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                />
              </div>

              {/* Content */}
              <div className="space-y-2">
                <Label htmlFor="content">Content</Label>
                <textarea
                  id="content"
                  placeholder="Write your post content here..."
                  className="w-full min-h-[300px] px-3 py-2 text-sm border border-input bg-background rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                />
              </div>

              {/* SEO & Meta */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">SEO & Meta</h3>
                
                <div className="space-y-2">
                  <Label htmlFor="slug">URL Slug</Label>
                  <Input
                    id="slug"
                    placeholder="url-friendly-slug"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="meta-description">Meta Description</Label>
                  <textarea
                    id="meta-description"
                    placeholder="SEO description for search engines..."
                    className="w-full min-h-[60px] px-3 py-2 text-sm border border-input bg-background rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="tags">Tags</Label>
                  <Input
                    id="tags"
                    placeholder="react, typescript, tutorial (comma separated)"
                  />
                </div>
              </div>

              {/* Publishing Options */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Publishing Options</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="publish-date">Publish Date</Label>
                    <Input
                      id="publish-date"
                      type="datetime-local"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="status">Status</Label>
                    <select
                      id="status"
                      className="w-full px-3 py-2 text-sm border border-input bg-background rounded-md focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                    >
                      <option value="draft">Draft</option>
                      <option value="scheduled">Scheduled</option>
                      <option value="published">Published</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Form Actions */}
              <div className="flex justify-end space-x-2 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => console.log("Save as draft")}
                >
                  Save as Draft
                </Button>
                <Button type="submit">
                  Save Post
                </Button>
              </div>
            </form>
          </div>
        </AdminCard>
      </div>
    </AdminLayout>
  )
}