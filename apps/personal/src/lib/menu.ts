import { z } from "zod"

/**
 * Personal's menu: sections of links in the left menu, and a list of links
 * at its bottom (stored as `top`, from when they sat in a top bar). Each link
 * opens another app's screen in the middle panel. The menu is kept in
 * `data/menu.json` on this Mac (`server/menu-file.ts`), and
 * `workspace/docs/menu.md` explains it.
 */

/**
 * A link's icon: any Lucide icon, kept by its name ("calendar", "octagon-x"),
 * or none. The first menus also saved "chart", which still draws a chart. The
 * pictures are drawn in `components/link-icon.tsx`.
 */
export type LinkIcon = string

/** Where a link opens: the middle panel, or a tab of its own. */
export const LINK_OPENS = ["panel", "tab"] as const
export type LinkOpens = (typeof LINK_OPENS)[number]

/** The left menu's width in pixels: the same limits and start as Custom Shell's. */
export const DEFAULT_SIDEBAR_WIDTH = 218
export const MIN_SIDEBAR_WIDTH = 144
export const MAX_SIDEBAR_WIDTH = 420
/** The widest app menu Personal will hide, in the app's own pixels. */
export const MAX_APP_MENU_WIDTH = 600

/**
 * The left menu's shade, on the same scale as the apps' Settings -> Styling ->
 * Left menu shade: 0% is the page behind the cards, 100% is a card, and 50% is
 * the theme's own. The same number gives the same grey here and in an app.
 */
export const MIN_MENU_SHADE = 0
export const MAX_MENU_SHADE = 100
export const DEFAULT_MENU_SHADE = 50

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
  /** A Lucide icon's name. Missing means the link shows no icon. */
  icon: z
    .string()
    .max(64)
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    .optional(),
  /**
   * Where the link opens: the middle panel, or a tab of its own for a site
   * that refuses to be framed. Missing means the panel.
   */
  opens: z.enum(LINK_OPENS).optional(),
})

/**
 * A left-menu link may hold sub-links, one level deep, as Custom Shell's menu
 * items do. They fold under it. The links at the bottom of the menu have none.
 */
const sectionLinkSchema = linkSchema.extend({
  children: z.array(linkSchema).max(50).optional(),
})

const sectionSchema = z.object({
  id: z.string().min(1).max(64),
  title: z.string().trim().max(60),
  links: z.array(sectionLinkSchema).max(100),
})

/** The name Personal shows when none is chosen. */
export const DEFAULT_BRAND_NAME = "Personal"

/** The largest logo, as the picture's text in the menu file: about a 190 KB image. */
export const MAX_LOGO_CHARS = 256 * 1024

/**
 * A logo picture kept inside the menu file as a data address, so it travels
 * with the menu. Only the picture kinds a browser shows in an `<img>`, where
 * an SVG's scripts never run.
 */
const logoSchema = z
  .string()
  .max(MAX_LOGO_CHARS)
  .regex(/^data:image\/(png|jpeg|webp|gif|svg\+xml);base64,[A-Za-z0-9+/=]+$/)

/**
 * The logo row at the top of the left menu: its name, its picture, and the
 * screen it opens. Missing means "Personal", the Personal logo, and the empty
 * start page.
 */
const brandSchema = z.object({
  name: z.string().trim().min(1).max(40),
  /** Missing means the Personal logo. */
  logo: logoSchema.optional(),
  /** Missing means Personal's start page. */
  url: appUrl.optional(),
})

export type Brand = z.infer<typeof brandSchema>

export const menuSchema = z.object({
  version: z.literal(1),
  top: z.array(linkSchema).max(30),
  sections: z.array(sectionSchema).max(30),
  /** Missing until the menu is first dragged wider or narrower. */
  sidebarWidth: z.number().int().min(MIN_SIDEBAR_WIDTH).max(MAX_SIDEBAR_WIDTH).optional(),
  /**
   * The left menu's shade in percent. Missing is the theme's 50%. It replaced
   * `sidebarShade` (10 darker to 10 lighter) on 30 Oct 2026, whose numbers
   * meant something else, so a file saved before then loads at the default.
   */
  menuShade: z.number().int().min(MIN_MENU_SHADE).max(MAX_MENU_SHADE).optional(),
  /** The link Personal opens on a visit to its bare address. Missing means the empty start page. */
  startLinkId: z.string().min(1).max(64).optional(),
  /**
   * The link whose screen stays loaded once opened, however many other screens
   * are opened after it. Missing means none.
   */
  stayLoadedLinkId: z.string().min(1).max(64).optional(),
  /**
   * The links "Pinned" shows at the top of the left menu, in the order they
   * were pinned. Missing means none.
   */
  pinnedLinkIds: z.array(z.string().min(1).max(64)).max(100).optional(),
  /** The logo row's name, picture and link. Missing means Personal's own. */
  brand: brandSchema.optional(),
  /**
   * How much of each app's left edge the panel hides, by host, so an app's own
   * left menu sits out of sight. Personal can't read another site's layout,
   * so the width is dragged into place once per app. Missing hides nothing.
   */
  appMenuWidths: z
    .record(z.string().min(1).max(253), z.number().int().min(1).max(MAX_APP_MENU_WIDTH))
    .refine((widths) => Object.keys(widths).length <= 100, "Too many apps.")
    .optional(),
})

export type MenuLink = z.infer<typeof sectionLinkSchema>
export type MenuSection = z.infer<typeof sectionSchema>
export type Menu = z.infer<typeof menuSchema>

/**
 * Where a link sits: the list at the bottom of the menu, a section, or under a
 * section's link. The bottom list keeps the name `top` it was saved under.
 */
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
 * another link, nor into the bottom list, which has no sub-links.
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

export function opensInTab(link: Pick<MenuLink, "opens">) {
  return link.opens === "tab"
}

/**
 * The link that matches the open screen: the same address, or else the
 * longest link on the same app whose path the screen sits under. A link that
 * opens in its own tab never matches, since it never fills the panel.
 */
export function activeLinkId(menu: Menu, openUrl: string | null) {
  const open = openUrl ? parseAppUrl(openUrl) : null
  if (!open) return null
  let best: { id: string; length: number } | null = null
  for (const link of allLinks(menu)) {
    if (opensInTab(link)) continue
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

/** Whether a panel link goes to exactly this screen, so pinning it again would add a copy. */
export function hasLinkTo(menu: Menu, openUrl: string) {
  const open = parseAppUrl(openUrl)
  if (!open) return false
  return allLinks(menu).some(
    (link) => !opensInTab(link) && parseAppUrl(link.url)?.href === open.href
  )
}

/**
 * The menu's name for a screen: the label of the link it belongs to, the
 * same one `activeLinkId` picks, or "" when no link does.
 */
export function screenName(menu: Menu, url: string) {
  const id = activeLinkId(menu, url)
  return (id && allLinks(menu).find((link) => link.id === id)?.label) || ""
}

/** How many of the app's own pixels the panel hides at its left edge, for the screen at `url`. */
export function appMenuWidth(menu: Menu, url: string) {
  const host = parseAppUrl(url)?.host
  return (host && menu.appMenuWidths?.[host]) || 0
}

/** Saves how much of an app's left edge to hide. 0 shows its whole page again. */
export function setAppMenuWidth(menu: Menu, host: string, width: number): Menu {
  const clamped = Math.round(Math.min(Math.max(width, 0), MAX_APP_MENU_WIDTH))
  const { [host]: _old, ...rest } = menu.appMenuWidths ?? {}
  const widths = clamped ? { ...rest, [host]: clamped } : rest
  if ((menu.appMenuWidths?.[host] ?? 0) === clamped) return menu
  const { appMenuWidths: _all, ...plain } = menu
  return Object.keys(widths).length ? { ...plain, appMenuWidths: widths } : plain
}

/** Saves the left menu's shade. 50% goes back to the theme's and leaves the file without it. */
export function setMenuShade(menu: Menu, shade: number): Menu {
  const clamped = Math.round(Math.min(Math.max(shade, MIN_MENU_SHADE), MAX_MENU_SHADE))
  if ((menu.menuShade ?? DEFAULT_MENU_SHADE) === clamped) return menu
  const { menuShade: _old, ...rest } = menu
  return clamped === DEFAULT_MENU_SHADE ? rest : { ...rest, menuShade: clamped }
}

/** What the cog calls a shade. */
export function menuShadeLabel(shade: number) {
  return shade === DEFAULT_MENU_SHADE ? "Default" : `${shade}%`
}

/** The menu's fields that each name one panel link: the start screen, and the screen that stays loaded. */
type OneLink = "startLinkId" | "stayLoadedLinkId"

/** The link a field names, if it still exists and fills the panel. */
function oneLink(menu: Menu, field: OneLink) {
  const link = allLinks(menu).find((l) => l.id === menu[field])
  return link && !opensInTab(link) ? link : null
}

/** Makes a link the one a field names, or stops it being that. There is only ever one. */
function setOneLink(menu: Menu, field: OneLink, linkId: string, on: boolean): Menu {
  if (on) return menu[field] === linkId ? menu : { ...menu, [field]: linkId }
  if (menu[field] !== linkId) return menu
  const { [field]: _off, ...rest } = menu
  return rest
}

/** The link Personal opens on its bare address. */
export function startLink(menu: Menu) {
  return oneLink(menu, "startLinkId")
}

export function setStartLink(menu: Menu, linkId: string, start: boolean): Menu {
  return setOneLink(menu, "startLinkId", linkId, start)
}

/** The link whose screen stays loaded once opened. */
export function stayLoadedLink(menu: Menu) {
  return oneLink(menu, "stayLoadedLinkId")
}

export function setStayLoadedLink(menu: Menu, linkId: string, stay: boolean): Menu {
  return setOneLink(menu, "stayLoadedLinkId", linkId, stay)
}

/** The pinned links, in the order they were pinned, skipping any since deleted. */
export function pinnedLinks(menu: Menu) {
  const links = allLinks(menu)
  return (menu.pinnedLinkIds ?? []).flatMap((id) => links.find((link) => link.id === id) ?? [])
}

/** Puts the pinned list back, leaving the file without it once it is empty. */
function withPinnedIds(menu: Menu, ids: string[]): Menu {
  const { pinnedLinkIds: _old, ...rest } = menu
  return ids.length ? { ...rest, pinnedLinkIds: ids } : rest
}

/** Pins a link at the end of "Pinned", or unpins it. The link stays in its section either way. */
export function setPinned(menu: Menu, linkId: string, pinned: boolean): Menu {
  const ids = menu.pinnedLinkIds ?? []
  if (ids.includes(linkId) === pinned) return menu
  return withPinnedIds(menu, pinned ? [...ids, linkId] : ids.filter((id) => id !== linkId))
}

/** Moves a pinned link to where another pinned link is, in Pinned's order only. */
export function movePinned(menu: Menu, fromId: string, toId: string): Menu {
  const ids = menu.pinnedLinkIds ?? []
  const from = ids.indexOf(fromId)
  const to = ids.indexOf(toId)
  if (from === -1 || to === -1 || from === to) return menu
  const next = [...ids]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return withPinnedIds(menu, next)
}

/** Forgets the start link, the stay-loaded link and pins once their links are no longer in the menu. */
function withoutLostLinks(menu: Menu): Menu {
  const ids = new Set(allLinks(menu).map((link) => link.id))
  let next = menu
  for (const field of ["startLinkId", "stayLoadedLinkId"] as const) {
    const id = next[field]
    if (id && !ids.has(id)) next = setOneLink(next, field, id, false)
  }
  const pinned = next.pinnedLinkIds ?? []
  if (pinned.some((id) => !ids.has(id))) {
    next = withPinnedIds(next, pinned.filter((id) => ids.has(id)))
  }
  return next
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

/** A place's links, or null when the place doesn't exist. */
export function linksAt(menu: Menu, place: Place): MenuLink[] | null {
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
  return withoutLostLinks(withLinksAt(menu, place, links.filter((link) => link.id !== linkId)))
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

/**
 * Moves a link to any place, before `beforeId` there or at its end when that
 * is null, which is a drop from another list. A place the link may not go
 * leaves the menu as it was.
 */
export function moveLinkTo(
  menu: Menu,
  linkId: string,
  place: Place,
  beforeId: string | null
): Menu {
  const from = placeOf(menu, linkId)
  const fromLinks = from ? linksAt(menu, from) : null
  const link = fromLinks?.find((l) => l.id === linkId)
  if (!from || !fromLinks || !link || !canPlace(link, place)) return menu
  const without = withLinksAt(menu, from, fromLinks.filter((l) => l.id !== linkId))
  const links = linksAt(without, place)
  if (!links) return menu
  const at = beforeId ? links.findIndex((l) => l.id === beforeId) : -1
  const next = [...links]
  next.splice(at === -1 ? next.length : at, 0, link)
  return withLinksAt(without, place, next)
}

/** Moves a section to where another section was dropped. */
export function moveSection(menu: Menu, fromId: string, toId: string): Menu {
  const from = menu.sections.findIndex((section) => section.id === fromId)
  const to = menu.sections.findIndex((section) => section.id === toId)
  if (from === -1 || to === -1 || from === to) return menu
  const sections = [...menu.sections]
  const [moved] = sections.splice(from, 1)
  sections.splice(to, 0, moved)
  return { ...menu, sections }
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
  return withoutLostLinks({
    ...menu,
    sections: menu.sections.filter((section) => section.id !== sectionId),
  })
}
