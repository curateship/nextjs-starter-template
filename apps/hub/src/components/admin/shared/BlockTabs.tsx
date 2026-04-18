"use client"

import { useEffect, useState } from "react"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { ArrowLeft } from "lucide-react"
import { cn } from "@/lib/utils/tailwind"

interface Tab {
  value: string
  label: string
  content: React.ReactNode
}

interface BlockTabsProps {
  tabs: Tab[]
  defaultTab?: string
  onBack?: () => void
  className?: string
  headerClassName?: string
  contentClassName?: string
}

export function BlockTabs({
  tabs,
  defaultTab,
  onBack,
  className,
  headerClassName,
  contentClassName,
}: BlockTabsProps) {
  const [activeTab, setActiveTab] = useState(defaultTab || tabs[0]?.value || "content")
  const contentClasses = contentClassName === undefined ? "mt-0" : contentClassName

  useEffect(() => {
    if (!tabs.some((tab) => tab.value === activeTab)) {
      setActiveTab(defaultTab || tabs[0]?.value || "content")
    }
  }, [activeTab, defaultTab, tabs])

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className={cn("flex w-full flex-col gap-4", className)}>
      <div className={cn("flex items-center gap-2", headerClassName || "px-4 pt-3")}>
        {onBack && (
          <button
            onClick={onBack}
            className="inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 text-sm font-medium transition-all text-muted-foreground hover:bg-background hover:text-foreground hover:shadow-sm h-10 bg-muted"
          >
            <ArrowLeft className="w-3.5 h-4 mr-1.5" />
            Back
          </button>
        )}
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

export function BlockEditorSection({
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
      {(heading || action || description) && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-3">
            {heading ? <h3 className="text-base font-medium">{heading}</h3> : <div />}
            {action}
          </div>
          {description ? (
            <p className="text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
      )}
      <div className={cn("space-y-4", contentClassName)}>{children}</div>
    </section>
  )
}

export function BlockEditorEmptyState({
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
