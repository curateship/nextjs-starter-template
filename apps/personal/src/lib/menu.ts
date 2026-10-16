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

const sectionSchema = z.object({
  id: z.string().min(1).max(64),
  title: z.string().trim().max(60),
  links: z.array(linkSchema).max(100),
})

export const menuSchema = z.object({
  version: z.literal(1),
  top: z.array(linkSchema).max(30),
  sections: z.array(sectionSchema).max(30),
})

export type MenuLink = z.infer<typeof linkSchema>
export type MenuSection = z.infer<typeof sectionSchema>
export type Menu = z.infer<typeof menuSchema>

/** Where a link sits: the top bar, or one of the left menu's sections. */
export type Place = { kind: "top" } | { kind: "section"; sectionId: string }

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

export function allLinks(menu: Menu) {
  return [...menu.top, ...menu.sections.flatMap((section) => section.links)]
}

export function placeOf(menu: Menu, linkId: string): Place | null {
  if (menu.top.some((link) => link.id === linkId)) return { kind: "top" }
  const section = menu.sections.find((s) => s.links.some((l) => l.id === linkId))
  return section ? { kind: "section", sectionId: section.id } : null
}

function linksAt(menu: Menu, place: Place) {
  if (place.kind === "top") return menu.top
  return menu.sections.find((section) => section.id === place.sectionId)?.links ?? null
}

function withLinksAt(menu: Menu, place: Place, links: MenuLink[]): Menu {
  if (place.kind === "top") return { ...menu, top: links }
  return {
    ...menu,
    sections: menu.sections.map((section) =>
      section.id === place.sectionId ? { ...section, links } : section
    ),
  }
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
  if (!from) return menu
  const same =
    from.kind === place.kind &&
    (from.kind === "top" || (place.kind === "section" && from.sectionId === place.sectionId))
  if (same) {
    const links = linksAt(menu, from) ?? []
    return withLinksAt(menu, from, links.map((l) => (l.id === link.id ? link : l)))
  }
  if (!linksAt(menu, place)) return menu
  return addLink(removeLink(menu, link.id), place, link)
}

export function removeLink(menu: Menu, linkId: string): Menu {
  return {
    ...menu,
    top: menu.top.filter((link) => link.id !== linkId),
    sections: menu.sections.map((section) => ({
      ...section,
      links: section.links.filter((link) => link.id !== linkId),
    })),
  }
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
