"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { MapPin } from "lucide-react"
import { BlockContainer } from "@/components/frontend/layout/block-container"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Rating } from "@/components/shadcnblocks/rating"
import { DirectorySaveDropdown } from "@/components/frontend/directories/DirectorySaveDropdown"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { getMyProfile, type ProfileSocialLink } from "@/lib/actions/auth/auth-actions"
import {
  getMySavedCollectionsAction,
  type MySavedCollection,
} from "@/lib/actions/directories/directory-save-actions"
import { cn } from "@/lib/utils/tailwind"
import { getInitials } from "@/lib/utils/get-initials"
import { resolveMediaUrl } from "@/lib/utils/media-url"
import { getSocialMeta } from "@/lib/utils/social-icons"

interface AccountCoreBlockProps {
  siteId: string
  content?: {
    savedTitle?: string
    emptyText?: string
    imageFit?: "crop" | "fit"
    imageHeight?: number
    imageQuality?: number
    saveIconOpacity?: number
    displayMode?: "grid" | "list"
    mobileColumns?: number
    columns?: number
    sortBy?: "date" | "title"
    sortOrder?: "asc" | "desc"
    visibility?: Record<string, boolean>
  }
  siteWidth?: "full" | "custom"
  customWidth?: number
  isPreview?: boolean
  profileData?: ProfileData | null
  collectionsData?: MySavedCollection[]
}

interface ProfileData {
  name: string
  image: string | null
  bio: string | null
  socialLinks: ProfileSocialLink[]
}

// Builder preview never shows live member data — sample profile + folders only
const PREVIEW_PROFILE: ProfileData = {
  name: "Member Name",
  image: null,
  bio: "A short member bio appears here once it's filled in on the Edit Profile page.",
  socialLinks: [
    { platform: "instagram", url: "https://instagram.com" },
    { platform: "twitter", url: "https://twitter.com" },
  ],
}

const PREVIEW_COLLECTIONS: MySavedCollection[] = [
  {
    id: null,
    name: "Saved",
    default_key: "saved",
    items: [
      {
        id: "preview-saved-1",
        title: "Sample Listing",
        slug: "sample-listing",
        featured_image: null,
        meta_description: "A short listing description appears here.",
        rating: 4.8,
        address: "123 Main Street",
        saved_at: "",
      },
    ],
  },
  { id: null, name: "Want to go", default_key: "want_to_go", items: [] },
]

// Tailwind needs literal class names — desktop column classes (mirrors the
// Listing Views block's desktopGridColumns mapping)
const DESKTOP_COLUMN_CLASS_MAP: Record<number, string> = {
  2: "lg:grid-cols-2",
  3: "lg:grid-cols-3",
  4: "lg:grid-cols-4",
}

// Same 15-word truncation the Listing Views block applies to meta descriptions
function getShortDescription(value?: string | null) {
  const plainText = (value || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()
  const words = plainText.split(/\s+/).filter(Boolean)
  return words.length > 15 ? `${words.slice(0, 15).join(" ")}...` : plainText
}

function getRatingValue(rating?: number | null) {
  const value = Number(rating)
  if (!Number.isFinite(value) || value <= 0) return null
  return Math.min(5, value)
}

// Stable tab value per folder — default folders may not have a row id yet
function getCollectionTabValue(collection: MySavedCollection) {
  return collection.default_key || collection.id || collection.name
}

export function AccountCoreBlock({
  siteId,
  content,
  siteWidth,
  customWidth,
  isPreview = false,
  profileData,
  collectionsData,
}: AccountCoreBlockProps) {
  const visibility = content?.visibility || {}
  const isVisible = (key: string) => visibility[key] !== false
  // Styling settings — defaults and clamping mirror the Listing Views block
  const columns = DESKTOP_COLUMN_CLASS_MAP[Number(content?.columns)] ? Number(content?.columns) : 3
  const displayMode = content?.displayMode === "list" ? "list" : "grid"
  const mobileColumns = Number(content?.mobileColumns) === 2 ? 2 : 1
  const imageFit = content?.imageFit === "fit" ? "fit" : "crop"
  const imageFitClassName = imageFit === "fit" ? "object-contain" : "object-cover"
  const imageFrameClassName = imageFit === "fit" ? "bg-muted" : ""
  const customImageHeight = Number(content?.imageHeight) > 0 ? Number(content?.imageHeight) : undefined
  const imageFrameStyle = customImageHeight ? { aspectRatio: `100 / ${customImageHeight}` } : undefined
  const imageAspectClassName = customImageHeight ? "" : "aspect-video"
  const imageQualityNumber = Number(content?.imageQuality)
  const resolvedImageQuality = Number.isFinite(imageQualityNumber) && imageQualityNumber > 0
    ? Math.min(100, Math.max(1, imageQualityNumber))
    : undefined
  const saveIconOpacityNumber = Number(content?.saveIconOpacity)
  const resolvedSaveIconOpacity = Math.min(100, Math.max(0, Number.isFinite(saveIconOpacityNumber) ? saveIconOpacityNumber : 70))
  const sortBy = content?.sortBy === "title" ? "title" : "date"
  const sortOrder = content?.sortOrder === "asc" ? "asc" : "desc"
  const mobileGridColumns = mobileColumns === 2 ? "grid-cols-2" : "grid-cols-1"
  const gridColumns = displayMode === "grid"
    ? `${mobileGridColumns} sm:grid-cols-2 ${DESKTOP_COLUMN_CLASS_MAP[columns]}`
    : "grid-cols-1"
  const [profile, setProfile] = useState<ProfileData | null>(() => profileData ?? null)
  const [collections, setCollections] = useState<MySavedCollection[]>(() => collectionsData ?? [])
  const [loading, setLoading] = useState(!(isPreview || profileData !== undefined || collectionsData !== undefined))

  useEffect(() => {
    if (isPreview) {
      setProfile(PREVIEW_PROFILE)
      setCollections(PREVIEW_COLLECTIONS)
      setLoading(false)
      return
    }

    if (profileData !== undefined || collectionsData !== undefined) {
      setProfile(profileData ?? null)
      setCollections(collectionsData ?? [])
      setLoading(false)
      return
    }

    let cancelled = false

    // Profile + saved folders are independent per-user fetches — run in parallel
    Promise.all([getMyProfile(), getMySavedCollectionsAction(siteId)])
      .then(([currentUser, savedResult]) => {
        if (cancelled) return

        if (currentUser) {
          setProfile({
            name: currentUser.displayName || currentUser.name || currentUser.email?.split("@")[0] || "Member",
            image: currentUser.image,
            bio: currentUser.bio,
            socialLinks: currentUser.socialLinks || [],
          })
        }

        setCollections(savedResult.error ? [] : savedResult.collections)
      })
      .catch(() => {
        if (!cancelled) setCollections([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [collectionsData, isPreview, profileData, siteId])

  if (visibility.hideBlock === true) return null

  // Per-folder sort (ISO saved_at strings compare lexicographically)
  const sortItems = (items: MySavedCollection["items"]) => {
    const sorted = [...items].sort((a, b) =>
      sortBy === "title" ? a.title.localeCompare(b.title) : a.saved_at.localeCompare(b.saved_at)
    )
    return sortOrder === "desc" ? sorted.reverse() : sorted
  }

  const socialLinks = profile?.socialLinks?.filter((link) => link.url?.trim()) || []
  const showSavedTabs = isVisible("savedTabs") && collections.length > 0
  const savedTitle = content?.savedTitle ?? "Saved Listings"
  const emptyText = content?.emptyText || "No saved listings yet."

  return (
    <BlockContainer siteWidth={siteWidth} customWidth={customWidth}>
      {loading ? (
        <Card>
          <CardContent className="flex h-40 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-10">
          {/* Profile header: avatar left, name/bio/socials right */}
          {profile ? (
            <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center">
              {isVisible("avatar") ? (
                <Avatar className="h-24 w-24 border bg-muted">
                  <AvatarImage src={resolveMediaUrl(profile.image)} alt={profile.name} />
                  <AvatarFallback className="text-2xl">{getInitials(profile.name)}</AvatarFallback>
                </Avatar>
              ) : null}

              <div className="min-w-0 space-y-2">
                {isVisible("name") ? (
                  <h1 className="text-2xl font-bold leading-tight tracking-tight">{profile.name}</h1>
                ) : null}

                {isVisible("bio") && profile.bio ? (
                  <p className="max-w-2xl text-sm leading-6 text-muted-foreground">{profile.bio}</p>
                ) : null}

                {isVisible("socialLinks") && socialLinks.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-3 pt-1">
                    {socialLinks.map((link, index) => {
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
                          <Icon className="h-5 w-5" />
                        </a>
                      )
                    })}
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          {/* Saved listings: one tab per save folder */}
          {showSavedTabs ? (
            <div className="space-y-4">
              {savedTitle ? (
                <h2 className="text-xl font-semibold leading-tight tracking-normal">{savedTitle}</h2>
              ) : null}

              <Tabs defaultValue={getCollectionTabValue(collections[0])}>
                <TabsList>
                  {collections.map((collection) => (
                    <TabsTrigger key={getCollectionTabValue(collection)} value={getCollectionTabValue(collection)}>
                      {collection.name}
                    </TabsTrigger>
                  ))}
                </TabsList>

                {collections.map((collection) => (
                  <TabsContent key={getCollectionTabValue(collection)} value={getCollectionTabValue(collection)} className="pt-4">
                    {collection.items.length === 0 ? (
                      <p className="text-sm text-muted-foreground">{emptyText}</p>
                    ) : (
                      <div className={cn("grid gap-6", gridColumns)}>
                        {/* Card markup mirrors the Listing Views block's directory style */}
                        {sortItems(collection.items).map((item) => {
                          const href = `/directory/${item.slug}`
                          const imageUrl = resolveMediaUrl(item.featured_image)
                          const metaDescription = getShortDescription(item.meta_description)
                          const rating = getRatingValue(item.rating)
                          const address = item.address?.trim()

                          return (
                            <Card key={item.id} className="group/card grid h-full grid-rows-[auto_auto_1fr_auto] overflow-hidden">
                              <div
                                className={cn("group relative w-full overflow-hidden", imageAspectClassName, imageFrameClassName)}
                                style={imageFrameStyle}
                              >
                                <Link
                                  href={href}
                                  tabIndex={-1}
                                  className="absolute inset-0 outline-none"
                                  aria-label={`Read ${item.title}`}
                                >
                                  {imageUrl ? (
                                    <Image
                                      src={imageUrl}
                                      alt={item.title}
                                      fill
                                      className={`${imageFitClassName} object-center transition-opacity duration-200 group-hover/card:opacity-75`}
                                      sizes="(max-width: 639px) 100vw, (max-width: 1023px) 50vw, 33vw"
                                      quality={resolvedImageQuality}
                                    />
                                  ) : (
                                    <div className="flex h-full w-full items-center justify-center bg-muted text-foreground">
                                      No Image
                                    </div>
                                  )}
                                </Link>
                                {!isPreview && (
                                  <DirectorySaveDropdown
                                    siteId={siteId}
                                    directoryId={item.id}
                                    opacity={resolvedSaveIconOpacity}
                                    className="absolute right-2 top-2 z-10 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100"
                                  />
                                )}
                              </div>
                              <Link
                                href={href}
                                className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                aria-label={`Read ${item.title}`}
                              >
                                <CardHeader>
                                  <h3 className="text-base md:text-xl">{item.title}</h3>
                                  {rating && (
                                    <div className="flex flex-col gap-2 text-sm text-muted-foreground">
                                      <Rating rate={rating} showScore className="[&_svg]:size-4 [&>div]:size-4" />
                                    </div>
                                  )}
                                  {metaDescription && (
                                    <p className="py-2 text-sm leading-relaxed text-muted-foreground">
                                      {metaDescription}
                                    </p>
                                  )}
                                  {address && (
                                    <div className="flex items-start gap-1.5 text-sm text-muted-foreground">
                                      <MapPin className="mt-0.5 size-4 shrink-0 text-foreground" />
                                      <span className="min-w-0">{address}</span>
                                    </div>
                                  )}
                                </CardHeader>
                              </Link>
                            </Card>
                          )
                        })}
                      </div>
                    )}
                  </TabsContent>
                ))}
              </Tabs>
            </div>
          ) : null}
        </div>
      )}
    </BlockContainer>
  )
}
