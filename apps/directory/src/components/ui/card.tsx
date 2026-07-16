import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils/tailwind"

const cardVariants = cva("text-card-foreground rounded-md", {
  variants: {
    variant: {
      // Borderless white surfaces on the light gray admin canvas.
      default: "bg-card",
      soft: "bg-foreground/5",
      mixed: "bg-foreground/5 border border-foreground.5"
    }
  },
  defaultVariants: {
    variant: "default"
  }
})

export interface CardProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof cardVariants> {}

const Card = React.forwardRef<HTMLDivElement, CardProps>(({ className, variant, ...props }, ref) => (
  <div ref={ref} data-slot="card" className={cn(cardVariants({ variant, className }))} {...props} />
))
Card.displayName = "Card"

// CardGroup — wraps a grid or flex of Card elements and applies consistent responsive gap between them
const CardGroup = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} data-slot="card-group" className={cn("gap-3", className)} {...props} />
  )
)
CardGroup.displayName = "CardGroup"

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} data-slot="card-header" className={cn("flex flex-col space-y-1 p-4 pb-3", className)} {...props} />
  )
)
CardHeader.displayName = "CardHeader"

const CardTitle = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} data-slot="card-title" className={cn("font-semibold leading-none tracking-tight", className)} {...props} />
  )
)
CardTitle.displayName = "CardTitle"

const CardDescription = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} data-slot="card-description" className={cn("text-muted-foreground text-sm", className)} {...props} />
  )
)
CardDescription.displayName = "CardDescription"

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} data-slot="card-content" className={cn("grid gap-4 p-4 not-first:pt-0", className)} {...props} />
  )
)
CardContent.displayName = "CardContent"

const CardSection = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} data-slot="card-section" className={cn("p-6", className)} {...props} />
)
CardSection.displayName = "CardSection"

const CardTableHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="card-table-header"
      className={cn("grid gap-4 border-b bg-muted/30 px-6 py-4 text-sm font-medium text-muted-foreground", className)}
      {...props}
    />
  )
)
CardTableHeader.displayName = "CardTableHeader"

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} data-slot="card-footer" className={cn("flex items-center p-6 pt-0", className)} {...props} />
)
CardFooter.displayName = "CardFooter"

export { Card, CardGroup, CardHeader, CardFooter, CardTitle, CardDescription, CardContent, CardSection, CardTableHeader }
