"use client"

import dynamic from "@/lib/dynamic"
import BookOpen from "lucide-react/dist/esm/icons/book-open.js"

import { ContentListPage } from "@/components/admin/layout/content/ContentListPage"
import {
  deletePostAction,
  deletePostsAction,
  duplicatePostAction,
  getSitePostsWithCategoriesAction,
  type Post,
} from "@/lib/actions/posts/post-actions"

const CreatePostModal = dynamic(
  () => import("@/components/admin/post-builder/layout/CreatePostModal").then((m) => ({ default: m.CreatePostModal })),
  { ssr: false }
)

const PostSettingsModal = dynamic(
  () =>
    import("@/components/admin/post-builder/layout/PostSettingsModal").then((m) => ({
      default: m.PostSettingsModal,
    })),
  { ssr: false }
)

export default function PostsPage() {
  return (
    <ContentListPage<Post>
      builderPath="/admin/posts/builder"
      createButtonLabel="Create Post"
      destructiveAction="delete-post"
      deleteItem={((a0) => deletePostAction({ data: { postId: a0 } }))}
      deleteItems={((a0) => deletePostsAction({ data: { postIds: a0 } }))}
      duplicateItem={((a0, a1) => duplicatePostAction({ data: { postId: a0, newTitle: a1 } }))}
      duplicateTitle={(post) => `${post.title || "Post"} Copy`}
      emptyButtonLabel="Create Your First Post"
      emptyTitle={(posts, filterStatus) =>
        posts.length === 0 || filterStatus === "all" ? "No posts found" : `No ${filterStatus} posts found`
      }
      getItems={((a0, a1) => getSitePostsWithCategoriesAction({ data: { siteId: a0, options: a1 } }))}
      getSearchText={(post, categories) =>
        `${post.title} ${post.slug} ${post.excerpt ?? ""} ${post.meta_description ?? ""} ${categories
          .map((category) => category.title)
          .join(" ")}`
      }
      icon={BookOpen}
      itemLabel="Post"
      itemLabelPlural="Posts"
      listLabel="Posts"
      pathPrefix="posts"
      previewPublishedOnly
      renderCreateModal={({ onCancel, onSuccess }) => (
        <CreatePostModal onSuccess={onSuccess} onCancel={onCancel} />
      )}
      renderSettingsModal={({ item, onOpenChange, onSuccess, open }) => (
        <PostSettingsModal
          open={open}
          onOpenChange={onOpenChange}
          post={item}
          site={null}
          onSuccess={onSuccess}
        />
      )}
      searchPlaceholder="Search posts"
    />
  )
}
