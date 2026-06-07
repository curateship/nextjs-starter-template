import { Facebook, Github, Globe, Instagram, Linkedin, MapPin, Music2, Twitter, type LucideIcon, Youtube } from "lucide-react"
import {
  buildDirectoryCoreMenuHref,
  buildDirectoryCoreUrlHref,
  getDirectoryCoreMenuDefaultIcon,
  getDirectoryCoreMenuLabel,
  normalizeDirectoryCoreMenuLink,
  normalizeDirectoryCoreSocialLink,
  renderDirectoryCoreIntroText,
  type DirectoryCoreCategoryContext,
  type DirectoryCoreMenuLink,
  type DirectoryCoreSocialLink
} from "@/lib/actions/directories/directory-core"
import type { DirectoryData } from "@/lib/actions/directories/directory-data"
import { DirectoryClaimButton } from "@/components/frontend/directories/claim/DirectoryClaimButton"
import { DirectorySaveDropdown } from "@/components/frontend/directories/DirectorySaveDropdown"
import { Rating } from "@/components/shadcnblocks/rating"
import { Card, CardSection } from "@/components/ui/card"
import { renderQuickLinkIcon } from "@/lib/utils/site-quick-links"
import { cn } from "@/lib/utils/tailwind"
import type { HTMLAttributes } from "react"

interface DirectoryCoreBlockProps {
  content?: Record<string, any>
  directory: {
    id?: string | null
    title?: string | null
    slug?: string | null
    featured_image?: string | null
    category_context?: DirectoryCoreCategoryContext | null
  }
  directoryData?: DirectoryData
  loginPath?: string
  siteId?: string | null
  cardProps?: HTMLAttributes<HTMLDivElement>
}

const SOCIAL_ICON_MAP: Record<string, { label: string; Icon: LucideIcon }> = {
  facebook: { label: "Facebook", Icon: Facebook },
  instagram: { label: "Instagram", Icon: Instagram },
  twitter: { label: "Twitter", Icon: Twitter },
  linkedin: { label: "LinkedIn", Icon: Linkedin },
  youtube: { label: "YouTube", Icon: Youtube },
  tiktok: { label: "TikTok", Icon: Music2 },
  github: { label: "GitHub", Icon: Github }
}

const ACTION_ROW_CLASS = "flex min-h-8 items-center gap-3 px-6 py-2 text-primary transition-colors hover:bg-primary/5 hover:text-primary/85"
const MUTED_ACTION_ROW_CLASS = "flex min-h-8 items-center gap-3 px-6 py-2 text-muted-foreground"

function resolveMediaUrl(url?: string | null) {
  const trimmedUrl = url?.trim() || ""
  if (!trimmedUrl) return ""

  if (trimmedUrl.startsWith("r2://")) {
    return `/api/media/proxy?url=${encodeURIComponent(trimmedUrl)}`
  }

  return trimmedUrl
}

function isExternalHref(href: string) {
  return /^https?:\/\//i.test(href)
}

function getSocialMeta(platform?: string) {
  const normalizedPlatform = platform?.toLowerCase() || ""
  return (
    SOCIAL_ICON_MAP[normalizedPlatform] || {
      label: platform ? platform.charAt(0).toUpperCase() + platform.slice(1) : "Social Link",
      Icon: Globe
    }
  )
}

function SocialLink({ link }: { link: DirectoryCoreSocialLink }) {
  const href = buildDirectoryCoreUrlHref(link.url)
  if (!href) return null

  const { label, Icon } = getSocialMeta(link.platform)

  return (
    <a
      href={href}
      target={isExternalHref(href) ? "_blank" : undefined}
      rel={isExternalHref(href) ? "noopener noreferrer" : undefined}
      aria-label={label}
      className="inline-flex items-center justify-center text-neutral-500 transition-colors hover:text-black"
    >
      <Icon className="h-7 w-7" />
    </a>
  )
}

function MenuLink({ link }: { link: DirectoryCoreMenuLink }) {
  const href = buildDirectoryCoreMenuHref(link)
  if (!href) return null

  const iconName = link.icon || getDirectoryCoreMenuDefaultIcon(link.type)
  const label = getDirectoryCoreMenuLabel(link)

  return (
    <a
      href={href}
      target={isExternalHref(href) ? "_blank" : undefined}
      rel={isExternalHref(href) ? "noopener noreferrer" : undefined}
      className={ACTION_ROW_CLASS}
    >
      {renderQuickLinkIcon(iconName, "h-5 w-5 shrink-0")}
      <span className="min-w-0 wrap-break-word text-base leading-snug">{label}</span>
    </a>
  )
}

function getDataMenuLinkConfig(content: Record<string, any> | undefined, type: DirectoryCoreMenuLink["type"]) {
  const links = Array.isArray(content?.menuLinks) ? content.menuLinks : []
  return links
    .map((link, index) => normalizeDirectoryCoreMenuLink(link, index))
    .find((link): link is DirectoryCoreMenuLink => Boolean(link && link.type === type))
}

function buildDataMenuLink(
  content: Record<string, any> | undefined,
  type: DirectoryCoreMenuLink["type"],
  value?: string | null
): DirectoryCoreMenuLink | null {
  const trimmedValue = value?.trim()
  if (!trimmedValue) return null

  const config = getDataMenuLinkConfig(content, type)
  const label = config?.label?.trim() || (type === "phone" ? trimmedValue : "")
  return {
    id: config?.id || `${type}-directory-data`,
    type,
    label,
    value: trimmedValue,
    icon: config?.icon,
  }
}

function getDirectoryFieldValue(fields: DirectoryData["fields"], type: DirectoryCoreMenuLink["type"]) {
  switch (type) {
    case "directions":
      return fields?.mapsUrl || fields?.address
    case "phone":
      return fields?.phone
    case "website":
      return fields?.website
    default:
      return ""
  }
}

function formatDirectoryAddress(address?: string | null, country?: string | null) {
  const parts = (address || "").split(",").map((part) => part.trim()).filter(Boolean)
  const countryNames = [country, "United States", "USA", "US", "Canada", "CA"]
    .filter(Boolean)
    .map((value) => value!.toLowerCase())

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

export function DirectoryCoreBlock({ content, directory, directoryData, loginPath, siteId, cardProps }: DirectoryCoreBlockProps) {
  const visibility =
    content?.visibility && typeof content.visibility === "object" ? (content.visibility as Record<string, boolean>) : {}

  if (visibility.hideBlock === true) return null

  const socialLinks = Array.isArray(content?.socialLinks)
    ? content.socialLinks
        .map((link, index) => normalizeDirectoryCoreSocialLink(link, index))
        .filter((link): link is DirectoryCoreSocialLink => !!link)
    : []
  const fields = directoryData?.fields || {}
  const configuredMenuLinks = Array.isArray(content?.menuLinks)
    ? content.menuLinks
        .map((link, index) => normalizeDirectoryCoreMenuLink(link, index))
        .filter((link): link is DirectoryCoreMenuLink => !!link)
    : []
  const menuLinks = (configuredMenuLinks.length > 0
    ? configuredMenuLinks
    : [
        { id: "directions-directory-data", type: "directions" as const },
        { id: "phone-directory-data", type: "phone" as const },
        { id: "website-directory-data", type: "website" as const },
        { id: "claim-directory-data", type: "claim" as const, label: "Claim Listing", icon: "building" },
      ]
  ).filter((link, index, links) => {
    if (link.type === "claim" && links.findIndex((item) => item.type === "claim") !== index) return false
    if (link.type === "claim") return Boolean(directory.id) && content?.claimEnabled !== false
    if (link.type === "custom" || link.type === "email") return Boolean(link.value?.trim())
    return Boolean(getDirectoryFieldValue(fields, link.type)?.trim())
  }).map((link) => {
    if (link.type === "claim" || link.type === "custom" || link.type === "email") return link
    return buildDataMenuLink(content, link.type, getDirectoryFieldValue(fields, link.type)) || link
  })
  const title = fields.businessName || directory.title || "Directory Listing"
  const ratingValue = Number(fields.rating)
  const rating = Number.isFinite(ratingValue) && ratingValue > 0 ? Math.min(5, ratingValue) : null
  const address = formatDirectoryAddress(fields.address, fields.country)
  const featuredImage = visibility.image === false ? "" : resolveMediaUrl(directory.featured_image)
  const showSaveButton = Boolean(siteId && directory.id && featuredImage && visibility.image !== false)
  const saveIconOpacityNumber = Number(content?.saveIconOpacity)
  const resolvedSaveIconOpacity = Math.min(100, Math.max(0, Number.isFinite(saveIconOpacityNumber) ? saveIconOpacityNumber : 100))
  const introTemplate = typeof content?.introText === "string" ? content.introText : ""
  const introText = renderDirectoryCoreIntroText(introTemplate, {
    directoryTitle: title,
    parentCategory: directory.category_context?.parent_title,
    childCategory: directory.category_context?.child_title
  })

  const { className: cardClassName, ...rootProps } = cardProps || {}

  return (
    <Card {...rootProps} className={cn("overflow-hidden", cardClassName)}>
      {featuredImage && visibility.image !== false ? (
        <div className="relative">
          <img src={featuredImage} alt={title} className="h-auto w-full object-cover" />
          {showSaveButton ? (
            <DirectorySaveDropdown
              siteId={siteId!}
              directoryId={directory.id!}
              opacity={resolvedSaveIconOpacity}
              loginPath={loginPath}
              className="absolute right-3 top-3 z-10"
            />
          ) : null}
        </div>
      ) : null}

      <CardSection className={menuLinks.length > 0 && visibility.menuLinks !== false ? "pb-3" : undefined}>
        {visibility.title !== false ? (
          <h1 className="text-3xl font-semibold leading-tight tracking-normal text-foreground">{title}</h1>
        ) : null}

        {(rating || address) ? (
          <div className="mt-5 flex flex-col gap-2 text-sm text-muted-foreground">
            {rating ? (
              <Rating rate={rating} showScore className="[&_svg]:size-4 [&>div]:size-4" />
            ) : null}
            {address ? (
              <div className="flex items-start gap-1.5">
                <MapPin className="mt-0.5 size-4 shrink-0 text-foreground" />
                <span className="min-w-0">{address}</span>
              </div>
            ) : null}
          </div>
        ) : null}

        {introText.trim() && visibility.introText !== false ? (
          <p className="whitespace-pre-line text-base leading-7 text-muted-foreground">{introText}</p>
        ) : null}

        {socialLinks.length > 0 && visibility.socialLinks !== false ? (
          <div className="my-6 flex flex-wrap items-center gap-2">
            {socialLinks.map((link, index) => (
              <SocialLink key={link.id || `${link.platform}-${index}`} link={link} />
            ))}
          </div>
        ) : null}
      </CardSection>

      {menuLinks.length > 0 && visibility.menuLinks !== false ? (
        <div className={cn("pb-5", featuredImage || title || socialLinks.length ? "" : "border-t-0")}>
          {menuLinks.map((link, index) => {
            if (link.type === "claim") {
              return (
                <DirectoryClaimButton
                  key="claim"
                  directoryId={directory.id!}
                  loginPath={loginPath}
                  ownerEditPath={typeof content?.ownerEditPath === "string" ? content.ownerEditPath : "/account"}
                  buttonText={link.label?.trim() || (typeof content?.claimButtonText === "string" ? content.claimButtonText : "Claim Listing")}
                  pendingEmailText={
                    typeof content?.claimPendingEmailText === "string"
                      ? content.claimPendingEmailText
                      : "Check Business Email"
                  }
                  pendingReviewText={
                    typeof content?.claimPendingReviewText === "string"
                      ? content.claimPendingReviewText
                      : "Claim Pending Review"
                  }
                  approvedText={typeof content?.claimApprovedText === "string" ? content.claimApprovedText : "Edit Listing"}
                  rowClassName={ACTION_ROW_CLASS}
                  mutedRowClassName={MUTED_ACTION_ROW_CLASS}
                />
              )
            }

            return <MenuLink key={link.id || `${link.type}-${index}`} link={link} />
          })}
        </div>
      ) : null}
    </Card>
  )
}
