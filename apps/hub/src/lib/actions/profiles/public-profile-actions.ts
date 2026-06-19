import { unstable_cache } from "next/cache"
import { sql } from "drizzle-orm"

import { db } from "@/lib/db"
import {
  PUBLIC_PROFILE_TEMPLATE_SLUG,
  toPublicProfileUsername,
} from "@/lib/utils/public-profile-path"
import { isSupportedAccountPageBlockType } from "@/lib/utils/account-page-block-types"

export interface PublicProfileSocialLink {
  platform: string
  url: string
}

export interface PublicProfileListingItem {
  id: string
  title: string
  slug: string
  featured_image: string | null
  meta_description: string | null
  rating: number | null
  address: string | null
  saved_at: string
}

export interface PublicProfileCollection {
  id: string | null
  name: string
  default_key: string | null
  items: PublicProfileListingItem[]
}

export interface PublicProfileData {
  profile: {
    name: string
    username: string
    image: string | null
    bio: string | null
    socialLinks: PublicProfileSocialLink[]
  }
  template: {
    id: string
    title: string
    slug: string
    meta_description: string | null
    blocks: Array<{
      id: string
      type: string
      content: Record<string, any>
      display_order: number
    }>
  }
  collections: PublicProfileCollection[]
}

export const PUBLIC_PROFILE_NOT_FOUND_ERROR = "PUBLIC_PROFILE_NOT_FOUND"

const PUBLIC_PROFILE_ITEMS_PER_FOLDER = 50
const DEFAULT_COLLECTIONS = [
  { key: "saved", label: "Saved" },
  { key: "want_to_go", label: "Want to go" },
]

type RawProfileRow = {
  profile: {
    id: string
    name: string
    username: string
    image: string | null
    bio: string | null
    socialLinks: unknown
  } | null
  template: {
    id: string
    title: string
    slug: string
    metaDescription: string | null
    contentBlocks: unknown
  } | null
  settings: unknown
  collections: Array<{
    id: string
    name: string
    default_key: string | null
    created_at: string
    items: Array<{
      id: string
      title: string
      slug: string
      featured_image: string | null
      meta_description: string | null
      rating: string | number | null
      address: string | null
      saved_at: string
    }>
  }>
}

export function isPublicProfileNotFoundError(error: unknown) {
  return error instanceof Error && error.message === PUBLIC_PROFILE_NOT_FOUND_ERROR
}

function sanitizeFolderName(value: unknown) {
  return typeof value === "string"
    ? value.trim().replace(/[<>"]/g, "").slice(0, 80)
    : ""
}

function getDefaultCollections(settings: unknown) {
  const configured = settings && typeof settings === "object" && Array.isArray((settings as any).directory_save_default_collections)
    ? (settings as any).directory_save_default_collections
    : []

  return DEFAULT_COLLECTIONS.map((fallback) => {
    const match = configured.find((item: any) => item?.key === fallback.key)
    const label = sanitizeFolderName(match?.label) || fallback.label
    return { key: fallback.key, label }
  })
}

function toIso(value?: Date | string | null) {
  if (!value) return ""
  if (value instanceof Date) return value.toISOString()
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toISOString()
}

function formatSavedListingAddress(address?: string | null) {
  const parts = (address || "").split(",").map((part) => part.trim()).filter(Boolean)
  const countryNames = ["united states", "usa", "us", "canada", "ca"]

  return parts
    .filter((part, index) => index !== parts.length - 1 || !countryNames.includes(part.toLowerCase()))
    .map((part) => part
      .replace(/\b[A-Z]\d[A-Z][ -]?\d[A-Z]\d\b/gi, "")
      .replace(/\b\d{5}(?:-\d{4})?\b/g, "")
      .replace(/\s{2,}/g, " ")
      .trim()
    )
    .filter(Boolean)
    .join(", ")
}

function normalizeSocialLinks(value: unknown): PublicProfileSocialLink[] {
  if (!Array.isArray(value)) return []

  return value.slice(0, 10).flatMap((entry) => {
    if (!entry || typeof entry !== "object") return []

    const platform = String((entry as any).platform || "").trim().slice(0, 30)
    const url = String((entry as any).url || "").trim()
    if (!url || url.length > 2048) return []

    try {
      const parsed = new URL(url)
      if (!["http:", "https:"].includes(parsed.protocol)) return []
    } catch {
      return []
    }

    return [{ platform, url }]
  })
}

function normalizeListingItem(item: RawProfileRow["collections"][number]["items"][number]): PublicProfileListingItem {
  const rating = item.rating == null ? null : Number(item.rating)

  return {
    id: item.id,
    title: item.title,
    slug: item.slug,
    featured_image: item.featured_image,
    meta_description: item.meta_description,
    rating: Number.isFinite(rating) ? rating : null,
    address: formatSavedListingAddress(item.address) || null,
    saved_at: toIso(item.saved_at),
  }
}

function buildTemplateBlocks(contentBlocks: unknown): PublicProfileData["template"]["blocks"] {
  if (!contentBlocks || typeof contentBlocks !== "object") return []

  return Object.entries(contentBlocks as Record<string, any>)
    .flatMap(([id, blockData]) => {
      if (!isSupportedAccountPageBlockType(blockData?.type)) return []

      return [{
        id,
        type: blockData.type,
        content: blockData.content || blockData,
        display_order: Number(blockData.display_order || 0),
      }]
    })
    .sort((a, b) => a.display_order - b.display_order)
}

function buildCollections(row: RawProfileRow): PublicProfileCollection[] {
  const collectionRows = Array.isArray(row.collections) ? row.collections : []
  const rowsByDefaultKey = new Map(collectionRows.map((collection) => [collection.default_key, collection]))
  const defaultCollections = getDefaultCollections(row.settings).map((item) => {
    const collection = rowsByDefaultKey.get(item.key)

    return {
      id: collection?.id || null,
      name: item.label,
      default_key: item.key,
      items: collection ? (collection.items || []).map(normalizeListingItem) : [],
    }
  })
  const customCollections = collectionRows
    .filter((collection) => !collection.default_key)
    .map((collection) => ({
      id: collection.id as string | null,
      name: collection.name,
      default_key: null,
      items: (collection.items || []).map(normalizeListingItem),
    }))

  return [...defaultCollections, ...customCollections]
}

export function getCachedPublicProfileData(siteId: string, username: string): Promise<PublicProfileData> {
  const normalizedUsername = toPublicProfileUsername(username)

  return unstable_cache(
    async () => {
      const rows = await db.execute<RawProfileRow>(sql`
        with site_row as (
          select s.id, s.settings
          from sites s
          where s.id = ${siteId}
          limit 1
        ),
        matched_profile as (
          select
            u.id,
            coalesce(nullif(u."displayName", ''), u.name) as name,
            trim(both '-' from regexp_replace(
              lower(trim(replace(coalesce(nullif(u."displayName", ''), u.name), '&', ' and '))),
              '[^a-z0-9]+',
              '-',
              'g'
            )) as username,
            u.image,
            u.bio,
            u."socialLinks"
          from users u
          inner join site_memberships sm
            on sm.user_id = u.id
            and sm.site_id = ${siteId}
            and sm.status = 'active'
          where trim(both '-' from regexp_replace(
              lower(trim(replace(coalesce(nullif(u."displayName", ''), u.name), '&', ' and '))),
              '[^a-z0-9]+',
              '-',
              'g'
            )) = ${normalizedUsername}
          order by sm.created_at asc, u."createdAt" asc
          limit 1
        ),
        profile_template as (
          select
            p.id,
            p.title,
            p.slug,
            p.meta_description as "metaDescription",
            p.content_blocks as "contentBlocks"
          from site_dashboard_pages p
          where p.site_id = ${siteId}
            and p.slug = ${PUBLIC_PROFILE_TEMPLATE_SLUG}
            and p.is_published = true
          limit 1
        ),
        collection_rows as (
          select
            dsc.id,
            dsc.name,
            dsc.default_key,
            dsc.created_at
          from directory_save_collections dsc
          inner join matched_profile mp on mp.id = dsc.user_id
          where dsc.site_id = ${siteId}
        ),
        ranked_items as (
          select
            dsi.collection_id,
            d.id as directory_id,
            d.title,
            d.slug,
            d.featured_image,
            d.meta_description,
            case
              when core_block.content #>> '{rating}' ~ '^[0-9]+(\\.[0-9]+)?$'
              then core_block.content #>> '{rating}'
              else null
            end as rating,
            nullif(core_block.content #>> '{address}', '') as address,
            dsi.created_at as saved_at,
            row_number() over (
              partition by dsi.collection_id
              order by dsi.created_at desc, dsi.id desc
            ) as item_rank
          from directory_save_items dsi
          inner join matched_profile mp on mp.id = dsi.user_id
          inner join directory d
            on d.id = dsi.directory_id
            and d.site_id = dsi.site_id
            and d.status = 'published'
          left join lateral (
            select block.value->'content' as content
            from jsonb_each(coalesce(d.content_blocks, '{}'::jsonb)) as block(key, value)
            where block.value->>'type' = 'directory-core'
            limit 1
          ) core_block on true
          where dsi.site_id = ${siteId}
        ),
        items_by_collection as (
          select
            ri.collection_id,
            jsonb_agg(jsonb_build_object(
              'id', ri.directory_id,
              'title', ri.title,
              'slug', ri.slug,
              'featured_image', ri.featured_image,
              'meta_description', ri.meta_description,
              'rating', ri.rating,
              'address', ri.address,
              'saved_at', ri.saved_at
            ) order by ri.saved_at desc) as items
          from ranked_items ri
          where ri.item_rank <= ${PUBLIC_PROFILE_ITEMS_PER_FOLDER}
          group by ri.collection_id
        )
        select
          (select to_jsonb(matched_profile) from matched_profile) as profile,
          (select to_jsonb(profile_template) from profile_template) as template,
          (select settings from site_row) as settings,
          coalesce((
            select jsonb_agg(jsonb_build_object(
              'id', cr.id,
              'name', cr.name,
              'default_key', cr.default_key,
              'created_at', cr.created_at,
              'items', coalesce(ibc.items, '[]'::jsonb)
            ) order by (cr.default_key is null), cr.default_key, cr.created_at, cr.id)
            from collection_rows cr
            left join items_by_collection ibc on ibc.collection_id = cr.id
          ), '[]'::jsonb) as collections
        from site_row
      `)

      const row = rows.rows[0]
      if (!row?.profile || !row.template) {
        throw new Error(PUBLIC_PROFILE_NOT_FOUND_ERROR)
      }

      return {
        profile: {
          name: row.profile.name,
          username: row.profile.username,
          image: row.profile.image,
          bio: row.profile.bio,
          socialLinks: normalizeSocialLinks(row.profile.socialLinks),
        },
        template: {
          id: row.template.id,
          title: row.template.title,
          slug: row.template.slug,
          meta_description: row.template.metaDescription,
          blocks: buildTemplateBlocks(row.template.contentBlocks),
        },
        collections: buildCollections(row),
      }
    },
    ["public-profile-data-v2", siteId, normalizedUsername],
    {
      revalidate: false,
      tags: ["public-profile", "directory", `site-${siteId}`, "all"],
    }
  )()
}
