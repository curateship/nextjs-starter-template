import { z } from "zod"

/**
 * Personal's menu: links in the top bar, and sections of links in the left
 * menu. Each link opens another app's screen in the middle panel. The menu is
 * kept in `data/menu.json` on this Mac (`server/menu-file.ts`), and
 * `workspace/docs/menu.md` explains it.
 */

/** The icons a link may use. Their pictures are in `components/link-icon.tsx`. */
export const LINK_ICONS = [
  "layout-dashboard",
  "list",
  "folder",
  "file-text",
  "newspaper",
  "calendar",
  "users",
  "inbox",
  "chart",
  "store",
  "star",
  "settings",
  "link",
] as const

export type LinkIcon = (typeof LINK_ICONS)[number]

/** The left menu's width in pixels: the same limits and start as Custom Shell's. */
export const DEFAULT_SIDEBAR_WIDTH = 218
export const MIN_SIDEBAR_WIDTH = 144
export const MAX_SIDEBAR_WIDTH = 420

export function clampSidebarWidth(value: number) {
  return Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, Math.round(value)))
}

const appUrl = z
  .string()
  .trim()
  .max(2000)
  .refine((value) => parseAppUrl(value) !== null, {
    message: "Use a full address that starts with http:// or https://",
  })

const linkSchema = z.object({
  id: z.string().min(1).max(64),
  label: z.string().trim().min(1).max(60),
  url: appUrl,
  icon: z.enum(LINK_ICONS),
})

/**
 * A left-menu link may hold sub-links, one level deep, as Custom Shell's menu
 * items do. They fold under it, and the top bar's left end shows them while
 * the link or one of them is open. Top-bar links have none.
 */
const sectionLinkSchema = linkSchema.extend({
  children: z.array(linkSchema).max(50).optional(),
})

const sectionSchema = z.object({
  id: z.string().min(1).max(64),
  title: z.string().trim().max(60),
  links: z.array(sectionLinkSchema).max(100),
})

export const menuSchema = z.object({
  version: z.literal(1),
  top: z.array(linkSchema).max(30),
  sections: z.array(sectionSchema).max(30),
  /** Missing until the menu is first dragged wider or narrower. */
  sidebarWidth: z.number().int().min(MIN_SIDEBAR_WIDTH).max(MAX_SIDEBAR_WIDTH).optional(),
})

export type MenuLink = z.infer<typeof sectionLinkSchema>
export type MenuSection = z.infer<typeof sectionSchema>
export type Menu = z.infer<typeof menuSchema>

/** Where a link sits: the top bar, a left-menu section, or under a left-menu link. */
export type Place =
  | { kind: "top" }
  | { kind: "section"; sectionId: string }
  | { kind: "under"; linkId: string }

export function placeKey(place: Place) {
  if (place.kind === "top") return "top"
  return place.kind === "section" ? `section:${place.sectionId}` : `under:${place.linkId}`
}

/**
 * Whether a link may go to a place. Sub-links go one level deep only, so a
 * link that has its own sub-links stays a left-menu link: it can't go under
 * another link, nor into the top bar, which has no sub-links.
 */
export function canPlace(link: MenuLink, place: Place) {
  if (place.kind === "section") return true
  if (link.children?.length) return false
  return place.kind === "top" || place.linkId !== link.id
}

/** The menu a fresh Mac starts with: the screens wired on 16 Oct 2026. */
export function defaultMenu(): Menu {
  return {
    version: 1,
    top: [],
    sections: [
      {
        id: "section-project",
        title: "Project",
        links: [
          {
            id: "link-project-dashboard",
            label: "My dashboard",
            url: "http://localhost:3020/dashboard",
            icon: "layout-dashboard",
          },
        ],
      },
      {
        id: "section-cms",
        title: "CMS",
        links: [
          {
            id: "link-cms-dashboard",
            label: "Dashboard",
            url: "http://localhost:3015/admin/dashboard",
            icon: "layout-dashboard",
          },
          {
            id: "link-cms-listings",
            label: "Listings",
            url: "http://localhost:3015/admin/listings",
            icon: "list",
          },
        ],
      },
    ],
  }
}

export function newId(prefix: string) {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`
}

/** An address another app's screen may be framed from, or null. */
export function parseAppUrl(value: string) {
  try {
    const url = new URL(value.trim())
    if (url.protocol !== "http:" && url.protocol !== "https:") return null
    if (url.username || url.password) return null
    return url
  } catch {
    return null
  }
}

/**
 * Personal's own address for a screen: the app's host, then its path.
 * `http://localhost:3015/admin/listings` is shown as
 * `/localhost:3015/admin/listings`, so a reload lands on the same screen.
 */
export function personalPath(appUrl: string) {
  const url = parseAppUrl(appUrl)
  if (!url) return "/"
  return `/${url.host}${url.pathname}${url.search}`
}

/**
 * The screen a Personal address points at, or null for Personal's own start
 * page. A local host is reached over http, every other host over https.
 */
export function appUrlFromPersonalPath(pathAndSearch: string) {
  const [, host, ...rest] = pathAndSearch.split("?")[0].split("/")
  if (!host) return null
  const search = pathAndSearch.includes("?")
    ? pathAndSearch.slice(pathAndSearch.indexOf("?"))
    : ""
  const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)
  const url = parseAppUrl(
    `${local ? "http" : "https"}://${host}/${rest.join("/")}${search}`
  )
  return url ? url.href : null
}

/** What the frame loads: the screen, asking its app to draw the panel alone. */
export function frameSrc(appUrl: string) {
  const url = parseAppUrl(appUrl)
  if (!url) return "about:blank"
  url.searchParams.set("panel", "1")
  return url.href
}

/**
 * The link that matches the open screen: the same address, or else the
 * longest link on the same app whose path the screen sits under.
 */
export function activeLinkId(menu: Menu, openUrl: string | null) {
  const open = openUrl ? parseAppUrl(openUrl) : null
  if (!open) return null
  let best: { id: string; length: number } | null = null
  for (const link of allLinks(menu)) {
    const url = parseAppUrl(link.url)
    if (!url || url.origin !== open.origin) continue
    const path = url.pathname.replace(/\/$/, "")
    const exact = url.pathname + url.search === open.pathname + open.search
    const under =
      open.pathname === path || open.pathname.startsWith(`${path}/`)
    if (!exact && !under) continue
    const length = exact ? Number.MAX_SAFE_INTEGER : path.length
    if (!best || length > best.length) best = { id: link.id, length }
  }
  return best?.id ?? null
}

/** Every link, sub-links included. */
export function allLinks(menu: Menu) {
  return [
    ...menu.top,
    ...menu.sections.flatMap((section) =>
      section.links.flatMap((link) => [link, ...(link.children ?? [])])
    ),
  ]
}

function sectionLinks(menu: Menu) {
  return menu.sections.flatMap((section) => section.links)
}

export function placeOf(menu: Menu, linkId: string): Place | null {
  if (menu.top.some((link) => link.id === linkId)) return { kind: "top" }
  const section = menu.sections.find((s) => s.links.some((l) => l.id === linkId))
  if (section) return { kind: "section", sectionId: section.id }
  const parent = sectionLinks(menu).find((l) => l.children?.some((c) => c.id === linkId))
  return parent ? { kind: "under", linkId: parent.id } : null
}

function linksAt(menu: Menu, place: Place): MenuLink[] | null {
  if (place.kind === "top") return menu.top
  if (place.kind === "section") {
    return menu.sections.find((section) => section.id === place.sectionId)?.links ?? null
  }
  const parent = sectionLinks(menu).find((link) => link.id === place.linkId)
  return parent ? (parent.children ?? []) : null
}

function withLinksAt(menu: Menu, place: Place, links: MenuLink[]): Menu {
  if (place.kind === "top") return { ...menu, top: links }
  if (place.kind === "section") {
    return {
      ...menu,
      sections: menu.sections.map((section) =>
        section.id === place.sectionId ? { ...section, links } : section
      ),
    }
  }
  return {
    ...menu,
    sections: menu.sections.map((section) => ({
      ...section,
      links: section.links.map((link) => {
        if (link.id !== place.linkId) return link
        // The last sub-link gone leaves a plain link, not an empty list.
        const { children: _gone, ...plain } = link
        return links.length ? { ...link, children: links } : plain
      }),
    })),
  }
}

/**
 * The top bar's left end, as Custom Shell's mirrors its menu: the open
 * left-menu link and its sub-links, when the open screen is that link or one
 * of them. Null when the open screen has no sub-links around it.
 */
export function subLinksOf(menu: Menu, activeId: string | null) {
  if (!activeId) return null
  const parent = sectionLinks(menu).find(
    (link) =>
      link.children?.length &&
      (link.id === activeId || link.children.some((child) => child.id === activeId))
  )
  return parent ? [parent, ...(parent.children ?? [])] : null
}

/** Adds a link at the end of a place. */
export function addLink(menu: Menu, place: Place, link: MenuLink): Menu {
  const links = linksAt(menu, place)
  return links ? withLinksAt(menu, place, [...links, link]) : menu
}

/**
 * Saves an edited link. A link moved to another place goes to the end of it;
 * one that stays keeps its position.
 */
export function updateLink(menu: Menu, link: MenuLink, place: Place): Menu {
  const from = placeOf(menu, link.id)
  if (!from || !canPlace(link, place)) return menu
  if (placeKey(from) === placeKey(place)) {
    const links = linksAt(menu, from) ?? []
    return withLinksAt(menu, from, links.map((l) => (l.id === link.id ? link : l)))
  }
  if (!linksAt(menu, place)) return menu
  return addLink(removeLink(menu, link.id), place, link)
}

/** Removes a link, and its sub-links with it. */
export function removeLink(menu: Menu, linkId: string): Menu {
  const place = placeOf(menu, linkId)
  const links = place ? linksAt(menu, place) : null
  if (!place || !links) return menu
  return withLinksAt(menu, place, links.filter((link) => link.id !== linkId))
}

/** Moves a link to where another link in the same place was dropped. */
export function moveLink(menu: Menu, place: Place, fromId: string, toId: string): Menu {
  const links = linksAt(menu, place)
  if (!links) return menu
  const from = links.findIndex((link) => link.id === fromId)
  const to = links.findIndex((link) => link.id === toId)
  if (from === -1 || to === -1 || from === to) return menu
  const next = [...links]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return withLinksAt(menu, place, next)
}

export function addSection(menu: Menu, section: MenuSection): Menu {
  return { ...menu, sections: [...menu.sections, section] }
}

export function renameSection(menu: Menu, sectionId: string, title: string): Menu {
  return {
    ...menu,
    sections: menu.sections.map((section) =>
      section.id === sectionId ? { ...section, title: title.trim().slice(0, 60) } : section
    ),
  }
}

export function removeSection(menu: Menu, sectionId: string): Menu {
  return { ...menu, sections: menu.sections.filter((section) => section.id !== sectionId) }
}
