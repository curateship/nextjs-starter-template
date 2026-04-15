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
  HeartPulse,
  Link2,
  Mail,
  Package,
  Search,
  ShoppingCart,
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
type PageAdminSection = "pages" | "user-pages" | "navigation" | "footer"
type NewsletterAdminSection =
  | "newsletters"
  | "contacts"
  | "segments"
  | "automations"
  | "templates"
type DirectoryAdminSection = "directory" | "templates" | "custom-blocks"
type PlatformEmailAdminSection = "templates" | "emails"
type PlatformSettingsAdminSection = "settings" | "apps-integration"
type SiteHealthAdminSection = "overview" | "cron"
type SiteAuditAdminSection = "site-audit" | "audit" | "links"

export function getProductAdminTopNavLinks(active: ProductAdminSection): AdminTopNavLink[] {
  return [
    { label: "Products", href: "/admin/products", icon: Package, active: active === "products" },
    { label: "Orders", href: "/admin/orders", icon: ShoppingCart, active: active === "orders" },
  ]
}

export function getPageAdminTopNavLinks(siteId: string, active: PageAdminSection): AdminTopNavLink[] {
  return [
    { label: "Pages", href: `/admin/sites/${siteId}/pages`, icon: FileText, active: active === "pages" },
    { label: "User Pages", href: `/admin/user-pages/${siteId}`, icon: Users, active: active === "user-pages" },
    { label: "Navigation", href: `/admin/sites/${siteId}/structure/navigation`, icon: Navigation, active: active === "navigation" },
    { label: "Footer", href: `/admin/sites/${siteId}/structure/footer`, icon: PanelBottom, active: active === "footer" },
  ]
}

export function getNewsletterAdminTopNavLinks(active?: NewsletterAdminSection): AdminTopNavLink[] {
  return [
    { label: "Newsletters", href: "/admin/newsletters", icon: Mail, active: active === "newsletters" },
    { label: "Contacts", href: "/admin/newsletters/contacts", icon: Users, active: active === "contacts" },
    { label: "Segments", href: "/admin/newsletters/segments", icon: Filter, active: active === "segments" },
    { label: "Automations", href: "/admin/newsletters/automations", icon: Zap, active: active === "automations" },
  ]
}

export function getDirectoryAdminTopNavLinks(active: DirectoryAdminSection): AdminTopNavLink[] {
  return [
    { label: "Directory", href: "/admin/directories", icon: FolderOpen, active: active === "directory" },
  ]
}

export function getPlatformEmailAdminTopNavLinks(active: PlatformEmailAdminSection): AdminTopNavLink[] {
  return [
    { label: "Email Templates", href: "/admin/platforms/emails", icon: FileText, active: active === "templates" },
    { label: "Email Accounts", href: "/admin/platforms/emails/senders", icon: Mail, active: active === "emails" },
  ]
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
