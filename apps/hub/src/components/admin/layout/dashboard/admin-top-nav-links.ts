import type { LucideIcon } from "lucide-react"
import {
  BarChart3,
  Blocks,
  FileText,
  Filter,
  FolderOpen,
  Mail,
  Package,
  ShoppingCart,
  Users,
  Zap,
} from "lucide-react"

export interface AdminTopNavLink {
  label: string
  href: string
  active?: boolean
  icon?: LucideIcon
}

type ProductAdminSection = "products" | "orders" | "analytics"
type PageAdminSection = "pages" | "user-pages"
type NewsletterAdminSection =
  | "newsletters"
  | "contacts"
  | "segments"
  | "automations"
  | "templates"
type DirectoryAdminSection = "directory" | "templates" | "custom-blocks"
type SiteHealthAdminSection = "overview" | "email" | "cron"
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

export function getSiteHealthAdminTopNavLinks(active: SiteHealthAdminSection): AdminTopNavLink[] {
  return [
    { label: "Overview", href: "/admin/site-health", active: active === "overview" },
    { label: "Email Health", href: "/admin/site-health/email", active: active === "email" },
    { label: "Cron Jobs", href: "/admin/site-health/cron", active: active === "cron" },
  ]
}

export function getSiteAuditAdminTopNavLinks(siteId: string, active: SiteAuditAdminSection): AdminTopNavLink[] {
  return [
    { label: "Site Audit", href: `/admin/sites/${siteId}/site-audit`, active: active === "site-audit" },
    { label: "Content Audit", href: `/admin/sites/${siteId}/site-audit/audit`, active: active === "audit" },
    { label: "Internal Links", href: `/admin/sites/${siteId}/site-audit/links`, active: active === "links" },
  ]
}
