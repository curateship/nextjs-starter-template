import { PostBlockRenderer } from "@/components/frontend/posts/PostBlockRenderer"
import { getSiteFromHeaders } from "@/lib/utils/site-resolver"
import { db } from "@/lib/db"
import { sql } from "drizzle-orm"
import { unstable_cache } from "@/lib/cache"
import { notFound } from "@/lib/navigation-server"
import { getRelatedPostsDataImpl } from "@/lib/actions/posts/related-posts-actions.server"
import { mergePostTemplateBlocks } from "@/lib/actions/posts/post-template-inheritance"
import { toSnakeCase } from "@/lib/db/to-snake-case"
import { buildSeoMetadata } from "@/lib/utils/seo-helpers"
import { StructuredData } from "@/components/frontend/seo/StructuredData"
import {
  getContentBreadcrumbItems,
  shouldShowFrontendBreadcrumbs,
} from "@/lib/actions/categories/frontend-breadcrumb-actions"
import { getActiveSponsorsByIdsActionImpl } from "@/lib/actions/sponsors/sponsor-actions.server"
import { extractSponsorIdsFromHtml } from "@/lib/utils/sponsor-embeds"
import { convertContentBlocksToArray } from "@/lib/utils/block-utils"

interface PostPageProps {
  params: Promise<{
    slug: string
  }>
}

const POST_PAGE_NOT_FOUND_ERROR = 'POST_PAGE_NOT_FOUND'

function isValidPostSlug(slug: string) {
  return /^[a-zA-Z0-9_-]{1,100}$/.test(slug)
}

function isPostPageNotFoundError(error: unknown) {
  return error instanceof Error && error.message === POST_PAGE_NOT_FOUND_ERROR
}

function getCachedPostPageData(siteId: string, slug: string) {
  return unstable_cache(
    async () => {
      const rows = await db.execute(sql`
        with post_row as (
          select
            p.id,
            p.site_id as "siteId",
            p.template_id as "templateId",
            p.title,
            p.slug,
            p.meta_description as "metaDescription",
            p.meta_keywords as "metaKeywords",
            p.featured_image as "featuredImage",
            p.excerpt,
            p.content,
            p.content_blocks as "contentBlocks",
            p.is_published as "isPublished",
            p.display_order as "displayOrder",
            p.created_at as "createdAt",
            p.updated_at as "updatedAt"
          from posts p
          where p.site_id = ${siteId}
            and p.slug = ${slug}
            and p.is_published = true
          limit 1
        ),
        author_row as (
          select
            u.name,
            u."displayName" as "displayName",
            u.image
          from post_row p
          inner join sites s on s.id = p."siteId"
          inner join users u on u.id = s.user_id
          limit 1
        )
        select
          to_jsonb(post_row) as post,
          to_jsonb(author_row) as author,
          pt.content_blocks as "templateContentBlocks"
        from post_row
        left join author_row on true
        inner join post_templates pt
          on pt.id = post_row."templateId"
          and pt.site_id = post_row."siteId"
      `)

      const row = rows.rows[0] as any
      if (!row) throw new Error(POST_PAGE_NOT_FOUND_ERROR)
      return row
    },
    ['post-page-data-v2', siteId, slug],
    {
      revalidate: false,
      tags: ['posts', 'categories', 'content-categories', `site-${siteId}`, 'all'],
    }
  )()
}

export default async function PostPage({ params }: PostPageProps) {
  const { slug } = await params

  if (!isValidPostSlug(slug)) {
    notFound()
  }

  const { success: siteSuccess, site } = await getSiteFromHeaders()

  if (!siteSuccess || !site) {
    notFound()
  }

  let pageData: any
  try {
    pageData = await getCachedPostPageData(site.id, slug)
  } catch (error) {
    if (isPostPageNotFoundError(error)) notFound()
    throw error
  }
  const post = pageData.post

  const author = pageData?.author

  let blocks: any[] = []
  let showFeaturedImage = true
  let showExcerpt = true
  try {
    const contentBlocks = mergePostTemplateBlocks(
      (pageData.templateContentBlocks as any) || {},
      (post.contentBlocks as any) || {}
    )
    showFeaturedImage = contentBlocks.show_featured_image !== false
    showExcerpt = contentBlocks.show_excerpt !== false
    blocks = convertContentBlocksToArray(contentBlocks, post.id)
  } catch (error) {
    console.warn('Error loading post blocks:', error)
    blocks = []
  }

  const postWithBlocks = {
    ...toSnakeCase(post),
    author: author
      ? {
        name: author.displayName || author.name,
        image: author.image,
      }
      : null,
    blocks,
    show_featured_image: showFeaturedImage,
    show_excerpt: showExcerpt
  } as any

  let preloadedRelatedPosts = null
  const relatedPostsBlock = blocks.find((b: any) => b.type === 'related-posts')
  if (relatedPostsBlock) {
    const rpContent = relatedPostsBlock.content || {}
    const result = await getRelatedPostsDataImpl({
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
  const sponsorIds = blocks.flatMap((block: any) =>
    block?.type === 'core' ? extractSponsorIdsFromHtml(block.content?.body || block.content?.text || '') : []
  )
  const sponsorsById = await getActiveSponsorsByIdsActionImpl(site.id, sponsorIds)

  return (
    <>
      <StructuredData site={site} content={postWithBlocks} contentType="post" />
      <PostBlockRenderer
        site={site}
        post={postWithBlocks}
        preloadedRelatedPosts={preloadedRelatedPosts}
        breadcrumbs={breadcrumbs}
        sponsorsById={sponsorsById}
      />
    </>
  )
}

export async function generateMetadata({ params }: PostPageProps) {
  const { slug } = await params

  if (!isValidPostSlug(slug)) {
    return {
      title: 'Post Not Found',
      description: 'The requested post could not be found.',
    }
  }

  try {
    const { success: siteSuccess, site } = await getSiteFromHeaders()

    if (!siteSuccess || !site) {
      return {
        title: 'Post Not Found',
        description: 'The requested post could not be found.',
      }
    }

    const pageData = await getCachedPostPageData(site.id, slug)
    const post = pageData.post

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
