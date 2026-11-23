import { and, asc, desc, eq, inArray, sql } from "drizzle-orm"
import { unstable_cache } from "@/lib/cache"
import { db } from "@/lib/db"
import { authUsers, siteMemberships, sites } from "@/lib/db/schema"
import {
  normalizeSocialLinks,
  type PublicProfileSocialLink,
} from "@/lib/actions/profiles/public-profile-actions"
import {
  isValidPublicProfileUsername,
  toPublicProfileUsername,
} from "@/lib/utils/public-profile-path"
import { UUID_REGEX } from "@/lib/utils/validation"

export interface MemberDirectoryMember {
  username: string
  name: string
  image: string | null
  bio: string | null
  socialLinks: PublicProfileSocialLink[]
  role: string
}

export interface MemberDirectoryData {
  members: MemberDirectoryMember[]
  roleCounts: Record<string, number>
  total: number
}

const MEMBER_DIRECTORY_ROLES = ["owner", "admin", "member"]

function clampRoles(input: unknown): string[] {
  const roles = Array.isArray(input)
    ? [...new Set(input.filter((role) => MEMBER_DIRECTORY_ROLES.includes(role)))]
    : []
  // Sorted so unstable_cache keys don't vary with role order
  return roles.length ? roles.sort() : [...MEMBER_DIRECTORY_ROLES]
}

function clampLimit(limit?: number) {
  const value = Math.floor(Number(limit) || 24)
  return Math.min(100, Math.max(1, value))
}

const getCachedMemberDirectoryData = unstable_cache(
  async (
    siteId: string,
    roles: string[],
    limit: number,
    sortBy: "name" | "joined",
    sortOrder: "asc" | "desc"
  ): Promise<MemberDirectoryData> => {
    const whereClause = and(
      eq(siteMemberships.siteId, siteId),
      eq(siteMemberships.status, "active"),
      inArray(siteMemberships.role, roles),
      eq(authUsers.banned, false),
      inArray(sites.status, ["active", "draft"])
    )
    const memberNameSql = sql`lower(coalesce(nullif(trim(${authUsers.displayName}), ''), ${authUsers.name}))`
    const sortColumn = sortBy === "joined" ? siteMemberships.createdAt : memberNameSql
    const direction = sortOrder === "desc" ? desc : asc

    const [rows, countRows] = await Promise.all([
      db
        .select({
          name: authUsers.name,
          displayName: authUsers.displayName,
          image: authUsers.image,
          bio: authUsers.bio,
          socialLinks: authUsers.socialLinks,
          role: siteMemberships.role,
        })
        .from(siteMemberships)
        .innerJoin(authUsers, eq(authUsers.id, siteMemberships.userId))
        .innerJoin(sites, eq(sites.id, siteMemberships.siteId))
        .where(whereClause)
        .orderBy(direction(sortColumn))
        .limit(limit),
      db
        .select({
          role: siteMemberships.role,
          count: sql<number>`count(*)::int`,
        })
        .from(siteMemberships)
        .innerJoin(authUsers, eq(authUsers.id, siteMemberships.userId))
        .innerJoin(sites, eq(sites.id, siteMemberships.siteId))
        .where(whereClause)
        .groupBy(siteMemberships.role),
    ])

    const members = rows.flatMap((row) => {
      const name = row.displayName?.trim() || row.name
      const username = toPublicProfileUsername(name)
      if (!isValidPublicProfileUsername(username)) return []

      return [{
        username,
        name,
        image: row.image,
        bio: row.bio,
        socialLinks: normalizeSocialLinks(row.socialLinks),
        role: row.role,
      }]
    })

    const roleCounts: Record<string, number> = {}
    let total = 0
    for (const row of countRows) {
      roleCounts[row.role] = row.count
      total += row.count
    }

    return { members, roleCounts, total }
  },
  ["member-directory-data-v1"],
  {
    revalidate: 3600,
    tags: ["public-profile", "all"],
  }
)

export async function getMemberDirectoryDataImpl(params: {
  siteId: string
  includedRoles?: string[]
  itemsPerPage?: number
  sortBy?: string
  sortOrder?: string
}): Promise<{
  success: boolean
  data?: MemberDirectoryData
  error?: string
}> {
  try {
    const { siteId } = params

    if (!siteId || !UUID_REGEX.test(siteId)) {
      return { success: false, error: "Site ID is required" }
    }

    const data = await getCachedMemberDirectoryData(
      siteId,
      clampRoles(params.includedRoles),
      clampLimit(params.itemsPerPage),
      params.sortBy === "joined" ? "joined" : "name",
      params.sortOrder === "desc" ? "desc" : "asc"
    )

    return { success: true, data }
  } catch (error) {
    console.error("Error loading member directory data:", error)
    return { success: false, error: "Failed to load members" }
  }
}
