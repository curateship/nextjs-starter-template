import {
  buildDirectoryCoreMenuHref,
  buildDirectoryCoreUrlHref,
  getDirectoryCoreMenuDefaultIcon,
  getDirectoryCoreMenuLabel,
  normalizeDirectoryCoreMenuLink,
  normalizeDirectoryCoreSocialLink,
  type DirectoryCoreMenuLink,
  type DirectoryCoreSocialLink
} from "@/lib/actions/directories/directory-core"
import { DirectoryClaimButton } from "@/components/frontend/directories/claim/DirectoryClaimButton"
import { DirectorySaveDropdown } from "@/components/frontend/directories/DirectorySaveDropdown"
import { FeaturedBadge } from "@/components/frontend/directories/FeaturedBadge"
import { Rating } from "@/components/shadcnblocks/rating"
import { Card } from "@/components/ui/card"
import { CardSection } from "@/components/shared/card-sections"
import { renderQuickLinkIcon } from "@/lib/utils/site-quick-links"
import { resolveMediaUrl } from "@/lib/utils/media-url"
import { getSocialMeta } from "@/lib/utils/social-icons"
import { cn } from "@/lib/utils/tailwind"
import type { HTMLAttributes } from "react"

interface DirectoryCoreBlockProps {
  content?: Record<string, any>
  directory: {
    id?: string | null
    title?: string | null
    slug?: string | null
    featured_image?: string | null
  }
  loginPath?: string
  siteId?: string | null
  isFeatured?: boolean
  cardProps?: HTMLAttributes<HTMLDivElement>
}

const ACTION_ROW_CLASS = "flex min-h-8 items-center gap-3 px-6 py-2 text-primary transition-colors hover:bg-primary/5 hover:text-primary/85"
const MUTED_ACTION_ROW_CLASS = "flex min-h-8 items-center gap-3 px-6 py-2 text-muted-foreground"

function isExternalHref(href: string) {
  return /^https?:\/\//i.test(href)
}

function SocialLink({ link, className }: { link: DirectoryCoreSocialLink; className?: string }) {
  const href = buildDirectoryCoreUrlHref(link.url)
  if (!href) return null

  const { label, Icon } = getSocialMeta(link.platform)

  return (
    <a
      href={href}
      target={isExternalHref(href) ? "_blank" : undefined}
      rel={isExternalHref(href) ? "noopener noreferrer" : undefined}
      aria-label={label}
      className={cn("inline-flex items-center justify-center text-neutral-500 transition-colors hover:text-black", className)}
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

export function DirectoryCoreBlock({ content, directory, loginPath, siteId, isFeatured = false, cardProps }: DirectoryCoreBlockProps) {
  const visibility =
    content?.visibility && typeof content.visibility === "object" ? (content.visibility as Record<string, boolean>) : {}

  if (visibility.hideBlock === true) return null

  const socialLinks = Array.isArray(content?.socialLinks)
    ? content.socialLinks
        .map((link, index) => normalizeDirectoryCoreSocialLink(link, index))
        .filter((link): link is DirectoryCoreSocialLink => !!link)
    : []
  const configuredMenuLinks = Array.isArray(content?.menuLinks)
    ? content.menuLinks
        .map((link, index) => normalizeDirectoryCoreMenuLink(link, index))
        .filter((link): link is DirectoryCoreMenuLink => !!link)
    : []
  const valueMenuLinks = configuredMenuLinks.filter((link, index, links) => {
    if (link.type === "claim" && links.findIndex((item) => item.type === "claim") !== index) return false
    if (link.type === "claim") return Boolean(directory.id) && content?.claimEnabled !== false
    return Boolean(link.value?.trim())
  })
  const hasClaimLink = valueMenuLinks.some((link) => link.type === "claim")
  const menuLinks = !hasClaimLink && directory.id && content?.claimEnabled !== false
    ? [
        ...valueMenuLinks,
        {
          id: "claim-action",
          type: "claim" as const,
          label: typeof content?.claimButtonText === "string" ? content.claimButtonText : "Claim Listing",
          icon: "building" as const,
        },
      ]
    : valueMenuLinks
  const title = directory.title || "Directory Listing"
  const hasContentRating = typeof content?.rating === "number" || typeof content?.rating === "string"
  const ratingValue = hasContentRating ? Number(content.rating) : Number.NaN
  const rating = Number.isFinite(ratingValue) && ratingValue > 0 ? Math.min(5, ratingValue) : null
  const showRating = visibility.rating !== false
  const featuredImage = visibility.image === false ? "" : resolveMediaUrl(directory.featured_image)
  const showSaveButton = Boolean(siteId && directory.id && featuredImage && visibility.image !== false)
  const showSocialLinks = socialLinks.length > 0 && visibility.socialLinks !== false
  const saveIconOpacityNumber = Number(content?.saveIconOpacity)
  const resolvedSaveIconOpacity = Math.min(100, Math.max(0, Number.isFinite(saveIconOpacityNumber) ? saveIconOpacityNumber : 100))
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
          {showSocialLinks ? (
            <div className="absolute bottom-3 right-3 z-10 flex flex-wrap items-center justify-end gap-2">
              {socialLinks.map((link, index) => (
                <SocialLink
                  key={link.id || `${link.platform}-${index}`}
                  link={link}
                  className="rounded-full bg-muted/10 p-2 text-white shadow-sm hover:bg-muted/70"
                />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <CardSection className={menuLinks.length > 0 && visibility.menuLinks !== false ? "pb-3" : undefined}>
        {isFeatured ? <FeaturedBadge className="mb-2" /> : null}
        {visibility.title !== false ? (
          <h1 className="text-3xl font-semibold leading-tight tracking-normal text-foreground">{title}</h1>
        ) : null}

        {showRating && rating ? (
          <div className="mb-4 mt-3 flex flex-col gap-2 text-sm text-muted-foreground">
            <Rating rate={rating} showScore className="[&_svg]:size-4 [&>div]:size-4" />
          </div>
        ) : null}

        {showSocialLinks && !featuredImage ? (
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
