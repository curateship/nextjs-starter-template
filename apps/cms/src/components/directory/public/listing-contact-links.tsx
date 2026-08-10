import * as React from "react"
import { MapPinIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  menuLinkHref,
  menuLinkLabel,
  socialLinkHref,
  type ContactLinks,
} from "@/lib/directory/contact-links"

/**
 * A listing's address, its links and its social profiles.
 *
 * **Every address goes through the builders in `contact-links.ts` and nothing
 * else.** They are the same functions the server cleaned the values with on
 * the way in, and they answer with an empty string for anything that is not a
 * link — a `javascript:` URL is a script, not an address, and a link with
 * nowhere safe to go is simply not drawn.
 */
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
    >
      {children}
    </a>
  )
}

export function ListingContactLinks({ links }: { links: ContactLinks }) {
  const menuLinks = links.menuLinks
    .map((link) => ({ link, href: menuLinkHref(link) }))
    .filter((row) => row.href)
  const socialLinks = links.socialLinks
    .map((link) => ({ link, href: socialLinkHref(link) }))
    .filter((row) => row.href)

  if (!links.address && !menuLinks.length && !socialLinks.length) return null

  return (
    <div className="grid gap-2">
      {links.address ? (
        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <MapPinIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{links.address}</span>
        </p>
      ) : null}

      {menuLinks.length ? (
        <ul className="flex flex-wrap gap-2">
          {menuLinks.map(({ link, href }) => (
            <li key={link.id}>
              <Button asChild variant="outline">
                <OutwardLink href={href}>{menuLinkLabel(link)}</OutwardLink>
              </Button>
            </li>
          ))}
        </ul>
      ) : null}

      {socialLinks.length ? (
        <ul className="flex flex-wrap gap-2">
          {socialLinks.map(({ link, href }) => (
            <li key={link.id}>
              <Button asChild variant="ghost">
                <OutwardLink href={href}>
                  {link.platform || "Profile"}
                </OutwardLink>
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
