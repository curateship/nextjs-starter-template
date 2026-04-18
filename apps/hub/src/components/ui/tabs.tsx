"use client"

import * as React from "react"
import * as TabsPrimitive from "@radix-ui/react-tabs"
import { ArrowLeft } from "lucide-react"

import { cn } from "@/lib/utils/tailwind"

const Tabs = TabsPrimitive.Root
Tabs.displayName = "Tabs"

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      "inline-flex h-10 items-center justify-center gap-1 rounded-md bg-muted p-1 text-muted-foreground",
      className
    )}
    {...props}
  />
))
TabsList.displayName = "TabsList"

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "inline-flex cursor-pointer items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm hover:bg-background/50",
      className
    )}
    {...props}
  />
))
TabsTrigger.displayName = "TabsTrigger"

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      className
    )}
    {...props}
  />
))
TabsContent.displayName = "TabsContent"

interface BlockTab {
  value: string
  label: string
  content: React.ReactNode
}

interface BlockTabsProps {
  tabs: BlockTab[]
  defaultTab?: string
  onBack?: () => void
  className?: string
  headerClassName?: string
  contentClassName?: string
}

function BlockTabs({
  tabs,
  defaultTab,
  onBack,
  className,
  headerClassName,
  contentClassName,
}: BlockTabsProps) {
  const [activeTab, setActiveTab] = React.useState(defaultTab || tabs[0]?.value || "content")
  const contentClasses = contentClassName === undefined ? "mt-0" : contentClassName

  React.useEffect(() => {
    if (!tabs.some((tab) => tab.value === activeTab)) {
      setActiveTab(defaultTab || tabs[0]?.value || "content")
    }
  }, [activeTab, defaultTab, tabs])

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className={cn("flex w-full flex-col gap-4", className)}>
      <div className={cn("flex items-center gap-2", headerClassName || "px-4 pt-3")}>
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="inline-flex h-10 items-center justify-center whitespace-nowrap rounded-md bg-muted px-3 text-sm font-medium text-muted-foreground transition-all hover:bg-background hover:text-foreground hover:shadow-sm"
          >
            <ArrowLeft className="mr-1.5 h-4 w-3.5" />
            Back
          </button>
        ) : null}
        <TabsList>
          {tabs.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>

      {tabs.map((tab) => (
        <TabsContent key={tab.value} value={tab.value} className={cn(contentClasses)}>
          {tab.content}
        </TabsContent>
      ))}
    </Tabs>
  )
}

interface BlockEditorSectionProps extends Omit<React.ComponentProps<"section">, "title"> {
  heading?: React.ReactNode
  action?: React.ReactNode
  description?: React.ReactNode
  contentClassName?: string
}

function BlockEditorSection({
  heading,
  action,
  description,
  className,
  contentClassName,
  children,
  ...props
}: BlockEditorSectionProps) {
  return (
    <section className={cn("space-y-4", className)} {...props}>
      {heading || action || description ? (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-3">
            {heading ? <h3 className="text-base font-medium">{heading}</h3> : <div />}
            {action}
          </div>
          {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
        </div>
      ) : null}
      <div className={cn("space-y-4", contentClassName)}>{children}</div>
    </section>
  )
}

function BlockEditorEmptyState({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground",
        className
      )}
      {...props}
    />
  )
}

export {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  BlockTabs,
  BlockEditorSection,
  BlockEditorEmptyState,
}
