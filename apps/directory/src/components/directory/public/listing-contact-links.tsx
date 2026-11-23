import * as React from "react"
import {
  GlobeIcon,
  LinkIcon,
  MailIcon,
  MapPinIcon,
  NavigationIcon,
  PhoneIcon,
} from "lucide-react"

import {
  menuLinkHref,
  menuLinkLabel,
  socialLinkHref,
  type ContactLinks,
  type MenuLinkType,
} from "@/lib/directory/contact-links"
import { focusRing } from "@/lib/layout/focus-ring"

/**
 * A listing's address, its links and its social profiles, as one row each.
 *
 * **Every address goes through the builders in `contact-links.ts` and nothing
 * else.** They are the same functions the server cleaned the values with on
 * the way in, and they answer with an empty string for anything that is not a
 * link — a `javascript:` URL is a script, not an address, and a link with
 * nowhere safe to go is simply not drawn.
 *
 * Rows rather than a row of buttons: this list sits in the narrow column beside
 * the listing, where four outline buttons wrap into a block of chrome. A line
 * with an icon in front of it reads as a phone number and a website, which is
 * what they are.
 */

/** The shape every row in the card shares, links and plain text alike. */
export const LISTING_ROW_CLASS =
  "flex min-h-8 items-center gap-3 px-4 py-1.5 text-sm"

const ICON_FOR: Record<MenuLinkType, typeof PhoneIcon> = {
  phone: PhoneIcon,
  website: GlobeIcon,
  email: MailIcon,
  directions: NavigationIcon,
  custom: LinkIcon,
}

/**
 * A link on somebody else's listing.
 *
 * A website opens in a new tab, the way every outward link in this app does —
 * a visitor who followed a listing to a business's site should still have the
 * directory behind them. `tel:` and `mailto:` deliberately do not: the browser
 * hands those to another program, and a new tab would be left sitting there
 * blank.
 *
 * `nofollow` is on all of them regardless. A listing is somebody else's link on
 * this site's page, and without it a directory becomes a thing worth buying a
 * place on purely to pass ranking along.
 */
function OutwardLink({
  href,
  children,
}: {
  href: string
  children: React.ReactNode
}) {
  const opensInTab = /^https?:/i.test(href)

  return (
    <a
      href={href}
      target={opensInTab ? "_blank" : undefined}
      rel={opensInTab ? "noopener noreferrer nofollow" : "nofollow"}
      className={`${LISTING_ROW_CLASS} hover:bg-accent/40 ${focusRing}`}
    >
      {children}
    </a>
  )
}

export function ListingContactLinks({ links }: { links: ContactLinks }) {
  const menuLinks = links.menuLinks
    .map((link) => ({ link, href: menuLinkHref(link) }))
    .filter((row) => row.href)

  if (!links.address && !menuLinks.length) return null

  return (
    <div className="grid">
      {links.address ? (
        <p className={`${LISTING_ROW_CLASS} text-muted-foreground`}>
          <MapPinIcon className="size-4 shrink-0" aria-hidden="true" />
          <span>{links.address}</span>
        </p>
      ) : null}

      {menuLinks.map(({ link, href }) => {
        const Icon = ICON_FOR[link.type]
        return (
          <OutwardLink key={link.id} href={href}>
            <Icon className="size-4 shrink-0" aria-hidden="true" />
            <span className="min-w-0 truncate">{menuLinkLabel(link)}</span>
          </OutwardLink>
        )
      })}
    </div>
  )
}

/** "instagram" as the site typed it reads as a mistake next to a photo. */
function platformLabel(platform: string) {
  const name = platform.trim()
  if (!name) return "Profile"
  return name.charAt(0).toUpperCase() + name.slice(1)
}

/**
 * The social profiles, drawn over the listing's photo the way the old site
 * draws them. Nothing at all when the listing has none.
 */
export function ListingSocialLinks({
  links,
  className,
}: {
  links: ContactLinks
  className?: string
}) {
  const socialLinks = links.socialLinks
    .map((link) => ({ link, href: socialLinkHref(link) }))
    .filter((row) => row.href)

  if (!socialLinks.length) return null

  return (
    <ul className={className}>
      {socialLinks.map(({ link, href }) => (
        <li key={link.id}>
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className={`flex items-center rounded-full bg-background/80 px-2.5 py-1 text-xs font-medium ${focusRing}`}
          >
            {platformLabel(link.platform)}
          </a>
        </li>
      ))}
    </ul>
  )
}
