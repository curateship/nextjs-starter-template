"use client"

import type { ComponentType } from "react"
import Facebook from "lucide-react/dist/esm/icons/facebook.js"
import Github from "lucide-react/dist/esm/icons/github.js"
import Globe from "lucide-react/dist/esm/icons/globe.js"
import Instagram from "lucide-react/dist/esm/icons/instagram.js"
import Linkedin from "lucide-react/dist/esm/icons/linkedin.js"
import Music2 from "lucide-react/dist/esm/icons/music-2.js"
import Twitter from "lucide-react/dist/esm/icons/twitter.js"
import Youtube from "lucide-react/dist/esm/icons/youtube.js"

import { ActionRow, SortableActionRow } from "@/components/admin/structure-builder/ActionRow"

export interface FooterLink {
  text: string
  url: string
  id?: string
}

export interface SocialLink {
  platform: string
  url: string
  id?: string
}

function MediumIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M13.54 12a6.77 6.77 0 1 1-13.54 0a6.77 6.77 0 0 1 13.54 0m7.42 0c0 3.55-1.51 6.42-3.38 6.42S14.2 15.55 14.2 12s1.51-6.42 3.38-6.42s3.38 2.87 3.38 6.42M24 12c0 3.17-.53 5.75-1.19 5.75S21.62 15.17 21.62 12s.53-5.75 1.19-5.75S24 8.83 24 12"
      />
    </svg>
  )
}

function ThreadsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12.186 24h-.007c-3.581-.024-6.334-1.205-8.184-3.509C2.35 18.44 1.5 15.586 1.472 12.01v-.017c.03-3.579.879-6.43 2.525-8.482C5.845 1.205 8.6.024 12.18 0h.014c2.746.02 5.043.725 6.826 2.098 1.677 1.29 2.858 3.13 3.509 5.467l-2.04.569c-1.104-3.96-3.898-5.984-8.304-6.015-2.91.022-5.11.936-6.54 2.717C4.307 6.504 3.616 8.914 3.589 12c.027 3.086.718 5.496 2.057 7.164 1.43 1.783 3.631 2.698 6.54 2.717 2.623-.02 4.358-.631 5.8-2.045 1.647-1.613 1.618-3.593 1.09-4.798-.31-.71-.873-1.3-1.634-1.75-.192 1.352-.622 2.446-1.284 3.272-.886 1.102-2.14 1.704-3.73 1.79-1.202.065-2.361-.218-3.259-.801-1.063-.689-1.685-1.74-1.752-2.964-.065-1.19.408-2.285 1.33-3.082.88-.76 2.119-1.207 3.583-1.291a13.853 13.853 0 0 1 3.02.142c-.126-.742-.375-1.332-.75-1.757-.513-.586-1.308-.883-2.359-.89h-.029c-.844 0-1.992.232-2.721 1.32L7.734 7.847c.98-1.454 2.568-2.256 4.478-2.256h.044c3.194.02 5.097 1.975 5.287 5.388.108.046.216.094.321.142 1.49.7 2.58 1.761 3.154 3.07.797 1.82.871 4.79-1.548 7.158-1.85 1.81-4.094 2.628-7.277 2.65Zm1.003-11.69c-.242 0-.487.007-.739.021-1.836.103-2.98.946-2.916 2.143.067 1.256 1.452 1.839 2.784 1.767 1.224-.065 2.818-.543 3.086-3.71a10.5 10.5 0 0 0-2.215-.221z"
      />
    </svg>
  )
}

function SubstackIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M22.539 8.242H1.46V5.406h21.08v2.836zM1.46 10.812V24L12 18.11 22.54 24V10.812H1.46zM22.54 0H1.46v2.836h21.08V0z"
      />
    </svg>
  )
}

export const SOCIAL_PLATFORM_OPTIONS = [
  { value: "twitter", label: "Twitter", Icon: Twitter },
  { value: "facebook", label: "Facebook", Icon: Facebook },
  { value: "instagram", label: "Instagram", Icon: Instagram },
  { value: "threads", label: "Threads", Icon: ThreadsIcon },
  { value: "linkedin", label: "LinkedIn", Icon: Linkedin },
  { value: "youtube", label: "YouTube", Icon: Youtube },
  { value: "tiktok", label: "TikTok", Icon: Music2 },
  { value: "github", label: "GitHub", Icon: Github },
  { value: "medium", label: "Medium", Icon: MediumIcon },
  { value: "substack", label: "Substack", Icon: SubstackIcon }
] as const

export function createFooterItemId(prefix: "link" | "social") {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function getSocialPlatformMeta(platform?: string): {
  label: string
  Icon: ComponentType<{ className?: string }>
} {
  const option = SOCIAL_PLATFORM_OPTIONS.find((item) => item.value === platform)
  if (option) {
    return { label: option.label, Icon: option.Icon }
  }

  if (!platform) {
    return { label: "Social Link", Icon: Globe }
  }

  return {
    label: platform.charAt(0).toUpperCase() + platform.slice(1),
    Icon: Globe
  }
}

export function SocialPlatformLabel({ platform }: { platform?: string }) {
  const { label, Icon } = getSocialPlatformMeta(platform)

  return (
    <span className="flex items-center gap-2">
      <Icon className="h-4 w-4 shrink-0" />
      <span>{label}</span>
    </span>
  )
}

export function SortableFooterLinkItem({
  link,
  index,
  onEdit,
  onDelete
}: {
  link: FooterLink
  index: number
  onEdit: (index: number) => void
  onDelete: (index: number) => void
}) {
  return (
    <SortableActionRow
      sortableId={link.id!}
      ariaName={link.text || "footer link"}
      title={link.text || "Footer link settings"}
      buttonClassName="max-w-[220px]"
      onEdit={() => onEdit(index)}
      onDelete={() => onDelete(index)}
    >
      <span className="truncate" title={link.text || "Link"}>{link.text || "Link"}</span>
    </SortableActionRow>
  )
}

export function StaticFooterLinkItem({
  link,
  index,
  onEdit,
  onDelete
}: {
  link: FooterLink
  index: number
  onEdit: (index: number) => void
  onDelete: (index: number) => void
}) {
  return (
    <ActionRow
      ariaName={link.text || "footer link"}
      title={link.text || "Footer link settings"}
      buttonClassName="max-w-[220px]"
      onEdit={() => onEdit(index)}
      onDelete={() => onDelete(index)}
    >
      <span className="truncate" title={link.text || "Link"}>{link.text || "Link"}</span>
    </ActionRow>
  )
}

export function SortableSocialLinkItem({
  socialLink,
  index,
  onEdit,
  onDelete
}: {
  socialLink: SocialLink
  index: number
  onEdit: (index: number) => void
  onDelete: (index: number) => void
}) {
  return (
    <SortableActionRow
      sortableId={socialLink.id!}
      ariaName={socialLink.platform || "social link"}
      title={socialLink.platform || "Social link settings"}
      buttonClassName="max-w-[240px]"
      onEdit={() => onEdit(index)}
      onDelete={() => onDelete(index)}
    >
      <SocialPlatformLabel platform={socialLink.platform} />
    </SortableActionRow>
  )
}

export function StaticSocialLinkItem({
  socialLink,
  index,
  onEdit,
  onDelete
}: {
  socialLink: SocialLink
  index: number
  onEdit: (index: number) => void
  onDelete: (index: number) => void
}) {
  return (
    <ActionRow
      ariaName={socialLink.platform || "social link"}
      title={socialLink.platform || "Social link settings"}
      buttonClassName="max-w-[240px]"
      onEdit={() => onEdit(index)}
      onDelete={() => onDelete(index)}
    >
      <SocialPlatformLabel platform={socialLink.platform} />
    </ActionRow>
  )
}
