"use client"

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

interface AdminCardProps {
  children: React.ReactNode
  className?: string
  title?: string
  description?: string
  footer?: React.ReactNode
}

export function AdminCard({
  children,
  className,
  title,
  description,
  footer,
}: AdminCardProps) {
  return (
    <Card className={cn("shadow-sm", className)}>
      {(title || description) && (
        <CardHeader>
          {title && <CardTitle>{title}</CardTitle>}
          {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
      )}
      <CardContent>{children}</CardContent>
      {footer && <CardFooter>{footer}</CardFooter>}
    </Card>
  )
} 