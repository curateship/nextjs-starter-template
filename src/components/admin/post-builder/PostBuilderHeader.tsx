import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ArrowLeft, Save, Eye, Plus, Settings, CheckCircle, ChevronDown, ExternalLink } from "lucide-react"
import Link from "next/link"
import { useSiteContext } from "@/contexts/site-context"
import { PostSettingsModal } from "@/components/admin/post-builder/PostSettingsModal"
import { CreatePostModal } from "@/components/admin/post-builder/CreatePostModal"
import type { Post } from "@/lib/actions/posts/post-actions"

interface PostBuilderHeaderProps {
  posts: Post[]
  selectedPost: string
  onPostChange: (post: string) => void
  onPostCreated?: (post: Post) => void
  onPostUpdated?: (post: Post) => void
  saveMessage: string
  isSaving: boolean
  onSave: () => void
  onPreviewPost?: () => void
  postsLoading?: boolean
}

export function PostBuilderHeader({
  posts,
  selectedPost,
  onPostChange,
  onPostCreated,
  onPostUpdated,
  saveMessage,
  isSaving,
  onSave,
  onPreviewPost,
  postsLoading = false
}: PostBuilderHeaderProps) {
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const { currentSite } = useSiteContext()
  const currentPost = posts.find(p => p.slug === selectedPost)

  const handleCreatePost = () => {
    setDropdownOpen(false)
    setTimeout(() => {
      setShowCreateDialog(true)
    }, 100)
  }


  // Generate post URL for frontend viewing
  const getPostUrl = (postSlug?: string) => {
    const slug = postSlug || currentPost?.slug
    if (!slug || !currentSite?.subdomain) {
      return '#'
    }

    // Use dedicated post routing
    const url = `http://localhost:3000/posts/${slug}`
    return url
  }
  
  return (
    <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-[57px] z-40">
      <div className="flex h-14 items-center px-6">
        <div className="flex items-center space-x-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/admin/posts">
              <ArrowLeft className="w-4 h-4" />
            </Link>
          </Button>
          <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-9 px-3 font-semibold text-base hover:bg-transparent">
                {currentPost ? currentPost.title : "Select Post"}
                <ChevronDown className="ml-2 h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-[240px]">
              {posts.map((post) => (
                <DropdownMenuItem
                  key={post.id}
                  onSelect={(e) => e.preventDefault()}
                  className={post.slug === selectedPost ? "bg-accent" : ""}
                >
                  <div className="flex items-center justify-between flex-1">
                    <span
                      onClick={() => {
                        onPostChange(post.slug)
                        setDropdownOpen(false)
                      }}
                      className="flex-1 cursor-pointer"
                    >
                      {post.title}
                      {!post.is_published && " (Draft)"}
                    </span>
                    <Link
                      href={getPostUrl(post.slug)}
                      target="_blank"
                      onClick={(e) => e.stopPropagation()}
                      className="ml-2"
                    >
                      <ExternalLink className="w-3 h-3" />
                    </Link>
                  </div>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleCreatePost}>
                <Plus className="mr-2 h-4 w-4" />
                Create Post
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="outline"
            size="sm"
            asChild
            disabled={!currentPost || !currentSite?.subdomain}
          >
            <Link href={getPostUrl()} target="_blank">
              <ExternalLink className="w-4 h-4 mr-2" />
              View Post
            </Link>
          </Button>
        </div>
        <div className="ml-auto flex items-center space-x-2">
          {saveMessage && (
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-md ${
              saveMessage.includes('Error') || saveMessage.includes('Failed') 
                ? 'bg-red-50 border border-red-200' 
                : 'bg-green-50 border border-green-200'
            }`}>
              <CheckCircle className={`w-4 h-4 ${
                saveMessage.includes('Error') || saveMessage.includes('Failed') 
                  ? 'text-red-600' 
                  : 'text-green-600'
              }`} />
              <span className={`text-sm font-medium ${
                saveMessage.includes('Error') || saveMessage.includes('Failed') 
                  ? 'text-red-800' 
                  : 'text-green-700'
              }`}>
                {saveMessage}
              </span>
            </div>
          )}
          <Button 
            variant="outline"
            size="sm" 
            onClick={() => setShowEditDialog(true)}
            disabled={!currentPost}
          >
            <Settings className="w-4 h-4 mr-2" />
            Edit Settings
          </Button>
          <Button 
            size="sm" 
            onClick={onSave}
            disabled={isSaving}
          >
            <Save className="w-4 h-4 mr-2" />
            {isSaving ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </div>
      
      {/* Create Post Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="w-[840px] max-w-[95vw]" style={{ width: '840px', maxWidth: '95vw' }}>
          <DialogHeader className="mb-4">
            <DialogTitle>Create New Post</DialogTitle>
          </DialogHeader>
          <CreatePostModal 
            onSuccess={(post) => {
              // Add the new post to the list if callback exists
              if (onPostCreated) {
                onPostCreated(post)
              }
              setShowCreateDialog(false)
              // Navigate to the new post's builder page
              onPostChange(post.slug)
            }}
            onCancel={() => setShowCreateDialog(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Edit Post Settings Modal */}
      <PostSettingsModal
        open={showEditDialog}
        onOpenChange={setShowEditDialog}
        post={currentPost || null}
        site={currentSite}
        onSuccess={(updatedPost) => {
          // Update the post in the list
          if (onPostUpdated) {
            onPostUpdated(updatedPost)
          }
        }}
      />
    </div>
  )
}