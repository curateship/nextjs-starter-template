import type { QuickLinkIconName } from "@/lib/utils/site-quick-links"
import type { LucideIcon } from "lucide-react"
import {
  BarChart3,
  Blocks,
  ClipboardCheck,
  Clock3,
  FileText,
  Filter,
  FolderOpen,
  Globe,
  HeartPulse,
  Link2,
  Mail,
  Package,
  Paintbrush,
  Search,
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

type ProductAdminSection = "products" | "orders" | "analytics"
type PageAdminSection = "pages" | "account-pages" | "navigation" | "footer"
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
type SiteHealthAdminSection = "overview" | "cron"
type SiteAuditAdminSection = "site-audit" | "audit" | "links"
type SitesAdminSection = "sites" | "themes"

export function getProductAdminTopNavLinks(active: ProductAdminSection): AdminTopNavLink[] {
  return [
    { label: "Products", href: "/admin/products", icon: Package, active: active === "products" },
    { label: "Orders", href: "/admin/orders", icon: ShoppingCart, active: active === "orders" },
    { label: "Analytics", href: "/admin/products/analytics", icon: BarChart3, active: active === "analytics" },
  ]
}

export function getPageAdminTopNavLinks(siteId: string, active: PageAdminSection): AdminTopNavLink[] {
  return [
    { label: "Pages", href: `/admin/sites/${siteId}/pages`, icon: FileText, active: active === "pages" },
    { label: "Account Pages", href: `/admin/account-pages/${siteId}`, icon: Users, active: active === "account-pages" },
    { label: "Navigation", href: `/admin/sites/${siteId}/structure/navigation`, icon: Navigation, active: active === "navigation" },
    { label: "Footer", href: `/admin/sites/${siteId}/structure/footer`, icon: PanelBottom, active: active === "footer" },
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

export function getSiteHealthAdminTopNavLinks(active: SiteHealthAdminSection): AdminTopNavLink[] {
  return [
    { label: "Overview", href: "/admin/site-health", icon: HeartPulse, active: active === "overview" },
    { label: "Cron Jobs", href: "/admin/site-health/cron", icon: Clock3, active: active === "cron" },
  ]
}

export function getSiteAuditAdminTopNavLinks(siteId: string, active: SiteAuditAdminSection): AdminTopNavLink[] {
  return [
    { label: "Site Audit", href: `/admin/sites/${siteId}/site-audit`, icon: ClipboardCheck, active: active === "site-audit" },
    { label: "Content Audit", href: `/admin/sites/${siteId}/site-audit/audit`, icon: Search, active: active === "audit" },
    { label: "Internal Links", href: `/admin/sites/${siteId}/site-audit/links`, icon: Link2, active: active === "links" },
  ]
}
