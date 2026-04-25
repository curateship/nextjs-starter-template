import { PostBlockRenderer } from "@/components/frontend/posts/PostBlockRenderer"
import { getSiteFromHeaders } from "@/lib/utils/site-resolver"
import { db } from "@/lib/db"
import { posts } from "@/lib/db/schema"
import { eq, and } from "drizzle-orm"
import { notFound } from "next/navigation"
import { getRelatedPostsData } from "@/lib/actions/posts/related-posts-actions"
import { toSnakeCase } from "@/lib/db/to-snake-case"
import { buildSeoMetadata } from "@/lib/utils/seo-helpers"
import { StructuredData } from "@/components/frontend/seo/StructuredData"
import { getContentBreadcrumbItems, shouldShowFrontendBreadcrumbs } from "@/lib/actions/categories/frontend-breadcrumb-actions"

interface PostPageProps {
  params: Promise<{
    slug: string
  }>
}

export default async function PostPage({ params }: PostPageProps) {
  const { slug } = await params

  const { success: siteSuccess, site } = await getSiteFromHeaders()

  if (!siteSuccess || !site) {
    notFound()
  }

  const [post] = await db
    .select()
    .from(posts)
    .where(
      and(
        eq(posts.siteId, site.id),
        eq(posts.slug, slug),
        eq(posts.isPublished, true)
      )
    )
    .limit(1)

  if (!post) {
    notFound()
  }

  let blocks: any[] = []
  let showFeaturedImage = true
  try {
    const contentBlocks = (post.contentBlocks as any) || {}
    showFeaturedImage = contentBlocks.show_featured_image !== false
    const blockValues = Object.values(contentBlocks).filter((block: any) =>
      block && typeof block === 'object' && block.type
    )
    blocks = blockValues.sort((a: any, b: any) =>
      (a.display_order || 0) - (b.display_order || 0)
    )
  } catch (error) {
    console.warn('Error loading post blocks:', error)
    blocks = []
  }

  const postWithBlocks = {
    ...toSnakeCase(post),
    blocks,
    show_featured_image: showFeaturedImage
  } as any

  let preloadedRelatedPosts = null
  const relatedPostsBlock = blocks.find((b: any) => b.type === 'related-posts')
  if (relatedPostsBlock) {
    const rpContent = relatedPostsBlock.content || {}
    const result = await getRelatedPostsData({
      siteId: site.id,
      excludePostId: post.id,
      sortBy: rpContent.sortBy || 'date',
      sortOrder: rpContent.sortOrder || 'desc',
      limit: rpContent.itemsToShow || 3,
    })
    if (result.success && result.data) {
      preloadedRelatedPosts = result.data
    }
  }
  const breadcrumbs = shouldShowFrontendBreadcrumbs(site.settings, 'posts')
    ? await getContentBreadcrumbItems({
      siteId: site.id,
      contentId: post.id,
      contentType: 'post',
      currentLabel: post.title,
    })
    : []

  return (
    <>
      <StructuredData site={site} content={postWithBlocks} contentType="post" />
      <PostBlockRenderer
        site={site}
        post={postWithBlocks}
        preloadedRelatedPosts={preloadedRelatedPosts}
        breadcrumbs={breadcrumbs}
      />
    </>
  )
}

export async function generateMetadata({ params }: PostPageProps) {
  const { slug } = await params

  try {
    const { success: siteSuccess, site } = await getSiteFromHeaders()

    if (!siteSuccess || !site) {
      return {
        title: 'Post Not Found',
        description: 'The requested post could not be found.',
      }
    }

    const [post] = await db
      .select()
      .from(posts)
      .where(
        and(
          eq(posts.siteId, site.id),
          eq(posts.slug, slug),
          eq(posts.isPublished, true)
        )
      )
      .limit(1)

    if (!post) {
      return {
        title: 'Post Not Found',
        description: 'The requested post could not be found.',
      }
    }

    return {
      title: `${post.title} | ${site.name}`,
      description: post.metaDescription || post.excerpt || `Read ${post.title} on ${site.name}`,
      ...buildSeoMetadata(site, post as any, 'post', `/posts/${slug}`),
    }
  } catch (error) {
    return {
      title: 'Post Not Found',
      description: 'The requested post could not be found.',
    }
  }
}
