import { sanitizeContactHref } from "@/lib/directory/contact-links"

/**
 * Everything a site can look like, kept in one JSONB column.
 *
 * A column each would mean a migration every time a site gains a knob, and none
 * of this is ever searched or joined on — it is read whole, to draw one site's
 * pages. What an admin could plausibly change on a Settings screen for the
 * *deployment* still belongs in `ShellConfig`; this is the same idea, one level
 * down, for each site.
 *
 * Browser-safe on purpose: the admin dialog edits it and the public pages draw
 * it, so it cannot import anything from `@/server`.
 *
 * **Everything here is written by an admin and drawn to the open internet**, so
 * every value is cleaned on the way in — nav links through the same
 * `sanitizeContactHref` the directory uses, colours checked against a shape,
 * and text cut to a length. Nothing stored is trusted at draw time either.
 */

export const MAX_SITE_TITLE = 120
export const MAX_SITE_TAGLINE = 200
export const MAX_FOOTER_TEXT = 500
export const MAX_META_DESCRIPTION = 300
export const MAX_NAV_LINKS = 12
export const MAX_NAV_LABEL = 60

/** One entry in a site's own menu. */
export type SiteNavLink = {
  label: string
  href: string
}

export type SiteSettings = {
  /** Shown in the browser tab and as the site's heading; falls back to its name. */
  title: string
  /** One line under the title on the home page. */
  tagline: string
  /** Media addresses, picked from the shared library. */
  logo: string
  favicon: string
  /** The site's own accent, as `#rrggbb`. */
  themeColor: string
  navigation: SiteNavLink[]
  footerText: string
  /** The description search engines show; falls back to the tagline. */
  metaDescription: string
  /** When on, visitors get a short notice instead of the site's pages. */
  maintenance: boolean
}

/** `#rgb` or `#rrggbb`, and nothing else — this value goes straight into CSS. */
const COLOR_SHAPE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i

/** The accent a site uses until somebody picks one. */
export const DEFAULT_THEME_COLOR = "#4f46e5"

export function emptySiteSettings(): SiteSettings {
  return {
    title: "",
    tagline: "",
    logo: "",
    favicon: "",
    themeColor: DEFAULT_THEME_COLOR,
    navigation: [],
    footerText: "",
    metaDescription: "",
    maintenance: false,
  }
}

function cleanText(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : ""
}

/**
 * A colour only if it is one. Anything else falls back rather than being
 * "fixed" — this string is put into a style, so a half-understood value is
 * worse than the default.
 */
function cleanColor(value: unknown) {
  return typeof value === "string" && COLOR_SHAPE.test(value.trim())
    ? value.trim().toLowerCase()
    : DEFAULT_THEME_COLOR
}

function cleanNavigation(value: unknown): SiteNavLink[] {
  if (!Array.isArray(value)) return []

  return value
    .map((entry) => {
      const link = entry as Partial<SiteNavLink> | null
      return {
        label: cleanText(link?.label, MAX_NAV_LABEL),
        href: sanitizeContactHref(
          typeof link?.href === "string" ? link.href : ""
        ),
      }
    })
    .filter((link) => link.label && link.href)
    .slice(0, MAX_NAV_LINKS)
}

/**
 * Whatever came out of the database or off the form, made into real settings.
 *
 * Total on purpose: a row written before a field existed, or by an older
 * version of the app, still has to draw a page rather than throw.
 */
export function cleanSiteSettings(raw: unknown): SiteSettings {
  const input = (raw ?? {}) as Partial<SiteSettings>

  return {
    title: cleanText(input.title, MAX_SITE_TITLE),
    tagline: cleanText(input.tagline, MAX_SITE_TAGLINE),
    logo: sanitizeContactHref(typeof input.logo === "string" ? input.logo : ""),
    favicon: sanitizeContactHref(
      typeof input.favicon === "string" ? input.favicon : ""
    ),
    themeColor: cleanColor(input.themeColor),
    navigation: cleanNavigation(input.navigation),
    footerText: cleanText(input.footerText, MAX_FOOTER_TEXT),
    metaDescription: cleanText(input.metaDescription, MAX_META_DESCRIPTION),
    maintenance: input.maintenance === true,
  }
}

/** What the browser tab says for this site. */
export function siteTitle(name: string, settings: SiteSettings) {
  return settings.title || name
}

/** What search engines are told, falling back to the line under the title. */
export function siteDescription(settings: SiteSettings) {
  return settings.metaDescription || settings.tagline
}
