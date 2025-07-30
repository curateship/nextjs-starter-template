"use client"

import { Button } from "@/components/ui/button"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"

interface AdminPageHeaderProps {
  title: string
  subtitle?: string
  backUrl?: string
  primaryAction?: {
    label: string
    href?: string
    onClick?: () => void
    variant?: "default" | "outline" | "destructive"
  }
  secondaryAction?: {
    label: string
    href?: string
    onClick?: () => void
    variant?: "default" | "outline" | "destructive"
  }
}

export function AdminPageHeader({
  title,
  subtitle,
  backUrl,
  primaryAction,
  secondaryAction,
}: AdminPageHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-6 mt-8">
      <div className="flex items-center space-x-4">
        {backUrl && (
          <Button variant="ghost" size="sm" className="p-2" asChild>
            <Link href={backUrl}>
              <ArrowLeft className="w-4 h-4" />
            </Link>
          </Button>
        )}
        
        <div>
          <h1 className="text-3xl font-bold">{title}</h1>
          {subtitle && (
            <p className="text-muted-foreground mt-1">{subtitle}</p>
          )}
        </div>
      </div>
      
      {(primaryAction || secondaryAction) && (
        <div className="flex space-x-2">
          {secondaryAction && (
            <Button
              variant={secondaryAction.variant || "outline"}
              onClick={secondaryAction.onClick}
              asChild={!!secondaryAction.href}
            >
              {secondaryAction.href ? (
                <Link href={secondaryAction.href}>
                  {secondaryAction.label}
                </Link>
              ) : (
                secondaryAction.label
              )}
            </Button>
          )}
          
          {primaryAction && (
            <Button
              variant={primaryAction.variant || "default"}
              onClick={primaryAction.onClick}
              asChild={!!primaryAction.href}
            >
              {primaryAction.href ? (
                <Link href={primaryAction.href}>
                  {primaryAction.label}
                </Link>
              ) : (
                primaryAction.label
              )}
            </Button>
          )}
        </div>
      )}
    </div>
  )
} 