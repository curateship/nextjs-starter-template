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
import { shouldShowFrontendBreadcrumbs } from "@/lib/actions/categories/frontend-breadcrumb-actions"
import type { FrontendBreadcrumbItem } from "@/lib/actions/categories/frontend-breadcrumb-actions"
import { DIRECTORY_GOOGLE_MAP_BLOCK_TYPE } from "@/lib/actions/directories/directory-google-map"
import { safeDecrypt } from "@/lib/utils/encryption"

interface DirectoryPageProps {
  params: Promise<{
    slug: string
  }>
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
        with recursive directory_row as (
          select
            d.id,
            d.site_id as "siteId",
            d.title,
            d.slug,
            d.meta_description as "metaDescription",
            d.status,
            d.display_order as "displayOrder",
            d.content_blocks as "contentBlocks",
            d.directory_data as "directoryData",
            d.featured_image as "featuredImage",
            d.source_type as "sourceType",
            d.source_id as "sourceId",
            d.created_at as "createdAt",
            d.updated_at as "updatedAt"
          from directory d
          where d.site_id = ${siteId}
            and d.slug = ${slug}
            and d.status = 'published'
          limit 1
        ),
        template_ids as (
          select distinct block.value #>> '{content,templateId}' as id
          from directory_row d
          cross join lateral jsonb_each(coalesce(d."contentBlocks", '{}'::jsonb)) as block(key, value)
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
        ),
        primary_category as (
          select c.id
          from directory_row d
          inner join category_relationships cr
            on cr.content_id = d.id
            and cr.content_type = 'directory'
            and cr.is_primary = true
          inner join categories c on c.id = cr.category_id
          where c.site_id = ${siteId}
            and c.is_published = true
          limit 1
        ),
        category_trail as (
          select c.id, c.title, c.slug, c.parent_id, 0 as depth
          from categories c
          inner join primary_category pc on pc.id = c.id
          where c.site_id = ${siteId}
            and c.is_published = true
          union all
          select parent.id, parent.title, parent.slug, parent.parent_id, category_trail.depth + 1
          from categories parent
          inner join category_trail on parent.id = category_trail.parent_id
          where parent.site_id = ${siteId}
            and parent.is_published = true
            and category_trail.depth < 20
        ),
        breadcrumb_items as (
          select coalesce(jsonb_agg(jsonb_build_object(
            'label', title,
            'href', '/categories/' || slug
          ) order by depth desc), '[]'::jsonb) as data
          from category_trail
        ),
        map_blocks_need_config as (
          select exists (
            select 1
            from directory_row d
            cross join lateral jsonb_each(coalesce(d."contentBlocks", '{}'::jsonb)) as block(key, value)
            where block.value->>'type' = ${DIRECTORY_GOOGLE_MAP_BLOCK_TYPE}
              and coalesce(block.value #>> '{content,visibility,hideBlock}', 'false') <> 'true'
              and coalesce(block.value #>> '{content,visibility,map}', 'true') <> 'false'
              and length(trim(coalesce(block.value #>> '{content,locationQuery}', ''))) > 0
          ) as needed
        ),
        google_maps_config as (
          select si.config->>'api_key' as "apiKey"
          from site_integrations si
          where si.site_id = ${siteId}
            and si.integration_type = 'google_maps'
            and (select needed from map_blocks_need_config)
          limit 1
        )
        select
          to_jsonb(directory_row) as directory,
          (select data from custom_templates) as "customBlockTemplates",
          (select data from breadcrumb_items) as breadcrumbs,
          (select "apiKey" from google_maps_config) as "googleMapsApiKey"
        from directory_row
      `)

      const row = rows.rows[0] as any
      if (!row) throw new Error(DIRECTORY_PAGE_NOT_FOUND_ERROR)
      return row
    },
    ['directory-page-data', siteId, slug],
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
  const categoryBreadcrumbs = Array.isArray(pageData.breadcrumbs)
    ? pageData.breadcrumbs as FrontendBreadcrumbItem[]
    : []
  const breadcrumbs = shouldShowFrontendBreadcrumbs(site.settings, 'directories') && categoryBreadcrumbs.length > 0
    ? [...categoryBreadcrumbs, { label: directory.title }]
    : []
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
