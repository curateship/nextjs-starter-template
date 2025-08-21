"use client"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Search, Settings } from "lucide-react"
import Link from "next/link"
import { useSiteContext } from "@/contexts/site-context"

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
            <Input
              placeholder="Search..."
              className="pl-9 w-64"
            />
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm" className="h-8 px-3">
            <Link 
              href="/"
              target="_blank" 
              rel="noopener noreferrer"
            >
              Visit site
            </Link>
          </Button>
          <Button asChild variant="ghost" size="icon" className="h-8 w-8">
            <Link href={currentSite ? `/admin/sites/${currentSite.id}/settings` : "/admin/settings"}>
              <Settings className="h-4 w-4" />
              <span className="sr-only">Settings</span>
            </Link>
          </Button>
        </div>
      </div>
    </div>
  )
}