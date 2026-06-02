import {
  QUICK_LINK_ICON_OPTIONS,
  type QuickLinkIconName,
  isQuickLinkIconValue,
  type QuickLinkIconValue,
} from "@/lib/utils/site-quick-links"

export type AdminSidebarChildItem = {
  id: string
  label: string
  href: string
  icon?: QuickLinkIconValue
  visible?: boolean
  activePaths?: string[]
}

export type AdminSidebarItem = {
  type: "item"
  id: string
  label: string
  href: string
  icon: QuickLinkIconValue
  visible: boolean
  children?: AdminSidebarChildItem[]
  activePaths?: string[]
}

export type AdminSidebarEntry = AdminSidebarItem

export type AdminSidebarSection = {
  id: string
  title: string
  entries: AdminSidebarEntry[]
}

export type AdminSidebarSettings = {
  version: 1
  sections: AdminSidebarSection[]
}

export type AdminSidebarNavLink = {
  label: string
  href: string
  active?: boolean
  iconName?: QuickLinkIconValue
  external?: boolean
}

export const ADMIN_SIDEBAR_ICON_OPTIONS = QUICK_LINK_ICON_OPTIONS

const SITE_ID_PATTERN = /\/admin\/(?:sites|pages|account-pages(?:\/builder)?|categories(?:\/builder)?|posts\/builder|products\/builder|directories\/builder|events\/builder)\/([0-9a-f-]{36})(?:\/|$)/i

export function getAdminSidebarSiteIdFromPathname(pathname?: string | null) {
  if (!pathname) return null
  return pathname.match(SITE_ID_PATTERN)?.[1] ?? null
}

function sitePath(siteId: string | null, path: (siteId: string) => string) {
  return siteId ? path(siteId) : "/admin/sites"
}

function item(
  id: string,
  label: string,
  href: string,
  icon: QuickLinkIconName,
  children?: AdminSidebarChildItem[],
  activePaths?: string[]
): AdminSidebarItem {
  return {
    type: "item",
    id,
    label,
    href,
    icon,
    visible: true,
    ...(children?.length ? { children } : {}),
    ...(activePaths?.length ? { activePaths } : {}),
  }
}

function child(
  id: string,
  label: string,
  href: string,
  icon?: QuickLinkIconValue,
  activePaths?: string[]
): AdminSidebarChildItem {
  return {
    id,
    label,
    href,
    ...(icon ? { icon } : {}),
    ...(activePaths?.length ? { activePaths } : {}),
  }
}

export function createDefaultAdminSidebarSettings(siteId?: string | null): AdminSidebarSettings {
  const resolvedSiteId = siteId ?? null

  return {
    version: 1,
    sections: [
      {
        id: "section-content-management",
        title: "Content Management",
        entries: [
          item("item-posts", "Posts", "/admin/posts", "book", [
            child("child-post-templates", "Templates", "/admin/posts/templates", "file"),
          ], ["/admin/posts/builder", "/admin/posts/new"]),
          item("item-products", "Products", "/admin/products", "products", [
            child("child-product-orders", "Purchases", "/admin/orders", "cart"),
            child("child-product-templates", "Templates", "/admin/products/templates", "file"),
          ], ["/admin/products/builder", "/admin/products/new", "/admin/products/analytics"]),
          item("item-directory", "Directory", "/admin/directory", "directory", [
            child("child-directory-claims", "Claims", "/admin/directory/claims", "clipboard"),
            child("child-directory-custom-blocks", "Custom Blocks", "/admin/directory/custom-blocks", "grid"),
            child("child-directory-templates", "Templates", "/admin/directory/templates", "file"),
          ], ["/admin/directory/builder", "/admin/directory/claims"]),
          item("item-newsletters", "Newsletters", "/admin/newsletters", "newsletters", [
            child("child-newsletter-contacts", "Contacts", "/admin/newsletters/contacts", "users"),
            child("child-newsletter-tags", "Tags", "/admin/newsletters/tags", "categories"),
            child("child-newsletter-segments", "Segments", "/admin/newsletters/segments", "clipboard"),
            child("child-newsletter-automations", "Automations", "/admin/newsletters/automations", "zap"),
            child("child-newsletter-templates", "Templates", "/admin/newsletters/templates", "file"),
          ], ["/admin/newsletters"]),
          item("item-events", "Events", "/admin/events", "events", undefined, ["/admin/events/builder"]),
        ],
      },
      {
        id: "section-site-management",
        title: "Site Management",
        entries: [
          item("item-structure", "Structure", sitePath(resolvedSiteId, (id) => `/admin/sites/${id}/pages`), "pages", [
            child(
              "child-structure-pages",
              "Pages",
              sitePath(resolvedSiteId, (id) => `/admin/sites/${id}/pages`),
              "pages",
              resolvedSiteId ? [`/admin/pages/${resolvedSiteId}`] : undefined
            ),
            child(
              "child-structure-account-pages",
              "Account Pages",
              sitePath(resolvedSiteId, (id) => `/admin/account-pages/${id}`),
              "users",
              resolvedSiteId ? [`/admin/account-pages/builder/${resolvedSiteId}`] : undefined
            ),
            child("child-structure-navigation", "Navigation", sitePath(resolvedSiteId, (id) => `/admin/sites/${id}/structure/navigation`), "link"),
            child("child-structure-footer", "Footer", sitePath(resolvedSiteId, (id) => `/admin/sites/${id}/structure/footer`), "grid"),
            child("child-structure-breadcrumbs", "Breadcrumbs", sitePath(resolvedSiteId, (id) => `/admin/sites/${id}/structure/breadcrumbs`), "arrow"),
          ], resolvedSiteId ? [`/admin/pages/${resolvedSiteId}`, `/admin/account-pages/builder/${resolvedSiteId}`] : undefined),
          item("item-sponsors", "Sponsors", "/admin/sponsors", "briefcase"),
          item(
            "item-categories",
            "Categories",
            sitePath(resolvedSiteId, (id) => `/admin/categories/${id}`),
            "categories",
            undefined,
            resolvedSiteId ? [`/admin/categories/builder/${resolvedSiteId}`] : undefined
          ),
          item("item-media", "Media Library", "/admin/media", "media", [
            child("child-media-unused", "Unused", "/admin/media/unused", "imagePlus"),
          ]),
          item("item-site-users", "Site Users", resolvedSiteId ? "/admin/site-users" : "/admin/sites", "users"),
          item("item-site-settings", "Site Settings", sitePath(resolvedSiteId, (id) => `/admin/sites/${id}/settings`), "settings", [
            child("child-site-settings-general", "General Settings", sitePath(resolvedSiteId, (id) => `/admin/sites/${id}/settings`), "settings"),
            child("child-site-settings-seo", "SEO", sitePath(resolvedSiteId, (id) => `/admin/sites/${id}/settings/seo`), "search"),
          ]),
          item("item-site-email", "Email", sitePath(resolvedSiteId, (id) => `/admin/sites/${id}/email`), "newsletters"),
        ],
      },
      {
        id: "section-platform-management",
        title: "Platform Management",
        entries: [
          item("item-sites", "Sites", "/admin/sites", "site", [
            child("child-site-themes", "Themes", "/admin/themes", "palette"),
          ], ["/admin/sites?create=1"]),
          item("item-platform-users", "Users", "/admin/users", "users"),
          item("item-platform-automations", "Automations", "/admin/automations", "automations"),
          item("item-platform-settings", "Platform Settings", "/admin/platforms/settings", "settings", [
            child("child-platform-apps-integration", "Apps Integration", "/admin/apps-integration", "link"),
          ]),
          item("item-platform-emails", "Emails", "/admin/platforms/emails", "newsletters", [
            child("child-platform-email-accounts", "Email Accounts", "/admin/platforms/emails/senders", "newsletters", ["/admin/site-health/email"]),
          ], ["/admin/platforms/emails", "/admin/site-health/email"]),
        ],
      },
    ],
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function createFallbackId(prefix: string, index: number) {
  return `${prefix}-${index}`
}

const DEFAULT_ADMIN_SIDEBAR_ID_ALIASES: Record<string, string> = {
  "content-management": "section-content-management",
  "site-management": "section-site-management",
  "platform-management": "section-platform-management",
  products: "item-products",
  posts: "item-posts",
  directory: "item-directory",
  newsletters: "item-newsletters",
  events: "item-events",
  structure: "item-structure",
  sponsors: "item-sponsors",
  categories: "item-categories",
  media: "item-media",
  "site-users": "item-site-users",
  "site-settings": "item-site-settings",
  "site-email": "item-site-email",
  sites: "item-sites",
  "platform-users": "item-platform-users",
  "platform-automations": "item-platform-automations",
  "platform-settings": "item-platform-settings",
  "platform-emails": "item-platform-emails",
  "product-orders": "child-product-orders",
  "product-templates": "child-product-templates",
  "post-templates": "child-post-templates",
  "directory-custom-blocks": "child-directory-custom-blocks",
  "directory-claims": "child-directory-claims",
  "directory-templates": "child-directory-templates",
  "newsletter-contacts": "child-newsletter-contacts",
  "newsletter-tags": "child-newsletter-tags",
  "newsletter-segments": "child-newsletter-segments",
  "newsletter-automations": "child-newsletter-automations",
  "newsletter-templates": "child-newsletter-templates",
  "structure-pages": "child-structure-pages",
  "structure-account-pages": "child-structure-account-pages",
  "structure-navigation": "child-structure-navigation",
  "structure-footer": "child-structure-footer",
  "structure-breadcrumbs": "child-structure-breadcrumbs",
  "media-unused": "child-media-unused",
  "site-settings-general": "child-site-settings-general",
  "site-settings-seo": "child-site-settings-seo",
  "site-themes": "child-site-themes",
  "platform-apps-integration": "child-platform-apps-integration",
  "platform-email-accounts": "child-platform-email-accounts",
}

function getAliasedDefaultId(id: string) {
  return DEFAULT_ADMIN_SIDEBAR_ID_ALIASES[id] ?? id
}

function readString(value: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const field = value[key]
    if (typeof field === "string") return field
  }

  return ""
}

export function sanitizeAdminSidebarHref(href: string) {
  const trimmed = href.trim()
  if (!trimmed) return ""

  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) {
    return trimmed
  }

  try {
    const url = new URL(trimmed)
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.href
      : ""
  } catch {
    return ""
  }
}

function normalizeActivePaths(value: unknown) {
  return Array.isArray(value)
    ? value.flatMap((path) => {
        if (typeof path !== "string") return []
        const href = sanitizeAdminSidebarHref(path)
        return href ? [href] : []
      })
    : undefined
}

function normalizeChild(value: unknown, index: number): AdminSidebarChildItem | null {
  if (!isRecord(value)) return null

  const id = typeof value.id === "string" && value.id.trim()
    ? value.id.trim()
    : createFallbackId("child", index)
  const label = readString(value, ["label", "title", "name"])
  const href = sanitizeAdminSidebarHref(readString(value, ["href", "url", "route"]))
  const icon = isQuickLinkIconValue(value.icon) ? value.icon : undefined
  const activePaths = normalizeActivePaths(value.activePaths)

  return {
    id,
    label,
    href,
    ...(icon ? { icon } : {}),
    visible: typeof value.visible === "boolean" ? value.visible : true,
    ...(activePaths?.length ? { activePaths } : {}),
  }
}

function normalizeItem(value: unknown, index: number): AdminSidebarItem | null {
  if (!isRecord(value)) return null

  const id = typeof value.id === "string" && value.id.trim()
    ? value.id.trim()
    : createFallbackId("item", index)
  const icon = isQuickLinkIconValue(value.icon) ? value.icon : "grid"
  const childValues = Array.isArray(value.children)
    ? value.children
    : Array.isArray(value.items)
      ? value.items
      : undefined
  const activePaths = normalizeActivePaths(value.activePaths)

  return {
    type: "item",
    id,
    label: readString(value, ["label", "title", "name"]),
    href: sanitizeAdminSidebarHref(readString(value, ["href", "url", "route"])),
    icon,
    visible: typeof value.visible === "boolean" ? value.visible : true,
    children: childValues
      ? childValues.flatMap((childValue, childIndex) => {
          const normalized = normalizeChild(childValue, childIndex)
          return normalized ? [normalized] : []
        })
      : undefined,
    ...(activePaths?.length ? { activePaths } : {}),
  }
}

function normalizeSettings(value: unknown): AdminSidebarSettings | null {
  if (!isRecord(value) || !Array.isArray(value.sections)) return null

  const sections = value.sections.flatMap((sectionValue, sectionIndex) => {
    if (!isRecord(sectionValue)) return []

    const entries = Array.isArray(sectionValue.entries)
      ? sectionValue.entries
      : Array.isArray(sectionValue.items)
        ? sectionValue.items
        : []

    return [{
      id: typeof sectionValue.id === "string" && sectionValue.id.trim()
        ? sectionValue.id.trim()
        : createFallbackId("section", sectionIndex),
      title: typeof sectionValue.title === "string" ? sectionValue.title : "",
      entries: entries.flatMap((entryValue, entryIndex) => {
        const normalized = normalizeItem(entryValue, entryIndex)
        return normalized ? [normalized] : []
      }),
    }]
  })

  if (!sections.length || sections.every((section) => section.entries.length === 0)) {
    return null
  }

  return {
    version: 1,
    sections,
  }
}

function getDefaultMetadata(siteId: string | null) {
  const items = new Map<string, AdminSidebarItem>()
  const children = new Map<string, AdminSidebarChildItem>()

  createDefaultAdminSidebarSettings(siteId).sections.forEach((section) => {
    section.entries.forEach((entry) => {
      items.set(entry.id, entry)

      entry.children?.forEach((childItem) => {
        children.set(childItem.id, childItem)
      })
    })
  })

  return { items, children }
}

function resolveDefault<T>(map: Map<string, T>, id: string) {
  return map.get(id) ?? map.get(getAliasedDefaultId(id))
}

function hydrateSiteIdPlaceholder(href: string, siteId: string | null) {
  if (!href.includes("[siteId]")) return href
  return siteId ? href.replaceAll("[siteId]", siteId) : "/admin/sites"
}

function hydrateHref(href: string, defaultHref?: string, siteId?: string | null) {
  const resolvedHref = sanitizeAdminSidebarHref(href) || sanitizeAdminSidebarHref(defaultHref ?? "")
  return hydrateSiteIdPlaceholder(resolvedHref, siteId ?? null)
}

function isRemovedAnalyticsEntry(entry: Pick<AdminSidebarItem, "id" | "href">) {
  const id = entry.id.trim()
  const cleanHref = entry.href.split(/[?#]/)[0]

  return id === "item-analytics" ||
    id === "analytics" ||
    /^\/admin\/sites\/[0-9a-f-]{36}\/analytics(?:\/|$)/i.test(cleanHref)
}

export function resolveAdminSidebarSettings(
  value: unknown,
  context: { siteId?: string | null; pathname?: string | null } = {}
): AdminSidebarSettings {
  const siteId = context.siteId ?? getAdminSidebarSiteIdFromPathname(context.pathname) ?? null
  const settings = normalizeSettings(value) ?? createDefaultAdminSidebarSettings(siteId)
  const metadata = getDefaultMetadata(siteId)

  return {
    version: 1,
    sections: settings.sections.map((section) => ({
      ...section,
      id: getAliasedDefaultId(section.id),
      entries: section.entries.flatMap((entry) => {
        const defaultEntry = resolveDefault(metadata.items, entry.id)

        const resolvedEntry = {
          ...entry,
          id: getAliasedDefaultId(entry.id),
          href: hydrateHref(entry.href, defaultEntry?.href, siteId),
          ...(defaultEntry?.activePaths?.length
            ? { activePaths: defaultEntry.activePaths }
            : {}),
          children: entry.children?.map((childItem) => {
            const defaultChild = resolveDefault(metadata.children, childItem.id)

            return {
              ...childItem,
              id: getAliasedDefaultId(childItem.id),
              href: hydrateHref(childItem.href, defaultChild?.href, siteId),
              ...(defaultChild?.activePaths?.length
                ? { activePaths: defaultChild.activePaths }
                : {}),
            }
          }),
        }

        return isRemovedAnalyticsEntry(resolvedEntry) ? [] : [resolvedEntry]
      }),
    })),
  }
}

export function serializeAdminSidebarSettings(settings: AdminSidebarSettings): AdminSidebarSettings {
  return {
    version: 1,
    sections: settings.sections.map((section) => ({
      id: section.id,
      title: section.title,
      entries: section.entries.map((entry) => ({
        type: "item",
        id: entry.id,
        label: entry.label,
        href: sanitizeAdminSidebarHref(entry.href),
        icon: entry.icon,
        visible: entry.visible,
        ...(entry.children?.length
          ? {
              children: entry.children.map((childItem) => ({
                id: childItem.id,
                label: childItem.label,
                href: sanitizeAdminSidebarHref(childItem.href),
                visible: childItem.visible !== false,
                ...(childItem.icon ? { icon: childItem.icon } : {}),
              })),
            }
          : {}),
      })),
    })),
  }
}

export function isExternalAdminSidebarHref(href: string) {
  return /^https?:\/\//i.test(href.trim())
}

function stripQuery(href: string) {
  return href.split("?")[0]
}

function isPathActive(pathname: string, href: string) {
  const cleanHref = stripQuery(href).trim()
  if (!cleanHref) return false

  return pathname === cleanHref || (cleanHref !== "/" && pathname.startsWith(`${cleanHref}/`))
}

function getActiveChild(pathname: string, children: AdminSidebarChildItem[]) {
  return children
    .filter((childItem) => isChildActive(pathname, childItem))
    .sort((a, b) => stripQuery(b.href).length - stripQuery(a.href).length)[0]
}

function isItemActive(pathname: string, entry: AdminSidebarItem) {
  const cleanHref = stripQuery(entry.href).trim()
  if (cleanHref && pathname === cleanHref) return true
  if (entry.activePaths?.some((activePath) => isPathActive(pathname, activePath))) return true
  return !entry.children?.length && isPathActive(pathname, entry.href)
}

function isChildActive(pathname: string, childItem: AdminSidebarChildItem) {
  return isPathActive(pathname, childItem.href)
    || Boolean(childItem.activePaths?.some((activePath) => isPathActive(pathname, activePath)))
}

export function getAdminSidebarStickyNavLinks(
  value: unknown,
  context: { siteId?: string | null; pathname: string }
): AdminSidebarNavLink[] {
  const settings = resolveAdminSidebarSettings(value, context)
  const candidates = settings.sections.flatMap((section) =>
    section.entries.flatMap((entry) => {
      if (!entry.visible) return []

      const children = (entry.children ?? []).filter((childItem) => childItem.visible !== false)
      const activeChild = getActiveChild(context.pathname, children)
      const parentMatches = isItemActive(context.pathname, entry)
      if (!parentMatches && !activeChild) return []

      return [{
        entry,
        activeChildId: activeChild?.id,
        matchLength: stripQuery(activeChild?.href ?? entry.href).length,
      }]
    })
  )

  const active = candidates.sort((a, b) => b.matchLength - a.matchLength)[0]
  if (!active) return []
  const visibleChildren = (active.entry.children ?? []).filter((childItem) => childItem.visible !== false)

  return [
    {
      label: active.entry.label,
      href: active.entry.href,
      active: !active.activeChildId && isItemActive(context.pathname, active.entry),
      iconName: active.entry.icon,
      external: isExternalAdminSidebarHref(active.entry.href),
    },
    ...visibleChildren.map((childItem) => ({
      label: childItem.label,
      href: childItem.href,
      active: childItem.id === active.activeChildId,
      iconName: childItem.icon,
      external: isExternalAdminSidebarHref(childItem.href),
    })),
  ]
}
