"use client"

import { cn } from "@/lib/utils/tailwind-class-merger"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Search } from "lucide-react"
import Link from "next/link"
import { useSiteContext } from "@/contexts/site-context"
import { getSiteUrl } from "@/lib/utils/site-url-generator"

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
        
        <div className="flex items-center gap-2">
        </div>
      </div>
    </div>
  )
}