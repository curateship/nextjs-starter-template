import * as React from "react"

import { TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"

export function WorkspacePanelHeaderIcon({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  return (
    <span
      className={cn(
        "flex size-4 shrink-0 items-center justify-center text-muted-foreground",
        className
      )}
      aria-hidden
    >
      {children}
    </span>
  )
}

/** The dashboard card header pattern, sized for resizable workspace panels. */
export function WorkspacePanelHeader({
  icon,
  title,
  meta,
  action,
  className,
}: {
  icon: React.ReactNode
  title: React.ReactNode
  meta?: React.ReactNode
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex h-[3.15rem] shrink-0 items-center gap-2.5 border-b border-foreground/10 px-4 sm:px-5",
        className
      )}
    >
      <WorkspacePanelHeaderIcon>{icon}</WorkspacePanelHeaderIcon>
      <h2 className="font-heading min-w-0 truncate text-[0.99rem] leading-snug font-medium">
        {title}
      </h2>
      {meta ? (
        <div className="min-w-0 truncate text-xs text-muted-foreground">
          {meta}
        </div>
      ) : null}
      {action ? <div className="ml-auto shrink-0">{action}</div> : null}
    </div>
  )
}

export function WorkspacePanelTabsHeader({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="shrink-0 border-b border-foreground/10 px-3">
      <TabsList className="-mb-px h-[3.15rem] w-full justify-start gap-4 rounded-none bg-transparent p-0">
        {children}
      </TabsList>
    </div>
  )
}

export function WorkspacePanelTab({
  icon,
  contentClassName,
  className,
  children,
  ...props
}: React.ComponentProps<typeof TabsTrigger> & {
  icon: React.ReactNode
  contentClassName?: string
}) {
  return (
    <TabsTrigger
      className={cn(
        "group/panel-tab h-full flex-none rounded-none border-b-2 border-transparent px-0.5 font-heading text-[0.88rem] font-medium text-muted-foreground data-[state=active]:border-foreground/75 data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none",
        className
      )}
      {...props}
    >
      <span className={cn("flex items-center gap-2", contentClassName)}>
        <WorkspacePanelHeaderIcon className="size-7 group-data-[state=active]/panel-tab:text-foreground">
          {icon}
        </WorkspacePanelHeaderIcon>
        {children}
      </span>
    </TabsTrigger>
  )
}
