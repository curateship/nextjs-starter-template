import { DirectoryBlockRenderer } from "@/components/frontend/directories/DirectoryBlockRenderer"
import { getSiteFromHeaders } from "@/lib/utils/site-resolver"
import { db } from "@/lib/db"
import { directories } from "@/lib/db/schema"
import { eq, and } from "drizzle-orm"
import { convertContentBlocksToArray } from '@/lib/utils/block-utils'
import { toSnakeCase } from "@/lib/db/to-snake-case"
import { notFound } from "next/navigation"

interface DirectoryPageProps {
  params: Promise<{
    slug: string
  }>
}

export default async function DirectoryPage({ params }: DirectoryPageProps) {
  const { slug } = await params

  // Get site data from headers
  const { success: siteSuccess, site } = await getSiteFromHeaders()

  if (!siteSuccess || !site) {
    notFound()
  }

  // Direct query to directory table
  const [directory] = await db
    .select()
    .from(directories)
    .where(
      and(
        eq(directories.siteId, site.id),
        eq(directories.slug, slug),
        eq(directories.isPublished, true)
      )
    )
    .limit(1)

  if (!directory) {
    notFound()
  }

  // Convert directory blocks to array format
  let blocks: any[] = []
  try {
    blocks = convertContentBlocksToArray((directory.contentBlocks as any) || {}, directory.id)
  } catch (error) {
    console.warn('Error loading directory blocks:', error)
    blocks = []
  }

  const directoryWithBlocks = {
    ...toSnakeCase(directory),
    blocks
  } as any

  return <DirectoryBlockRenderer
    site={site}
    directory={directoryWithBlocks}
  />
}

export async function generateMetadata({ params }: DirectoryPageProps) {
  const { slug } = await params

  try {
    // Get site data from headers
    const { success: siteSuccess, site } = await getSiteFromHeaders()

    if (!siteSuccess || !site) {
      return {
        title: 'Directory Not Found',
        description: 'The requested directory could not be found.',
      }
    }

    // Direct query to directory table
    const [directory] = await db
      .select()
      .from(directories)
      .where(
        and(
          eq(directories.siteId, site.id),
          eq(directories.slug, slug),
          eq(directories.isPublished, true)
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
      description: directory.metaDescription || directory.description || `${directory.title} on ${site.name}`,
    }
  } catch (error) {
    return {
      title: 'Directory Not Found',
      description: 'The requested directory could not be found.',
    }
  }
}
