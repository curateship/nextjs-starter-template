import { Facebook, Github, Globe, Instagram, Linkedin, Music2, Twitter, type LucideIcon, Youtube } from "lucide-react"
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
import { DirectoryClaimButton } from "@/components/frontend/directories/claim/DirectoryClaimButton"
import { Card, CardSection } from "@/components/ui/card"
import { getQuickLinkIconOrNull } from "@/lib/utils/site-quick-links"
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
  claimAuthPath?: string | null
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
      className="inline-flex h-11 w-11 items-center justify-center rounded-full text-primary transition-colors hover:bg-muted hover:text-primary/80"
    >
      <Icon className="h-7 w-7" />
    </a>
  )
}

function MenuLink({ link }: { link: DirectoryCoreMenuLink }) {
  const href = buildDirectoryCoreMenuHref(link)
  if (!href) return null

  const iconName = link.icon || getDirectoryCoreMenuDefaultIcon(link.type)
  const Icon = getQuickLinkIconOrNull(iconName) || Globe
  const label = getDirectoryCoreMenuLabel(link)

  return (
    <a
      href={href}
      target={isExternalHref(href) ? "_blank" : undefined}
      rel={isExternalHref(href) ? "noopener noreferrer" : undefined}
      className="flex min-h-14 items-center gap-3 px-6 py-3 text-primary transition-colors hover:bg-primary/5 hover:text-primary/85"
    >
      <Icon className="h-5 w-5 shrink-0" />
      <span className="min-w-0 wrap-break-word text-base leading-snug">{label}</span>
    </a>
  )
}

export function DirectoryCoreBlock({ content, directory, claimAuthPath, cardProps }: DirectoryCoreBlockProps) {
  const visibility =
    content?.visibility && typeof content.visibility === "object" ? (content.visibility as Record<string, boolean>) : {}

  if (visibility.hideBlock === true) return null

  const socialLinks = Array.isArray(content?.socialLinks)
    ? content.socialLinks
        .map((link, index) => normalizeDirectoryCoreSocialLink(link, index))
        .filter((link): link is DirectoryCoreSocialLink => !!link)
    : []
  const menuLinks = Array.isArray(content?.menuLinks)
    ? content.menuLinks
        .map((link, index) => normalizeDirectoryCoreMenuLink(link, index))
        .filter((link): link is DirectoryCoreMenuLink => !!link)
    : []
  const title = directory.title || "Directory Listing"
  const featuredImage = visibility.image === false ? "" : resolveMediaUrl(directory.featured_image)
  const showClaimButton = content?.claimEnabled !== false && Boolean(directory.id)
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
        <img src={featuredImage} alt={title} className="h-auto w-full object-cover" />
      ) : null}

      <CardSection>
        {visibility.title !== false ? (
          <h1 className="text-3xl font-semibold leading-tight tracking-normal text-foreground">{title}</h1>
        ) : null}

        {introText.trim() && visibility.introText !== false ? (
          <p className="whitespace-pre-line text-base leading-7 text-muted-foreground">{introText}</p>
        ) : null}

        {socialLinks.length > 0 && visibility.socialLinks !== false ? (
          <div className="flex flex-wrap items-center gap-5 pt-1">
            {socialLinks.map((link, index) => (
              <SocialLink key={link.id || `${link.platform}-${index}`} link={link} />
            ))}
          </div>
        ) : null}
      </CardSection>

      {(menuLinks.length > 0 && visibility.menuLinks !== false) || showClaimButton ? (
        <div className={cn(featuredImage || title || socialLinks.length ? "" : "border-t-0")}>
          {menuLinks.map((link, index) => (
            <MenuLink key={link.id || `${link.type}-${index}`} link={link} />
          ))}
          {showClaimButton ? (
            <DirectoryClaimButton
              directoryId={directory.id!}
              authPath={claimAuthPath}
              ownerEditPath={typeof content?.ownerEditPath === "string" ? content.ownerEditPath : "/account"}
              buttonText={typeof content?.claimButtonText === "string" ? content.claimButtonText : "Claim Listing"}
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
            />
          ) : null}
        </div>
      ) : null}
    </Card>
  )
}
