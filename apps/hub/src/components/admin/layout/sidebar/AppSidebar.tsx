"use client"

import * as React from "react"
import {
  Globe,
  Users,
  Image,
  FileText,
  Package,
  BookOpen,
  Settings,
  FolderOpen,
  Calendar,
  Mail,
  Tag,
  Workflow,
  BarChart3,
  ClipboardCheck,
  HeartPulse,
  AppWindow,
} from "lucide-react"

import { SidebarMain } from "@/components/admin/layout/sidebar/SidebarMain"
import { SidebarDropdown } from "@/components/admin/layout/sidebar/SidebarDropdown"
import { SidebarUserAdmin } from "@/components/admin/layout/sidebar/SidebarUserAdmin"
import { SiteSwitcherMenu } from "@/components/admin/layout/sidebar/SiteSwitcherMenu"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from "@/components/admin/layout/sidebar/Sidebar"
import { useSiteSwitcher } from "@/components/admin/site-switcher/site-switcher-provider"

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  user: { name: string; email: string }
}

export function AppSidebar({ user, ...props }: AppSidebarProps) {
  const { currentSite } = useSiteSwitcher()

  // Content creation items
  const enabledFeatures = currentSite?.settings?.enabled_features
  const featureOrder: string[] = currentSite?.settings?.feature_order || []
  const allContentNavItems = [
    {
      title: "Posts",
      url: "/admin/posts",
      icon: BookOpen,
      isActive: false,
      featureKey: "posts",
    },
    {
      title: "Products",
      url: "/admin/products",
      icon: Package,
      isActive: false,
      featureKey: "products",
      items: [
        { title: "Purchases", url: "/admin/orders" },
      ],
    },
    {
      title: "Directory",
      url: "/admin/directories",
      icon: FolderOpen,
      isActive: false,
      featureKey: "directory",
    },
    {
      title: "Newsletters",
      url: "/admin/newsletters",
      icon: Mail,
      isActive: false,
      featureKey: "newsletters",
      items: [
        { title: "Contacts", url: "/admin/newsletters/contacts" },
        { title: "Segments", url: "/admin/newsletters/segments" },
        { title: "Automations", url: "/admin/newsletters/automations" },
        { title: "Templates", url: "/admin/newsletters/templates" },
      ],
    },
    {
      title: "Events",
      url: "/admin/events",
      icon: Calendar,
      isActive: false,
      featureKey: "events",
    },
  ].filter(item => !enabledFeatures || enabledFeatures[item.featureKey] !== false)

  // Sort by saved order if available
  const contentNavItems = featureOrder.length > 0
    ? allContentNavItems.sort((a, b) => {
        const ai = featureOrder.indexOf(a.featureKey)
        const bi = featureOrder.indexOf(b.featureKey)
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
      })
    : allContentNavItems

  // Site management items
  const siteManagementProjects = [
    {
      name: "Pages",
      url: currentSite ? `/admin/sites/${currentSite.id}/pages` : "/admin/sites",
      icon: FileText,
      items: [
        { title: "User Dashboard", url: currentSite ? `/admin/user-pages/${currentSite.id}` : "/admin/sites" },
      ],
    },
    {
      name: "Categories",
      url: currentSite ? `/admin/categories/${currentSite.id}` : "/admin/sites",
      icon: Tag,
    },
    {
      name: "Media Library",
      url: "/admin/media",
      icon: Image,
    },
    {
      name: "Site Settings",
      url: currentSite ? `/admin/sites/${currentSite.id}/settings` : "/admin/sites",
      icon: Settings,
    },
  ]

  // Tools items
  const toolsProjects = [
    {
      name: "Analytics",
      url: currentSite ? `/admin/sites/${currentSite.id}/analytics` : "/admin/sites",
      icon: BarChart3,
    },
    {
      name: "Site Audit",
      url: currentSite ? `/admin/sites/${currentSite.id}/site-audit` : "/admin/sites",
      icon: ClipboardCheck,
    },
    {
      name: "Site Health",
      url: "/admin/site-health",
      icon: HeartPulse,
    },
  ]

  // Platform management items
  const platformProjects = [
    {
      name: "Sites",
      url: "/admin/sites",
      icon: Globe,
    },
    {
      name: "Users",
      url: "/admin/users",
      icon: Users,
    },
    {
      name: "Automations",
      url: "/admin/automations",
      icon: Workflow,
    },
    {
      name: "Apps Integration",
      url: "/admin/apps-integration",
      icon: AppWindow,
    },
    {
      name: "Settings",
      url: "/admin/platforms/settings",
      icon: Settings,
    },
  ]
  
  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SiteSwitcherMenu />
      </SidebarHeader>
      <SidebarContent>
        <SidebarMain items={contentNavItems} />
        <SidebarDropdown title="Site Management" projects={siteManagementProjects} />
        <SidebarDropdown title="Tools" projects={toolsProjects} />
        <SidebarDropdown title="Platform Management" projects={platformProjects} />
      </SidebarContent>
      <SidebarFooter>
        <SidebarUserAdmin user={{ name: user.name, email: user.email, avatar: '' }} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
