"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "@/components/app-link"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { BlockContainer } from "@/components/frontend/layout/block-container"
import {
  getMemberDirectoryData,
  type MemberDirectoryData,
} from "@/lib/actions/pages/page-member-directory-actions"
import { cn } from "@/lib/utils/tailwind"
import { getInitials } from "@/lib/utils/get-initials"
import { resolveMediaUrl } from "@/lib/utils/media-url"
import { getSocialMeta } from "@/lib/utils/social-icons"

interface PageMemberDirectoryBlockProps {
  content?: {
    title?: string
    subtitle?: string
    layout?: "grid" | "list"
    columns?: number
    itemsPerPage?: number
    sortBy?: "name" | "joined"
    sortOrder?: "asc" | "desc"
    showSearch?: boolean
    showRoleChips?: boolean
    includedRoles?: string[]
    visibility?: Record<string, boolean>
  }
  siteId: string
  preloadedData?: MemberDirectoryData
  siteWidth?: "full" | "custom"
  customWidth?: number
}

const ROLE_CHIP_LABELS: Record<string, string> = {
  owner: "Owners",
  admin: "Admins",
  member: "Members",
}

const GRID_COLUMNS_CLASS: Record<number, string> = {
  1: "lg:grid-cols-1",
  2: "lg:grid-cols-2",
  3: "lg:grid-cols-3",
  4: "lg:grid-cols-4",
}

export function PageMemberDirectoryBlock({
  content,
  siteId,
  preloadedData,
  siteWidth = "custom",
  customWidth,
}: PageMemberDirectoryBlockProps) {
  const {
    title = "Members",
    subtitle = "",
    layout = "grid",
    columns = 3,
    itemsPerPage = 24,
    sortBy = "name",
    sortOrder = "asc",
    showSearch = true,
    showRoleChips = true,
    includedRoles,
    visibility = {},
  } = content || {}
  const [data, setData] = useState<MemberDirectoryData | null>(preloadedData || null)
  const [loading, setLoading] = useState(!preloadedData)
  const [search, setSearch] = useState("")
  const [activeRole, setActiveRole] = useState("all")
  // String key: the builder passes a fresh content object every render, so
  // depending on the array identity would refetch in a loop
  const rolesKey = JSON.stringify(includedRoles || [])

  useEffect(() => {
    if (!siteId) {
      setData(null)
      setLoading(false)
      return
    }

    if (preloadedData) {
      setData(preloadedData)
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    getMemberDirectoryData({
      siteId,
      includedRoles: JSON.parse(rolesKey),
      itemsPerPage,
      sortBy,
      sortOrder,
    })
      .then((result) => {
        if (!cancelled) setData(result.success && result.data ? result.data : null)
      })
      .catch(() => {
        if (!cancelled) setData(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [itemsPerPage, preloadedData, rolesKey, siteId, sortBy, sortOrder])

  const members = useMemo(() => data?.members || [], [data])
  const filteredMembers = useMemo(() => {
    const query = search.trim().toLowerCase()

    return members.filter((member) =>
      (activeRole === "all" || member.role === activeRole) &&
      (!query
        || member.name.toLowerCase().includes(query)
        || (member.bio || "").toLowerCase().includes(query))
    )
  }, [activeRole, members, search])

  if (visibility.hideBlock === true) return null

  const showTitle = visibility.title !== false && Boolean(title)
  const showSubtitle = visibility.subtitle !== false && Boolean(subtitle)
  const chipRoles = Object.keys(ROLE_CHIP_LABELS).filter((role) => (data?.roleCounts?.[role] || 0) > 0)
  const showChips = showRoleChips && chipRoles.length > 0

  return (
    <BlockContainer
      header={showTitle || showSubtitle
        ? {
            title: showTitle ? title : "",
            subtitle: showSubtitle ? subtitle : "",
            align: "left",
          }
        : undefined}
      siteWidth={siteWidth}
      customWidth={customWidth}
    >
      <div className="space-y-6">
        {showSearch && (
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search members..."
            className="min-h-11 max-w-md text-base"
          />
        )}

        {showChips && (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant={activeRole === "all" ? "default" : "outline"}
              size="sm"
              onClick={() => setActiveRole("all")}
            >
              All {data?.total ? `(${data.total})` : ""}
            </Button>
            {chipRoles.map((role) => (
              <Button
                key={role}
                type="button"
                variant={activeRole === role ? "default" : "outline"}
                size="sm"
                onClick={() => setActiveRole(role)}
              >
                {ROLE_CHIP_LABELS[role]} ({data?.roleCounts?.[role]})
              </Button>
            ))}
          </div>
        )}

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading members...</p>
        ) : filteredMembers.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {members.length === 0 ? "No members to show yet." : "No members match your search."}
          </p>
        ) : (
          <div
            className={cn(
              "grid gap-6",
              layout === "grid"
                ? ["sm:grid-cols-2", GRID_COLUMNS_CLASS[columns] || GRID_COLUMNS_CLASS[3]]
                : "grid-cols-1"
            )}
          >
            {filteredMembers.map((member, memberIndex) => (
              <Card key={`${member.username}-${memberIndex}`}>
                <CardContent
                  className={cn(
                    "flex gap-4 p-6",
                    layout === "grid" ? "flex-col items-center text-center" : "flex-row items-start"
                  )}
                >
                  <Avatar className="h-16 w-16 border bg-muted">
                    <AvatarImage src={resolveMediaUrl(member.image)} alt={member.name} />
                    <AvatarFallback className="text-lg">{getInitials(member.name)}</AvatarFallback>
                  </Avatar>

                  <div className={cn("min-w-0 flex-1 space-y-2", layout === "grid" && "flex flex-col items-center")}>
                    <h3 className="text-base font-semibold leading-snug">{member.name}</h3>

                    {member.bio && (
                      <p className="line-clamp-3 text-sm text-muted-foreground">{member.bio}</p>
                    )}

                    {member.socialLinks.length > 0 && (
                      <div className="flex flex-wrap items-center gap-3 pt-1">
                        {member.socialLinks.map((link, index) => {
                          const { label, Icon } = getSocialMeta(link.platform)
                          return (
                            <a
                              key={`${link.platform}-${index}`}
                              href={link.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              aria-label={label}
                              className="inline-flex items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
                            >
                              <Icon className="h-4 w-4" />
                            </a>
                          )
                        })}
                      </div>
                    )}

                    <Button asChild variant="outline" size="sm" className="mt-1">
                      <Link href={`/profile/${member.username}`}>View Profile</Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </BlockContainer>
  )
}
