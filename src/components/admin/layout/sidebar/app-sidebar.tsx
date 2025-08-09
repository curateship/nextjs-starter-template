"use client"

import * as React from "react"
import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase"
import {
  Globe,
  Users,
  Palette,
  Image,
  Wrench,
} from "lucide-react"

import { NavMain } from "@/components/admin/layout/sidebar/nav-main"
import { NavProjects } from "@/components/admin/layout/sidebar/nav-projects"
import { NavUser } from "@/components/admin/layout/sidebar/nav-user"
import { SiteSwitcherMenu } from "@/components/admin/layout/sidebar/site-switcher-menu"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from "@/components/admin/layout/sidebar/sidebar"
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

  // Site Builder - STATIC, always visible
  const siteNavItems = [
    {
      title: "Site Builder",
      url: "/admin/builder",
      icon: Wrench,
      isActive: true,
      items: [
        {
          title: "Visual Builder",
          url: "/admin/builder",
        },
      ],
    },
  ]

  // Platform management items (always visible)
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
    {
      name: "Image Library",
      url: "/admin/images",
      icon: Image,
    },
  ]
  
  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SiteSwitcherMenu />
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={siteNavItems} />
        <NavProjects title="Platform Management" projects={platformProjects} />
      </SidebarContent>
      <SidebarFooter>
        {!loading && user && <NavUser user={user} />}
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}