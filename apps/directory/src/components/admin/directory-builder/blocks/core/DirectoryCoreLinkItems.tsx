"use client"

import type { ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ShellIconPickerField } from "@/components/admin/layout/settings/ShellIconPicker"
import { useSortableRow } from "@/components/admin/layout/builder/use-sortable-row"
import type { LucideIcon } from "lucide-react"
import Facebook from "lucide-react/dist/esm/icons/facebook.js"
import Github from "lucide-react/dist/esm/icons/github.js"
import Globe from "lucide-react/dist/esm/icons/globe.js"
import GripVertical from "lucide-react/dist/esm/icons/grip-vertical.js"
import Instagram from "lucide-react/dist/esm/icons/instagram.js"
import Linkedin from "lucide-react/dist/esm/icons/linkedin.js"
import Music2 from "lucide-react/dist/esm/icons/music-2.js"
import Plus from "lucide-react/dist/esm/icons/plus.js"
import Trash2 from "lucide-react/dist/esm/icons/trash-2.js"
import Twitter from "lucide-react/dist/esm/icons/twitter.js"
import Youtube from "lucide-react/dist/esm/icons/youtube.js"
import {
  DIRECTORY_CORE_MENU_LINK_TYPES,
  getDirectoryCoreMenuDefaultIcon,
  getDirectoryCoreMenuTypeLabel,
  getDirectoryCoreMenuValuePlaceholder,
  type DirectoryCoreMenuLink,
  type DirectoryCoreMenuLinkType,
  type DirectoryCoreSocialLink,
} from "@/lib/actions/directories/directory-core"

const ACTION_BUTTON_CLASS =
  "h-9 w-9 shrink-0 rounded-md p-0 text-foreground hover:bg-muted/50"

export const SOCIAL_PLATFORM_OPTIONS = [
  { value: "facebook", label: "Facebook", Icon: Facebook },
  { value: "instagram", label: "Instagram", Icon: Instagram },
  { value: "twitter", label: "Twitter", Icon: Twitter },
  { value: "linkedin", label: "LinkedIn", Icon: Linkedin },
  { value: "youtube", label: "YouTube", Icon: Youtube },
  { value: "tiktok", label: "TikTok", Icon: Music2 },
  { value: "github", label: "GitHub", Icon: Github },
] as const

export function createCoreItemId(prefix: "menu" | "social") {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function getSocialPlatformMeta(platform?: string): {
  label: string
  Icon: LucideIcon
} {
  const option = SOCIAL_PLATFORM_OPTIONS.find((item) => item.value === platform)
  if (option) return { label: option.label, Icon: option.Icon }

  if (!platform) return { label: "Social Link", Icon: Globe }
  return {
    label: platform.charAt(0).toUpperCase() + platform.slice(1),
    Icon: Globe,
  }
}

function SocialPlatformLabel({ platform }: { platform?: string }) {
  const { label, Icon } = getSocialPlatformMeta(platform)

  return (
    <span className="flex items-center gap-2">
      <Icon className="h-4 w-4 shrink-0" />
      <span>{label}</span>
    </span>
  )
}

function SocialLinkFields({
  dragHandle,
  socialLink,
  index,
  onChange,
  onDelete,
}: {
  dragHandle: ReactNode
  socialLink: DirectoryCoreSocialLink
  index: number
  onChange: (index: number, socialLink: DirectoryCoreSocialLink) => void
  onDelete: (index: number) => void
}) {
  return (
    <div className="grid gap-3 rounded-lg border bg-background p-3 sm:grid-cols-[auto_minmax(150px,220px)_minmax(0,1fr)_auto] sm:items-center">
      <div className="flex h-10 items-center">{dragHandle}</div>

      <div>
        <Select
          value={socialLink.platform || SOCIAL_PLATFORM_OPTIONS[0].value}
          onValueChange={(value) => onChange(index, { ...socialLink, platform: value })}
        >
          <SelectTrigger size="button" className="w-full" aria-label="Social platform">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SOCIAL_PLATFORM_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                <SocialPlatformLabel platform={option.value} />
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="min-w-0">
        <Input
          value={socialLink.url || ""}
          onChange={(event) => onChange(index, { ...socialLink, url: event.target.value })}
          placeholder="https://instagram.com/example"
          aria-label="Social link URL"
        />
      </div>

      <div className="flex h-10 items-center">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => onDelete(index)}
          className={ACTION_BUTTON_CLASS}
          aria-label={`Delete ${socialLink.platform || "social link"}`}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

export function SortableSocialLinkItem({
  socialLink,
  index,
  onChange,
  onDelete,
}: {
  socialLink: DirectoryCoreSocialLink
  index: number
  onChange: (index: number, socialLink: DirectoryCoreSocialLink) => void
  onDelete: (index: number) => void
}) {
  const { attributes, listeners, setNodeRef, style, isDragging } = useSortableRow(socialLink.id!)

  return (
    <div ref={setNodeRef} style={style}>
      <SocialLinkFields
        dragHandle={
          <button
            type="button"
            {...attributes}
            {...listeners}
            className="flex h-9 w-9 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
            aria-label={`Reorder ${socialLink.platform || "social link"}`}
          >
            <GripVertical className="h-4 w-4" />
          </button>
        }
        socialLink={socialLink}
        index={index}
        onChange={onChange}
        onDelete={onDelete}
      />
    </div>
  )
}

export function StaticSocialLinkItem({
  socialLink,
  index,
  onChange,
  onDelete,
}: {
  socialLink: DirectoryCoreSocialLink
  index: number
  onChange: (index: number, socialLink: DirectoryCoreSocialLink) => void
  onDelete: (index: number) => void
}) {
  return (
    <SocialLinkFields
      dragHandle={
        <div className="flex h-9 w-9 shrink-0 items-center justify-center text-muted-foreground">
          <GripVertical className="h-4 w-4" />
        </div>
      }
      socialLink={socialLink}
      index={index}
      onChange={onChange}
      onDelete={onDelete}
    />
  )
}

function MenuLinkFields({
  dragHandle,
  menuLink,
  index,
  onChange,
  onDelete,
}: {
  dragHandle: ReactNode
  menuLink: DirectoryCoreMenuLink
  index: number
  onChange: (index: number, menuLink: DirectoryCoreMenuLink) => void
  onDelete: (index: number) => void
}) {
  const updateType = (type: DirectoryCoreMenuLinkType) => {
    onChange(index, {
      ...menuLink,
      type,
      value: type === "claim" ? "" : menuLink.value,
    })
  }

  return (
    <div className="grid gap-3 rounded-lg border bg-background p-3 sm:grid-cols-[auto_auto_minmax(140px,180px)_minmax(140px,1fr)_minmax(180px,1.5fr)_auto] sm:items-center">
      <div className="flex h-10 items-center">{dragHandle}</div>

      <ShellIconPickerField
        compact
        allowEmpty={false}
        value={menuLink.icon || getDirectoryCoreMenuDefaultIcon(menuLink.type)}
        onChange={(icon) => onChange(index, { ...menuLink, icon })}
      />

      <div>
        <Select value={menuLink.type} onValueChange={(value) => updateType(value as DirectoryCoreMenuLinkType)}>
          <SelectTrigger size="button" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DIRECTORY_CORE_MENU_LINK_TYPES.map((type) => (
              <SelectItem key={type} value={type}>
                {getDirectoryCoreMenuTypeLabel(type)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="min-w-0">
        <Input
          value={menuLink.label || ""}
          onChange={(event) => onChange(index, { ...menuLink, label: event.target.value })}
          placeholder={getDirectoryCoreMenuTypeLabel(menuLink.type)}
          aria-label="Menu link label"
        />
      </div>

      {menuLink.type !== "claim" ? (
        <div className="min-w-0">
          <Input
            value={menuLink.value || ""}
            onChange={(event) => onChange(index, { ...menuLink, value: event.target.value })}
            placeholder={getDirectoryCoreMenuValuePlaceholder(menuLink.type)}
            aria-label="Menu link value"
          />
        </div>
      ) : (
        <div />
      )}

      <div className="flex h-10 items-center">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => onDelete(index)}
          className={ACTION_BUTTON_CLASS}
          aria-label={`Delete ${menuLink.label || "menu link"}`}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

export function SortableMenuLinkItem({
  menuLink,
  index,
  onChange,
  onDelete,
}: {
  menuLink: DirectoryCoreMenuLink
  index: number
  onChange: (index: number, menuLink: DirectoryCoreMenuLink) => void
  onDelete: (index: number) => void
}) {
  const { attributes, listeners, setNodeRef, style, isDragging } = useSortableRow(menuLink.id!)

  return (
    <div ref={setNodeRef} style={style}>
      <MenuLinkFields
        dragHandle={
          <button
            type="button"
            {...attributes}
            {...listeners}
            className="flex h-9 w-9 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
            aria-label={`Reorder ${menuLink.label || "menu link"}`}
          >
            <GripVertical className="h-4 w-4" />
          </button>
        }
        menuLink={menuLink}
        index={index}
        onChange={onChange}
        onDelete={onDelete}
      />
    </div>
  )
}

export function StaticMenuLinkItem({
  menuLink,
  index,
  onChange,
  onDelete,
}: {
  menuLink: DirectoryCoreMenuLink
  index: number
  onChange: (index: number, menuLink: DirectoryCoreMenuLink) => void
  onDelete: (index: number) => void
}) {
  return (
    <MenuLinkFields
      dragHandle={
        <div className="flex h-9 w-9 shrink-0 items-center justify-center text-muted-foreground">
          <GripVertical className="h-4 w-4" />
        </div>
      }
      menuLink={menuLink}
      index={index}
      onChange={onChange}
      onDelete={onDelete}
    />
  )
}

export function MenuAddLinkButton({ onClick }: { onClick: () => void }) {
  return (
    <Button type="button" variant="outline" onClick={onClick} className="h-8 w-fit justify-self-start gap-2 px-3 shadow-none">
      <Plus className="h-4 w-4" />
      Add Link
    </Button>
  )
}
