import { DirectoryBlockRenderer } from "@/components/frontend/directories/DirectoryBlockRenderer"
import { getSiteFromHeaders } from "@/lib/utils/site-resolver"
import { db } from "@/lib/db"
import { directories, directoryCustomBlocks } from "@/lib/db/schema"
import { eq, and, inArray } from "drizzle-orm"
import { convertContentBlocksToArray } from '@/lib/utils/block-utils'
import { toSnakeCase } from "@/lib/db/to-snake-case"
import { notFound } from "next/navigation"
import { buildSeoMetadata } from "@/lib/utils/seo-helpers"
import { StructuredData } from "@/components/frontend/seo/StructuredData"
import type { DirectoryCustomBlockTemplate } from "@/lib/actions/directories/directory-custom-blocks/types"
import {
  getContentBreadcrumbItems,
  getContentCategoryContext,
  shouldShowFrontendBreadcrumbs,
} from "@/lib/actions/categories/frontend-breadcrumb-actions"
import { DIRECTORY_CORE_BLOCK_TYPE } from "@/lib/actions/directories/directory-core"

interface DirectoryPageProps {
  params: Promise<{
    slug: string
  }>
}

function directoryBlocksNeedCategoryContext(blocks: any[]) {
  return blocks.some((block) => {
    if (block.type !== DIRECTORY_CORE_BLOCK_TYPE) return false

    const visibility = block.content?.visibility && typeof block.content.visibility === "object"
      ? block.content.visibility as Record<string, boolean>
      : {}
    const introText = typeof block.content?.introText === "string" ? block.content.introText : ""

    return visibility.hideBlock !== true &&
      visibility.introText !== false &&
      /\{\{\s*(parent-category|child-category)\s*\}\}/.test(introText)
  })
}

export default async function DirectoryPage({ params }: DirectoryPageProps) {
  const { slug } = await params

  const { success: siteSuccess, site } = await getSiteFromHeaders()

  if (!siteSuccess || !site) {
    notFound()
  }

  const [directory] = await db
    .select()
    .from(directories)
    .where(
      and(
        eq(directories.siteId, site.id),
        eq(directories.slug, slug),
        eq(directories.status, 'published')
      )
    )
    .limit(1)

  if (!directory) {
    notFound()
  }

  let blocks: any[] = []
  try {
    blocks = convertContentBlocksToArray((directory.contentBlocks as any) || {}, directory.id)
  } catch (error) {
    console.warn('Error loading directory blocks:', error)
    blocks = []
  }

  const needsCategoryContext = directoryBlocksNeedCategoryContext(blocks)
  const [breadcrumbs, categoryContext] = await Promise.all([
    shouldShowFrontendBreadcrumbs(site.settings, 'directories')
      ? getContentBreadcrumbItems({
        siteId: site.id,
        contentId: directory.id,
        contentType: 'directory',
        currentLabel: directory.title,
      })
      : Promise.resolve([]),
    needsCategoryContext
      ? getContentCategoryContext({
        siteId: site.id,
        contentId: directory.id,
        contentType: 'directory',
      })
      : Promise.resolve({}),
  ])

  const directoryWithBlocks = {
    ...toSnakeCase(directory),
    category_context: categoryContext,
    blocks
  } as any

  const templateIds = Array.from(new Set(
    blocks
      .map(block => block.type === 'directory-custom' ? block.content?.templateId : null)
      .filter((value): value is string => typeof value === 'string' && value.length > 0)
  ))

  let customBlockTemplates: Record<string, DirectoryCustomBlockTemplate> = {}

  if (templateIds.length > 0) {
    const templateRows = await db
      .select()
      .from(directoryCustomBlocks)
      .where(and(eq(directoryCustomBlocks.siteId, site.id), inArray(directoryCustomBlocks.id, templateIds)))

    customBlockTemplates = Object.fromEntries(
      templateRows.map(row => [
        row.id,
        {
          id: row.id,
          site_id: row.siteId,
          name: row.name,
          slug: row.slug,
          layout: row.layout as DirectoryCustomBlockTemplate['layout'],
          fields: Array.isArray(row.fields) ? row.fields : [],
          created_at: row.createdAt?.toISOString() ?? '',
          updated_at: row.updatedAt?.toISOString() ?? '',
        },
      ])
    )
  }

  return (
    <>
      <StructuredData site={site} content={directoryWithBlocks} contentType="directory" />
      <DirectoryBlockRenderer
        site={site}
        directory={directoryWithBlocks}
        customBlockTemplates={customBlockTemplates}
        breadcrumbs={breadcrumbs}
      />
    </>
  )
}

export async function generateMetadata({ params }: DirectoryPageProps) {
  const { slug } = await params

  try {
    const { success: siteSuccess, site } = await getSiteFromHeaders()

    if (!siteSuccess || !site) {
      return {
        title: 'Directory Not Found',
        description: 'The requested directory could not be found.',
      }
    }

    const [directory] = await db
      .select()
      .from(directories)
      .where(
        and(
          eq(directories.siteId, site.id),
          eq(directories.slug, slug),
          eq(directories.status, 'published')
        )
      )
      .limit(1)

    if (!directory) {
      return {
        title: 'Directory Not Found',
        description: 'The requested directory could not be found.',
      }
    }

    return {
      title: `${directory.title} | ${site.name}`,
      description: directory.metaDescription || `${directory.title} on ${site.name}`,
      ...buildSeoMetadata(site, directory as any, 'directory', `/directories/${slug}`),
    }
  } catch (error) {
    return {
      title: 'Directory Not Found',
      description: 'The requested directory could not be found.',
    }
  }
}
