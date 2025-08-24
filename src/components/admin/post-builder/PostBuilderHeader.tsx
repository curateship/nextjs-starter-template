import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ArrowLeft, Save, Eye, Plus, Settings, CheckCircle } from "lucide-react"
import Link from "next/link"
import { useSiteContext } from "@/contexts/site-context"
import { PostSettingsModal } from "@/components/admin/post-builder/post-settings-modal"
import { CreateGlobalPostForm } from "@/components/admin/post-builder/create-global-post-form"
import type { Post } from "@/lib/actions/post-actions"

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
  const { currentSite } = useSiteContext()
  const currentPost = posts.find(p => p.slug === selectedPost)
  
  // Generate post URL for frontend viewing
  const getPostUrl = () => {
    if (!currentPost || !currentSite?.subdomain) {
      return '#'
    }
    
    // Use clean routing: /posts/[slug]
    const url = `http://localhost:3000/posts/${currentPost.slug}`
    return url
  }
  
  return (
    <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-[57px] z-40">
      <div className="flex h-14 items-center px-6">
        <div className="flex items-center space-x-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/admin/posts">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Posts
            </Link>
          </Button>
          <div className="h-4 w-px bg-border"></div>
          <h1 className="text-lg font-semibold">Post Builder</h1>
          <div className="h-4 w-px bg-border"></div>
          <Select value={selectedPost} onValueChange={onPostChange}>
            <SelectTrigger className="w-[200px]">
              <SelectValue>
                {currentPost ? currentPost.title : ""}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {posts.map((post) => (
                <SelectItem key={post.id} value={post.slug}>
                  {post.title}
                  {!post.is_published && " (Draft)"}
                </SelectItem>
              ))}
              <div className="border-t pt-1 mt-2">
                <div 
                  className="relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none hover:bg-accent hover:text-foreground text-muted-foreground"
                  onClick={() => setShowCreateDialog(true)}
                >
                  <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
                    <Plus className="h-4 w-4" />
                  </span>
                  Create Post
                </div>
              </div>
            </SelectContent>
          </Select>
          <Button 
            variant="outline"
            size="sm" 
            onClick={onPreviewPost}
            disabled={!currentPost}
          >
            <Eye className="w-4 h-4 mr-2" />
            Preview Post
          </Button>
          <Button
            variant="outline"
            size="sm"
            asChild
            disabled={!currentPost || !currentSite?.subdomain}
          >
            <Link href={currentPost ? `/posts/${selectedPost}` : '#'} target="_blank">
              <Eye className="w-4 h-4 mr-2" />
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
          <CreateGlobalPostForm 
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