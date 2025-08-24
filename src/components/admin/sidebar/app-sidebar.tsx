"use client"

import * as React from "react"
import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import {
  Globe,
  Users,
  Palette,
  Image,
  Wrench,
  FileText,
  Package,
  BookOpen,
  Settings,
} from "lucide-react"

import { NavMain } from "@/components/admin/sidebar/nav-main"
import { NavProjects } from "@/components/admin/sidebar/nav-projects"
import { NavUser } from "@/components/admin/sidebar/nav-user"
import { SiteSwitcherMenu } from "@/components/admin/sidebar/site-switcher-menu"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from "@/components/admin/sidebar/sidebar"
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
      title: "Products",
      url: "/admin/products",
      icon: Package,
      isActive: false,
    },
    {
      title: "Posts",
      url: "/admin/posts",
      icon: BookOpen,
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
      name: "Image Library",
      url: "/admin/images",
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
        <NavMain items={contentNavItems} />
        <NavProjects title="Site Management" projects={siteManagementProjects} />
        <NavProjects title="Platform Management" projects={platformProjects} />
      </SidebarContent>
      <SidebarFooter>
        {!loading && user && <NavUser user={user} />}
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}