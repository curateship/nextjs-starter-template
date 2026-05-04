import type { QuickLinkIconName } from "@/lib/utils/site-quick-links"
import type { LucideIcon } from "lucide-react"
import {
  Blocks,
  BookOpen,
  FileText,
  Filter,
  FolderOpen,
  Globe,
  Images,
  ImageOff,
  Link2,
  Mail,
  Package,
  Paintbrush,
  ShoppingCart,
  Settings2,
  Users,
  Zap,
  Navigation,
  PanelBottom,
} from "lucide-react"

export interface AdminTopNavLink {
  label: string
  href: string
  active?: boolean
  icon?: LucideIcon
  iconName?: QuickLinkIconName
}

type ProductAdminSection = "products" | "orders" | "templates"
type PostAdminSection = "posts" | "templates"
type PageAdminSection = "pages" | "account-pages" | "navigation" | "footer" | "breadcrumbs"
type NewsletterAdminSection =
  | "newsletters"
  | "contacts"
  | "segments"
  | "automations"
  | "templates"
  | "settings"
type DirectoryAdminSection = "directory" | "templates" | "custom-blocks"
type PlatformEmailAdminSection = "templates" | "emails" | "settings"
type PlatformSettingsAdminSection = "settings" | "apps-integration"
type SitesAdminSection = "sites" | "themes"
type MediaAdminSection = "library" | "unused"

export function getProductAdminTopNavLinks(active: ProductAdminSection): AdminTopNavLink[] {
  return [
    { label: "Products", href: "/admin/products", icon: Package, active: active === "products" },
    { label: "Orders", href: "/admin/orders", icon: ShoppingCart, active: active === "orders" },
    { label: "Templates", href: "/admin/products/templates", icon: FileText, active: active === "templates" },
  ]
}

export function getPostAdminTopNavLinks(active: PostAdminSection): AdminTopNavLink[] {
  return [
    { label: "Posts", href: "/admin/posts", icon: BookOpen, active: active === "posts" },
    { label: "Templates", href: "/admin/posts/templates", icon: FileText, active: active === "templates" },
  ]
}

export function getPageAdminTopNavLinks(siteId: string, active: PageAdminSection): AdminTopNavLink[] {
  return [
    { label: "Pages", href: `/admin/sites/${siteId}/pages`, icon: FileText, active: active === "pages" },
    { label: "Account Pages", href: `/admin/account-pages/${siteId}`, icon: Users, active: active === "account-pages" },
    { label: "Navigation", href: `/admin/sites/${siteId}/structure/navigation`, icon: Navigation, active: active === "navigation" },
    { label: "Footer", href: `/admin/sites/${siteId}/structure/footer`, icon: PanelBottom, active: active === "footer" },
    { label: "Breadcrumbs", href: `/admin/sites/${siteId}/structure/breadcrumbs`, icon: Link2, active: active === "breadcrumbs" },
  ]
}

export function getNewsletterAdminTopNavLinks(active?: NewsletterAdminSection, newsletterSettingsHref?: string): AdminTopNavLink[] {
  const links: AdminTopNavLink[] = [
    { label: "Newsletters", href: "/admin/newsletters", icon: Mail, active: active === "newsletters" },
    { label: "Contacts", href: "/admin/newsletters/contacts", icon: Users, active: active === "contacts" },
    { label: "Segments", href: "/admin/newsletters/segments", icon: Filter, active: active === "segments" },
    { label: "Automations", href: "/admin/newsletters/automations", icon: Zap, active: active === "automations" },
  ]

  if (newsletterSettingsHref) {
    links.push({ label: "Templates", href: "/admin/newsletters/templates", icon: FileText, active: active === "templates" })
    links.push({ label: "Settings", href: newsletterSettingsHref, icon: Settings2, active: active === "settings" })
  }

  return links
}

export function getDirectoryAdminTopNavLinks(active: DirectoryAdminSection): AdminTopNavLink[] {
  return [
    { label: "Directory", href: "/admin/directories", icon: FolderOpen, active: active === "directory" },
    { label: "Templates", href: "/admin/directories/templates", icon: FileText, active: active === "templates" },
    { label: "Custom Blocks", href: "/admin/directories/custom-blocks", icon: Blocks, active: active === "custom-blocks" },
  ]
}

export function getSitesAdminTopNavLinks(active: SitesAdminSection): AdminTopNavLink[] {
  return [
    { label: "Sites", href: "/admin/sites", icon: Globe, active: active === "sites" },
    { label: "Themes", href: "/admin/themes", icon: Paintbrush, active: active === "themes" },
  ]
}

export function getMediaAdminTopNavLinks(active: MediaAdminSection): AdminTopNavLink[] {
  return [
    { label: "Library", href: "/admin/media", icon: Images, active: active === "library" },
    { label: "Unused", href: "/admin/media/unused", icon: ImageOff, active: active === "unused" },
  ]
}

export function getPlatformEmailAdminTopNavLinks(active: PlatformEmailAdminSection, emailSettingsHref?: string): AdminTopNavLink[] {
  const links: AdminTopNavLink[] = [
    { label: "Email Templates", href: "/admin/platforms/emails", icon: FileText, active: active === "templates" },
    { label: "Email Accounts", href: "/admin/platforms/emails/senders", icon: Mail, active: active === "emails" },
  ]

  if (emailSettingsHref) {
    links.push({ label: "Email Settings", href: emailSettingsHref, icon: Settings2, active: active === "settings" })
  }

  return links
}

export function getPlatformSettingsAdminTopNavLinks(active: PlatformSettingsAdminSection): AdminTopNavLink[] {
  return [
    { label: "Platform Settings", href: "/admin/platforms/settings", iconName: "settings", active: active === "settings" },
    { label: "Apps Integration", href: "/admin/apps-integration", iconName: "link", active: active === "apps-integration" },
  ]
}
