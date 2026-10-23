import { PlusIcon, XIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  MENU_LINK_TYPES,
  menuTypeLabel,
  menuTypePlaceholder,
  type MenuLink,
  type MenuLinkType,
  type SocialLink,
} from "@/lib/directory/contact-links"

/**
 * The edit form's rows for a listing's links: typed links (phone, website,
 * email, directions, custom) and social profiles. Rows the admin leaves blank
 * are dropped by the server's cleaner on save, so an abandoned empty row costs
 * nothing.
 */

let rowCounter = 0
function freshRowId(prefix: string) {
  rowCounter += 1
  return `${prefix}-new-${rowCounter}`
}

function newMenuLink(): MenuLink {
  return { id: freshRowId("menu"), type: "phone", label: "", value: "" }
}

function newSocialLink(): SocialLink {
  return { id: freshRowId("social"), platform: "", url: "" }
}

export function MenuLinksFields({
  links,
  disabled,
  onChange,
}: {
  links: MenuLink[]
  disabled: boolean
  onChange: (links: MenuLink[]) => void
}) {
  const update = (id: string, patch: Partial<MenuLink>) =>
    onChange(links.map((link) => (link.id === id ? { ...link, ...patch } : link)))

  return (
    <div className="grid gap-4">
      {links.map((link) => (
        <div
          key={link.id}
          className="flex flex-col gap-4 sm:flex-row sm:items-start"
        >
          <Select
            value={link.type}
            disabled={disabled}
            onValueChange={(value) =>
              update(link.id, { type: value as MenuLinkType })
            }
          >
            <SelectTrigger
              className="w-full sm:w-fit"
              aria-label="What kind of link this is"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MENU_LINK_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {menuTypeLabel(type)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="sm:flex-1">
            <Input
              value={link.value}
              placeholder={menuTypePlaceholder(link.type)}
              disabled={disabled}
              aria-label={`${menuTypeLabel(link.type)} value`}
              onChange={(event) => update(link.id, { value: event.target.value })}
            />
          </div>
          <div className="sm:w-40">
            <Input
              value={link.label}
              placeholder="Label (optional)"
              disabled={disabled}
              aria-label={`${menuTypeLabel(link.type)} label`}
              onChange={(event) => update(link.id, { label: event.target.value })}
            />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={disabled}
            aria-label="Remove this link"
            onClick={() => onChange(links.filter((row) => row.id !== link.id))}
          >
            <XIcon className="size-4" />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        className="w-fit"
        disabled={disabled}
        onClick={() => onChange([...links, newMenuLink()])}
      >
        <PlusIcon className="size-4" />
        Add link
      </Button>
    </div>
  )
}

export function SocialLinksFields({
  links,
  disabled,
  onChange,
}: {
  links: SocialLink[]
  disabled: boolean
  onChange: (links: SocialLink[]) => void
}) {
  const update = (id: string, patch: Partial<SocialLink>) =>
    onChange(links.map((link) => (link.id === id ? { ...link, ...patch } : link)))

  return (
    <div className="grid gap-4">
      {links.map((link) => (
        <div
          key={link.id}
          className="flex flex-col gap-4 sm:flex-row sm:items-start"
        >
          <div className="sm:w-40">
            <Input
              value={link.platform}
              placeholder="Instagram"
              disabled={disabled}
              aria-label="Social platform"
              onChange={(event) =>
                update(link.id, { platform: event.target.value })
              }
            />
          </div>
          <div className="sm:flex-1">
            <Input
              value={link.url}
              placeholder="instagram.com/joesdiner"
              disabled={disabled}
              aria-label="Profile address"
              onChange={(event) => update(link.id, { url: event.target.value })}
            />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={disabled}
            aria-label="Remove this profile"
            onClick={() => onChange(links.filter((row) => row.id !== link.id))}
          >
            <XIcon className="size-4" />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        className="w-fit"
        disabled={disabled}
        onClick={() => onChange([...links, newSocialLink()])}
      >
        <PlusIcon className="size-4" />
        Add profile
      </Button>
    </div>
  )
}
