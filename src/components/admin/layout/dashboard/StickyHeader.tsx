"use client"

import { cn } from "@/lib/utils/tailwind-class-merger"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Search } from "lucide-react"
import Link from "next/link"
import { useSiteContext } from "@/contexts/site-context"
import { getSiteUrl } from "@/lib/utils/site-url-generator"
import { AdminThemeToggle } from "@/components/ui/admin-theme-toggle"

interface StickyHeaderProps {
  className?: string
  children?: React.ReactNode
}

export function StickyHeader({ 
  className,
  children 
}: StickyHeaderProps) {
  const { currentSite } = useSiteContext()

  return (
    <div className={cn(
      "sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60",
      className
    )}>
      <div className="flex h-14 items-center justify-between px-4">
        <div className="flex items-center gap-4">
          {children}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search..."
              className="pl-9 w-64 h-9 px-3 py-1 text-sm bg-transparent border-0 shadow-none outline-none focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 placeholder:text-muted-foreground rounded-md"
            />
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <AdminThemeToggle />
          <Button asChild variant="outline" size="sm" className="h-8 px-3">
            <Link 
              href={currentSite ? getSiteUrl(currentSite) : "/"}
              target="_blank" 
              rel="noopener noreferrer"
            >
              Visit site
            </Link>
          </Button>
        </div>
      </div>
    </div>
  )
}