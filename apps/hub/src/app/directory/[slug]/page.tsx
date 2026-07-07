import { DirectoryBlockRenderer } from "@/components/frontend/directories/DirectoryBlockRenderer"
import { getSiteFromHeaders } from "@/lib/utils/site-resolver"
import { db } from "@/lib/db"
import { sql } from "drizzle-orm"
import { unstable_cache } from "next/cache"
import { convertContentBlocksToArray } from '@/lib/utils/block-utils'
import { toSnakeCase } from "@/lib/db/to-snake-case"
import { notFound } from "next/navigation"
import { buildSeoMetadata } from "@/lib/utils/seo-helpers"
import { StructuredData } from "@/components/frontend/seo/StructuredData"
import type { DirectoryCustomBlockTemplate } from "@/lib/actions/directories/directory-custom-blocks/types"
import {
  getContentBreadcrumbItems,
  shouldShowFrontendBreadcrumbs,
} from "@/lib/actions/categories/frontend-breadcrumb-actions"
import { DIRECTORY_GOOGLE_MAP_BLOCK_TYPE } from "@/lib/actions/directories/directory-google-map"
import { safeDecrypt } from "@/lib/utils/encryption"
import {
  getDirectoryTemplateDefaultCategoryParentId,
  mergeDirectoryTemplateBlocks,
} from "@/lib/actions/directories/directory-template-inheritance"
import { getDirectoryRelatedListingsAction } from "@/lib/actions/directories/directory-related-listing-actions"
import { getDirectoryFeaturedUntil } from "@/lib/actions/directories/directory-featured-activation"
import { isDirectoryFeaturedNow } from "@/lib/actions/directories/directory-featured-helpers"

interface DirectoryPageProps {
  params: Promise<{
    slug: string
  }>
}

// Prefetch related-listing items server-side so the block ships with data in
// the initial HTML instead of client-fetching after hydration (pages pattern).
// The action normalizes limit the same way the block does.
async function prefetchRelatedListingData(
  blocks: Array<{ id: string; type: string; content: Record<string, any> }>,
  siteId: string,
  directoryId: string
) {
  const relatedListingData: Record<string, any> = {}

  for (const block of blocks) {
    if (block.type !== 'directory-related-listing') continue

    const parentCategoryId = typeof block.content?.parentCategoryId === 'string'
      ? block.content.parentCategoryId.trim()
      : ''
    if (!parentCategoryId) continue

    try {
      const result = await getDirectoryRelatedListingsAction({
        siteId,
        directoryId,
        parentCategoryId,
        limit: Number(block.content?.itemsToShow),
      })

      if (result.success) {
        relatedListingData[block.id] = result.data
      }
    } catch {
      // Silently continue — the block falls back to client-side loading
    }
  }

  return relatedListingData
}

const DIRECTORY_PAGE_NOT_FOUND_ERROR = 'DIRECTORY_PAGE_NOT_FOUND'

function isValidDirectorySlug(slug: string) {
  return /^[a-zA-Z0-9_-]{1,100}$/.test(slug)
}

function isDirectoryPageNotFoundError(error: unknown) {
  return error instanceof Error && error.message === DIRECTORY_PAGE_NOT_FOUND_ERROR
}

function directoryBlocksNeedGoogleMapsConfig(blocks: any[]) {
  return blocks.some((block) => {
    if (block.type !== DIRECTORY_GOOGLE_MAP_BLOCK_TYPE) return false

    const visibility = block.content?.visibility && typeof block.content.visibility === "object"
      ? block.content.visibility as Record<string, boolean>
      : {}
    const locationQuery = typeof block.content?.locationQuery === "string" ? block.content.locationQuery.trim() : ""

    return visibility.hideBlock !== true && visibility.map !== false && locationQuery.length > 0
  })
}

function getCachedDirectoryPageData(siteId: string, slug: string) {
  return unstable_cache(
    async () => {
      const rows = await db.execute(sql`
        with directory_row as (
          select
            d.id,
            d.site_id as "siteId",
            d.title,
            d.slug,
            d.meta_description as "metaDescription",
            d.status,
            d.display_order as "displayOrder",
            d.template_id as "templateId",
            d.content_blocks as "valueBlocks",
            dt.content_blocks as "templateContentBlocks",
            d.featured_image as "featuredImage",
            d.source_type as "sourceType",
            d.source_id as "sourceId",
            d.created_at as "createdAt",
            d.updated_at as "updatedAt"
          from directory d
          inner join directory_templates dt
            on dt.id = d.template_id
            and dt.site_id = d.site_id
          where d.site_id = ${siteId}
            and d.slug = ${slug}
            and d.status = 'published'
          limit 1
        ),
        template_ids as (
          select distinct block.value #>> '{content,templateId}' as id
          from directory_row d
          cross join lateral jsonb_each(coalesce(d."templateContentBlocks", '{}'::jsonb)) as block(key, value)
          where block.value->>'type' = 'directory-custom'
            and coalesce(block.value #>> '{content,templateId}', '') <> ''
        ),
        custom_templates as (
          select coalesce(jsonb_agg(jsonb_build_object(
            'id', dcb.id,
            'site_id', dcb.site_id,
            'name', dcb.name,
            'slug', dcb.slug,
            'layout', dcb.layout,
            'fields', dcb.fields,
            'created_at', dcb.created_at,
            'updated_at', dcb.updated_at
          )), '[]'::jsonb) as data
          from directory_custom_blocks dcb
          inner join template_ids ti on ti.id = dcb.id::text
          where dcb.site_id = ${siteId}
        )
        select
          to_jsonb(directory_row) as directory,
          (select data from custom_templates) as "customBlockTemplates"
        from directory_row
      `)

      const row = rows.rows[0] as any
      if (!row) throw new Error(DIRECTORY_PAGE_NOT_FOUND_ERROR)

      row.directory.contentBlocks = mergeDirectoryTemplateBlocks(
        row.directory.templateContentBlocks || {},
        row.directory.valueBlocks || {}
      )
      delete row.directory.templateContentBlocks
      delete row.directory.valueBlocks

      const blocks = convertContentBlocksToArray((row.directory.contentBlocks as any) || {}, row.directory.id)
      if (directoryBlocksNeedGoogleMapsConfig(blocks)) {
        const configRows = await db.execute(sql`
          select si.config->>'api_key' as "apiKey"
          from site_integrations si
          where si.site_id = ${siteId}
            and si.integration_type = 'google_maps'
          limit 1
        `)

        row.googleMapsApiKey = (configRows.rows[0] as any)?.apiKey || ''
      }

      return row
    },
    ['directory-page-data-v2', siteId, slug],
    {
      revalidate: false,
      tags: ['directory', 'categories', 'content-categories', `site-${siteId}`, 'all'],
    }
  )()
}

export default async function DirectoryPage({ params }: DirectoryPageProps) {
  const { slug } = await params

  if (!isValidDirectorySlug(slug)) {
    notFound()
  }

  const { success: siteSuccess, site } = await getSiteFromHeaders()

  if (!siteSuccess || !site) {
    notFound()
  }

  let pageData: any
  try {
    pageData = await getCachedDirectoryPageData(site.id, slug)
  } catch (error) {
    if (isDirectoryPageNotFoundError(error)) notFound()
    throw error
  }
  const directory = pageData.directory

  let blocks: any[] = []
  try {
    blocks = convertContentBlocksToArray((directory.contentBlocks as any) || {}, directory.id)
  } catch (error) {
    console.warn('Error loading directory blocks:', error)
    blocks = []
  }

  const needsGoogleMapsConfig = directoryBlocksNeedGoogleMapsConfig(blocks)
  // Related-listing data, breadcrumbs, and featured state are independent — fetch in parallel
  const [relatedListingData, breadcrumbs, featuredUntil] = await Promise.all([
    prefetchRelatedListingData(blocks, site.id, directory.id),
    shouldShowFrontendBreadcrumbs(site.settings, 'directories')
      ? getContentBreadcrumbItems({
          siteId: site.id,
          contentId: directory.id,
          contentType: 'directory',
          currentLabel: directory.title,
          rootCategoryId: getDirectoryTemplateDefaultCategoryParentId(directory.contentBlocks || {}),
        })
      : Promise.resolve([]),
    getDirectoryFeaturedUntil(site.id, directory.id),
  ])
  const googleMapsApiKey = needsGoogleMapsConfig && pageData.googleMapsApiKey
    ? safeDecrypt(pageData.googleMapsApiKey)
    : ''

  const directoryWithBlocks = {
    ...toSnakeCase(directory),
    blocks
  } as any

  const customBlockTemplates = Object.fromEntries(
    (Array.isArray(pageData.customBlockTemplates) ? pageData.customBlockTemplates : []).map((row: DirectoryCustomBlockTemplate) => [row.id, row])
  )

  return (
    <>
      <StructuredData site={site} content={directoryWithBlocks} contentType="directory" />
      <DirectoryBlockRenderer
        site={site}
        directory={directoryWithBlocks}
        customBlockTemplates={customBlockTemplates}
        breadcrumbs={breadcrumbs}
        googleMapsEmbedApiKey={googleMapsApiKey}
        relatedListingData={relatedListingData}
        isFeatured={isDirectoryFeaturedNow(featuredUntil)}
      />
    </>
  )
}

export async function generateMetadata({ params }: DirectoryPageProps) {
  const { slug } = await params

  if (!isValidDirectorySlug(slug)) {
    return {
      title: 'Listing Not Found',
      description: 'The requested listing could not be found.',
    }
  }

  try {
    const { success: siteSuccess, site } = await getSiteFromHeaders()

    if (!siteSuccess || !site) {
      return {
        title: 'Listing Not Found',
        description: 'The requested listing could not be found.',
      }
    }

    const pageData = await getCachedDirectoryPageData(site.id, slug)
    const directory = pageData.directory

    return {
      title: `${directory.title} | ${site.name}`,
      description: directory.metaDescription || `${directory.title} on ${site.name}`,
      ...buildSeoMetadata(site, directory as any, 'directory', `/directory/${slug}`),
    }
  } catch (error) {
    return {
      title: 'Listing Not Found',
      description: 'The requested listing could not be found.',
    }
  }
}
