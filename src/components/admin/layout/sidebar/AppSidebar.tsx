"use client"

import * as React from "react"
import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import {
  Globe,
  Users,
  Palette,
  Image,
  FileText,
  Package,
  BookOpen,
  Settings,
  FolderOpen,
  Calendar,
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
import { useSiteContext } from "@/contexts/site-context"

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { currentSite } = useSiteContext()
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
    },
    {
      title: "Directory",
      url: "/admin/directories",
      icon: FolderOpen,
      isActive: false,
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
      name: "Themes",
      url: "/admin/themes",
      icon: Palette,
    },
    {
      name: "Users",
      url: "/admin/users",
      icon: Users,
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
        {!loading && user && <SidebarUserAdmin user={user} />}
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}