"use client"

import { Button } from "@/components/ui/button"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"

interface AdminPageHeaderProps {
  title: React.ReactNode
  subtitle?: string
  backUrl?: string
  primaryAction?: {
    label: string
    href?: string
    onClick?: () => void
    variant?: "default" | "outline" | "destructive"
    disabled?: boolean
    icon?: React.ReactNode
    mobileIconOnly?: boolean
  }
  secondaryAction?: {
    label: string
    href?: string
    onClick?: () => void
    variant?: "default" | "outline" | "destructive"
    disabled?: boolean
    icon?: React.ReactNode
    mobileIconOnly?: boolean
  }
  extraContent?: React.ReactNode
}

export function AdminPageHeader({
  title,
  subtitle,
  backUrl,
  primaryAction,
  secondaryAction,
  extraContent,
}: AdminPageHeaderProps) {
  return (
    <div className="flex items-center justify-between my-6 mx-4">
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
      
      {(primaryAction || secondaryAction || extraContent) && (
        <div className="flex items-center space-x-2">
          {extraContent}
          {secondaryAction && (
            <Button
              variant={secondaryAction.variant || "outline"}
              onClick={secondaryAction.onClick}
              asChild={!!secondaryAction.href}
              disabled={secondaryAction.disabled}
            >
              {secondaryAction.href ? (
                <Link href={secondaryAction.href}>
                  {secondaryAction.icon}
                  {secondaryAction.mobileIconOnly ? <span className="hidden sm:inline">{secondaryAction.label}</span> : secondaryAction.label}
                </Link>
              ) : (
                <>
                  {secondaryAction.icon}
                  {secondaryAction.mobileIconOnly ? <span className="hidden sm:inline">{secondaryAction.label}</span> : secondaryAction.label}
                </>
              )}
            </Button>
          )}

          {primaryAction && (
            <Button
              className={primaryAction.mobileIconOnly ? "ml-2 h-8 w-8 p-0 sm:h-9 sm:w-auto sm:px-4 sm:py-2" : "ml-2"}
              variant={primaryAction.variant || "default"}
              onClick={primaryAction.onClick}
              asChild={!!primaryAction.href}
              disabled={primaryAction.disabled}
            >
              {primaryAction.href ? (
                <Link href={primaryAction.href}>
                  {primaryAction.icon}
                  {primaryAction.mobileIconOnly ? <span className="hidden sm:inline">{primaryAction.label}</span> : primaryAction.label}
                </Link>
              ) : (
                <>
                  {primaryAction.icon}
                  {primaryAction.mobileIconOnly ? <span className="hidden sm:inline">{primaryAction.label}</span> : primaryAction.label}
                </>
              )}
            </Button>
          )}
        </div>
      )}
    </div>
  )
} 