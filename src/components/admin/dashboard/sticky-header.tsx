"use client"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Bell, Search, Settings } from "lucide-react"

interface StickyHeaderProps {
  title?: string
  subtitle?: string
  className?: string
  children?: React.ReactNode
}

export function StickyHeader({ 
  title = "Dashboard", 
  subtitle = "Manage your application",
  className,
  children 
}: StickyHeaderProps) {
  return (
    <div className={cn(
      "sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60",
      className
    )}>
      <div className="flex h-14 items-center justify-between px-4">
        <div className="flex flex-col">
          <h1 className="text-lg font-semibold leading-none tracking-tight">
            {title}
          </h1>
          {subtitle && (
            <p className="text-sm text-muted-foreground">
              {subtitle}
            </p>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          {children || (
            <>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <Search className="h-4 w-4" />
                <span className="sr-only">Search</span>
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <Bell className="h-4 w-4" />
                <span className="sr-only">Notifications</span>
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <Settings className="h-4 w-4" />
                <span className="sr-only">Settings</span>
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}