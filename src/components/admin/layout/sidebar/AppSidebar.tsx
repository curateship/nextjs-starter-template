"use client"

import * as React from "react"
import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
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
  ExternalLink,
  Workflow,
  BarChart3,
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
  useSidebar,
} from "@/components/admin/layout/sidebar/Sidebar"
import { useSiteContext } from "@/contexts/site-context"
import { AdminThemeToggle } from "@/components/ui/admin-theme-toggle"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { getSiteUrl } from "@/lib/utils/site-url-generator"

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { currentSite } = useSiteContext()
  const { state } = useSidebar()
  const [user, setUser] = useState<{
    name: string
    email: string
    avatar: string
  } | null>(null)
  const [loading, setLoading] = useState(true)
  
  useEffect(() => {
    let mounted = true
    const supabase = createClient()
    
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return
      
      if (session?.user?.email) {
        const userData = {
          name: session.user.user_metadata?.display_name || session.user.email.split('@')[0] || 'User',
          email: session.user.email,
          avatar: ''
        }
        setUser(userData)
      } else {
        setUser(null)
      }
      setLoading(false)
    })
    
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return
      
      if (session?.user?.email) {
        const userData = {
          name: session.user.user_metadata?.display_name || session.user.email.split('@')[0] || 'User',
          email: session.user.email,
          avatar: ''
        }
        setUser(userData)
      } else {
        setUser(null)
      }
      setLoading(false)
    })
    
    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  // Content creation items
  const contentNavItems = [
    {
      title: "Posts",
      url: "/admin/posts",
      icon: BookOpen,
      isActive: false,
    },
    {
      title: "Products",
      url: "/admin/products",
      icon: Package,
      isActive: false,
      items: [
        { title: "Purchases", url: "/admin/orders" },
      ],
    },
    {
      title: "Directory",
      url: "/admin/directories",
      icon: FolderOpen,
      isActive: false,
    },
    {
      title: "Newsletters",
      url: "/admin/newsletters",
      icon: Mail,
      isActive: false,
      items: [
        { title: "Contacts", url: "/admin/newsletters/contacts" },
        { title: "Segments", url: "/admin/newsletters/segments" },
        { title: "Automations", url: "/admin/newsletters/automations" },
        { title: "Email Health", url: "/admin/newsletters/email-health" },
      ],
    },
    {
      title: "Events",
      url: "/admin/events",
      icon: Calendar,
      isActive: false,
    },
  ]

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
      name: "Analytics",
      url: currentSite ? `/admin/sites/${currentSite.id}/analytics` : "/admin/sites",
      icon: BarChart3,
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
        <SidebarDropdown title="Platform Management" projects={platformProjects} />
      </SidebarContent>
      <SidebarFooter>
        {state === "collapsed" ? (
          <div className="flex flex-col items-center gap-2 py-2">
            <Link
              href={currentSite ? getSiteUrl(currentSite) : "/"}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 hover:bg-muted rounded-md transition-colors"
            >
              <ExternalLink className="h-4 w-4" />
            </Link>
            <AdminThemeToggle />
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2 px-2 py-2">
            <Button asChild variant="outline" size="sm" className="h-8 px-3 flex-1">
              <Link
                href={currentSite ? getSiteUrl(currentSite) : "/"}
                target="_blank"
                rel="noopener noreferrer"
              >
                Visit site
              </Link>
            </Button>
            <AdminThemeToggle />
          </div>
        )}
        {!loading && user && <SidebarUserAdmin user={user} />}
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}