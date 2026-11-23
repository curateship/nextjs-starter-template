import { Tabs as TabsPrimitive } from "radix-ui"

import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"

/**
 * A three-column dashboard's row of three or more tabs (UI standard, "Tabs
 * follow their count"): words with a line under the one showing, sitting on
 * the header's bottom edge. Copied from Project's `UnderlineTabs`
 * (`apps/project/src/components/project/task-header-controls.tsx`) until it
 * moves to the shell. The row scrolls sideways rather than sliding under the
 * buttons beside it, which is also how it fits a phone.
 */
export function UnderlineTabs({
  value,
  onValueChange,
  tabs,
  label,
}: {
  value: string
  onValueChange: (value: string) => void
  tabs: { value: string; label: string }[]
  /** What the row switches between, read out: "View". */
  label: string
}) {
  return (
    <TabsPrimitive.Root
      value={value}
      onValueChange={onValueChange}
      // Out to the header's top and bottom edges, so the line sits on its divider.
      className="-my-3 flex min-w-0 flex-1 self-stretch"
    >
      <ScrollArea className="h-full min-w-0" viewportClassName="[&>div]:h-full">
        <div className="flex h-full w-max items-stretch px-1">
          <TabsPrimitive.List aria-label={label} className="flex items-stretch gap-5">
            {tabs.map((tab) => (
              <TabsPrimitive.Trigger
                key={tab.value}
                value={tab.value}
                className={cn(
                  "inline-flex items-center border-b-2 border-transparent text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors",
                  "hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  "data-[state=active]:border-foreground data-[state=active]:text-foreground"
                )}
              >
                {tab.label}
              </TabsPrimitive.Trigger>
            ))}
          </TabsPrimitive.List>
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </TabsPrimitive.Root>
  )
}
