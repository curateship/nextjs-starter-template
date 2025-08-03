"use client"

import * as React from "react"
import {
  Package,
  FileText,
  Globe,
  Users,
  Mail,
  Palette,
  Image,
  Wrench,
} from "lucide-react"

import { NavMain } from "@/components/admin/layout/sidebar/nav-main"
import { NavProjects } from "@/components/admin/layout/sidebar/nav-projects"
import { NavUser } from "@/components/admin/layout/sidebar/nav-user"
import { TeamSwitcher } from "@/components/admin/layout/sidebar/team-switcher"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from "@/components/admin/layout/sidebar/sidebar"

// This is sample data.
const data = {
  user: {
    name: "shadcn",
    email: "m@example.com",
    avatar: "/avatars/shadcn.jpg",
  },
  teams: [
    {
      name: "Acme Inc",
      logo: Package,
      plan: "Enterprise",
    },
  ],
  navMain: [
    {
      title: "Products",
      url: "/admin/products",
      icon: Package,
      isActive: true,
      items: [
        {
          title: "All Products",
          url: "/admin/products",
        },
        {
          title: "Categories",
          url: "/admin/products/categories",
        },
      ],
    },
    {
      title: "Posts",
      url: "/admin/posts",
      icon: FileText,
      items: [
        {
          title: "All Posts",
          url: "/admin/posts",
        },
        {
          title: "Categories",
          url: "/admin/posts/categories",
        },
      ],
    },
    {
      title: "Newsletters",
      url: "/admin/newsletters",
      icon: Mail,
      items: [
        {
          title: "All Newsletters",
          url: "/admin/newsletters",
        },
        {
          title: "AI Generation",
          url: "/admin/newsletters/generate",
        },
      ],
    },
  ],
  builder: [
    {
      name: "Site Builder",
      url: "/admin/builder",
      icon: Wrench,
    },
  ],
  projects: [
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
      name: "Themes",
      url: "/admin/themes",
      icon: Palette,
    },
    {
      name: "Image Library",
      url: "/admin/images",
      icon: Image,
    },
  ],
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <TeamSwitcher teams={data.teams} />
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={data.navMain} />
        <NavProjects title="Builder" projects={data.builder} />
        <NavProjects projects={data.projects} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={data.user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
